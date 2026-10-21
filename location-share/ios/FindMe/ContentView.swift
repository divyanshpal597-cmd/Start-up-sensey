import CoreImage.CIFilterBuiltins
import CoreLocation
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var service: LocationService
    @State private var server = Settings.server
    @State private var confirmErase = false
    @State private var linkVersion = 0 // bumps after a reset so the link and QR code refresh

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle(isOn: Binding(get: { service.isSharing }, set: { service.setSharing($0) })) {
                        Label("Share my location", systemImage: "location.fill")
                    }
                    .tint(.blue)
                    statusRows
                } footer: {
                    Text("While sharing is on, the blue location pill shows at the top of the screen. That is iOS telling you this app is using your location.")
                }

                permissionSection

                Section("Open this on your Android phone") {
                    if let link = Settings.viewerLink {
                        let _ = linkVersion
                        Text(link.absoluteString)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                        ShareLink(item: link) { Label("Send link to Android", systemImage: "square.and.arrow.up") }
                        if let qr = qrCode(link.absoluteString) {
                            Image(uiImage: qr)
                                .interpolation(.none)
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: 220)
                                .frame(maxWidth: .infinity)
                                .accessibilityLabel("QR code of the link")
                        }
                    }
                    Text("Anyone with this link can see your location. Only send it to your own phone or people you trust.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Server") {
                    TextField("Server address", text: $server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Settings.server = server; linkVersion += 1 }
                    Button("Stop sharing and erase from server", role: .destructive) { confirmErase = true }
                }
            }
            .navigationTitle("FindMe")
            .confirmationDialog("Erase shared location?", isPresented: $confirmErase, titleVisibility: .visible) {
                Button("Erase and make a new link", role: .destructive) {
                    Task { await service.eraseAndReset(); linkVersion += 1 }
                }
            } message: {
                Text("Your location history is deleted from the server and the old link stops working.")
            }
        }
    }

    @ViewBuilder private var statusRows: some View {
        if let loc = service.lastLocation {
            LabeledContent("Position", value: String(format: "%.5f, %.5f  (±%.0f m)", loc.coordinate.latitude, loc.coordinate.longitude, loc.horizontalAccuracy))
        }
        if let at = service.lastUploadAt {
            LabeledContent("Last sent") { Text(at, style: .relative) + Text(" ago") }
        }
        if service.pendingCount > 0 {
            LabeledContent("Waiting to send", value: "\(service.pendingCount) points")
        }
        if let err = service.lastError {
            Text(err).font(.footnote).foregroundStyle(.red)
        }
    }

    @ViewBuilder private var permissionSection: some View {
        switch service.authorization {
        case .authorizedAlways where service.preciseLocation:
            EmptyView()
        case .authorizedAlways:
            Section { settingsHint("Turn on Precise Location so your Android phone sees your exact position.") }
        case .authorizedWhenInUse:
            Section { settingsHint("Location is set to “While Using the App”. Change it to “Always” so sharing keeps working when the app is closed.") }
        case .denied, .restricted:
            Section { settingsHint("Location access is off for FindMe. Allow it (choose “Always”) to share your location.") }
        default:
            EmptyView()
        }
    }

    private func settingsHint(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text).font(.footnote)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
        }
    }

    private func qrCode(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        guard let out = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
