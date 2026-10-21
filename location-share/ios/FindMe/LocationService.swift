import CoreLocation
import UIKit

/// Tracks the iPhone's location (also in the background) and uploads it to /api/location.
@MainActor
final class LocationService: NSObject, ObservableObject {
    static let shared = LocationService()

    @Published private(set) var isSharing = Settings.isSharing
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var preciseLocation = true
    @Published private(set) var lastLocation: CLLocation?
    @Published private(set) var lastUploadAt: Date?
    @Published private(set) var lastError: String?
    @Published private(set) var pendingCount = 0

    private let manager = CLLocationManager()
    private var pending: [[String: Any]] = []
    private var lastQueued: CLLocation?
    private var uploading = false
    private var heartbeat: Timer?
    private var backgroundSession: AnyObject? // CLBackgroundActivitySession on iOS 17+

    /// A new point is queued when the phone has moved this far, or this long has passed.
    private let minDistance: CLLocationDistance = 10
    private let minInterval: TimeInterval = 30
    /// While standing still iOS sends no updates (distance filter), so the current position
    /// is re-sent this often to show the viewer the phone is still reporting.
    private let heartbeatInterval: TimeInterval = 120
    private let maxPending = 500

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = minDistance
        manager.activityType = .other
        manager.pausesLocationUpdatesAutomatically = false
        UIDevice.current.isBatteryMonitoringEnabled = true
        authorization = manager.authorizationStatus
        preciseLocation = manager.accuracyAuthorization == .fullAccuracy
        if isSharing { startTracking() }
    }

    func setSharing(_ on: Bool) {
        isSharing = on
        Settings.isSharing = on
        if on {
            requestPermission()
            startTracking()
        } else {
            stopTracking()
        }
    }

    /// Stops sharing and deletes everything stored on the server; the next start uses a new link.
    func eraseAndReset() async {
        setSharing(false)
        pending.removeAll()
        pendingCount = 0
        _ = try? await URLSession.shared.data(for: request(method: "DELETE"))
        Settings.resetKeys()
        lastUploadAt = nil
        lastLocation = nil
        objectWillChange.send()
    }

    func requestPermission() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse: manager.requestAlwaysAuthorization()
        default: break
        }
    }

    private func startTracking() {
        guard manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else { return }
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        // Lets iOS relaunch the app after a reboot or after it was terminated.
        manager.startMonitoringSignificantLocationChanges()
        if #available(iOS 17.0, *), backgroundSession == nil {
            backgroundSession = CLBackgroundActivitySession()
        }
        heartbeat?.invalidate()
        heartbeat = Timer.scheduledTimer(withTimeInterval: heartbeatInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.sendHeartbeat() }
        }
    }

    private func stopTracking() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.allowsBackgroundLocationUpdates = false
        heartbeat?.invalidate()
        heartbeat = nil
        if #available(iOS 17.0, *) {
            (backgroundSession as? CLBackgroundActivitySession)?.invalidate()
        }
        backgroundSession = nil
    }

    private func sendHeartbeat() {
        guard let loc = manager.location, Date().timeIntervalSince(loc.timestamp) >= minInterval else { return }
        // Location services are running and haven't reported a move of minDistance, so the
        // phone is still within that distance of this fix right now.
        handle([CLLocation(coordinate: loc.coordinate, altitude: loc.altitude,
                           horizontalAccuracy: loc.horizontalAccuracy, verticalAccuracy: loc.verticalAccuracy,
                           course: -1, speed: 0, timestamp: Date())])
    }

    private func handle(_ locations: [CLLocation]) {
        guard isSharing else { return }
        for loc in locations where loc.horizontalAccuracy >= 0 {
            lastLocation = loc
            if let prev = lastQueued,
               loc.distance(from: prev) < minDistance,
               loc.timestamp.timeIntervalSince(prev.timestamp) < minInterval {
                continue
            }
            lastQueued = loc
            pending.append([
                "lat": loc.coordinate.latitude,
                "lon": loc.coordinate.longitude,
                "acc": loc.horizontalAccuracy,
                "alt": loc.verticalAccuracy >= 0 ? loc.altitude : NSNull(),
                "spd": loc.speed >= 0 ? loc.speed : NSNull(),
                "crs": loc.course >= 0 ? loc.course : NSNull(),
                "ts": Int(loc.timestamp.timeIntervalSince1970 * 1000),
            ])
        }
        if pending.count > maxPending { pending.removeFirst(pending.count - maxPending) }
        pendingCount = pending.count
        Task { await flush() }
    }

    private func request(method: String) -> URLRequest {
        var req = URLRequest(url: URL(string: "\(Settings.server)/api/location")!)
        req.httpMethod = method
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.setValue(Settings.shareId, forHTTPHeaderField: "x-share-id")
        req.setValue(Settings.writeKey, forHTTPHeaderField: "x-write-key")
        return req
    }

    private func flush() async {
        guard !uploading, !pending.isEmpty else { return }
        uploading = true
        defer { uploading = false }

        // Keeps the upload alive if iOS moves the app to the background mid-request.
        let bgTask = UIApplication.shared.beginBackgroundTask(withName: "upload-location")
        defer { UIApplication.shared.endBackgroundTask(bgTask) }

        let batch = Array(pending.prefix(100))
        let device = UIDevice.current
        var body: [String: Any] = ["points": batch, "device": device.name]
        if device.batteryLevel >= 0 { body["battery"] = Double(device.batteryLevel) }
        body["charging"] = device.batteryState == .charging || device.batteryState == .full

        var req = request(method: "POST")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(code) {
                pending.removeFirst(min(batch.count, pending.count))
                lastUploadAt = Date()
                lastError = nil
            } else {
                let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                    .flatMap { ($0["error"] as? [String: Any])?["message"] as? String }
                lastError = msg ?? "Server returned \(code)"
                if (400..<500).contains(code) && code != 429 { pending.removeFirst(min(batch.count, pending.count)) }
            }
        } catch {
            lastError = "Offline – will retry (\(error.localizedDescription))"
        }
        pendingCount = pending.count
        if lastError == nil && !pending.isEmpty { await flush() }
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in self.handle(locations) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            if (error as? CLError)?.code != .locationUnknown { self.lastError = error.localizedDescription }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            self.authorization = manager.authorizationStatus
            self.preciseLocation = manager.accuracyAuthorization == .fullAccuracy
            if self.authorization == .authorizedWhenInUse && self.isSharing {
                // Second step: upgrade to "Always" so sharing keeps running in the background.
                manager.requestAlwaysAuthorization()
            }
            if self.isSharing { self.startTracking() }
        }
    }
}
