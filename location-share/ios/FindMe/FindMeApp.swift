import SwiftUI

@main
struct FindMeApp: App {
    // Created at launch, including when iOS relaunches the app in the background for a
    // significant location change, so sharing resumes without opening the app.
    @StateObject private var service = LocationService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(service)
        }
    }
}
