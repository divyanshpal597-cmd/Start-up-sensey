import Foundation
import Security

/// Persistent settings. The share id goes in the link given to the Android phone (read-only);
/// the write key never leaves this iPhone and proves uploads come from it.
enum Settings {
    static let defaultServer = "https://startup-sense-ai.netlify.app"

    private static let d = UserDefaults.standard

    static var server: String {
        get { d.string(forKey: "server") ?? defaultServer }
        set { d.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "server") }
    }

    static var isSharing: Bool {
        get { d.bool(forKey: "isSharing") }
        set { d.set(newValue, forKey: "isSharing") }
    }

    static var shareId: String { stableKey("shareId") }
    static var writeKey: String { stableKey("writeKey") }

    static var viewerLink: URL? { URL(string: "\(server)/find/#\(shareId)") }

    /// Forgets both keys, so the old link stops working and a new one is made.
    static func resetKeys() {
        d.removeObject(forKey: "shareId")
        d.removeObject(forKey: "writeKey")
    }

    private static func stableKey(_ name: String) -> String {
        if let v = d.string(forKey: name) { return v }
        let v = randomKey()
        d.set(v, forKey: name)
        return v
    }

    private static func randomKey() -> String {
        var bytes = [UInt8](repeating: 0, count: 24)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
