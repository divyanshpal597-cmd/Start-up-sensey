# FindMe: show where your iPhone is on your Android phone

There are three parts:

| Part | Where | What it does |
|---|---|---|
| iPhone app | `location-share/ios` (SwiftUI) | Tracks the iPhone's location in the background and uploads it |
| Server | `netlify/functions/location.mts` → `/api/location` | Keeps the latest position and the last 24 h of track (Netlify Blobs, no database setup) |
| Android viewer | `public/find/index.html` → `https://startup-sense-ai.netlify.app/find/` | Live map that refreshes every 10 s. Opens in Chrome, nothing to install |

## 1. Deploy the server
Merge this branch into `main`. The existing deploy workflow publishes `/api/location` and `/find/`.
It needs no new environment variables.

## 2. Install the app on the iPhone
Apple only lets you install your own apps from a **Mac with Xcode**.

1. On the Mac, install Xcode (App Store) and XcodeGen: `brew install xcodegen`.
2. `cd location-share/ios && xcodegen`, then open `FindMe.xcodeproj`.
3. Select the **FindMe** target → *Signing & Capabilities* → pick your Apple ID as the Team, and
   change the bundle id `com.example.findme` to something unique (e.g. `com.yourname.findme`).
4. Plug in the iPhone, choose it as the run destination, press **Run**.
5. On the iPhone: *Settings → General → VPN & Device Management* → trust your developer certificate.
   Also turn on *Settings → Privacy & Security → Developer Mode* if iOS asks.

With a **free Apple ID** the app stops opening after 7 days. Plug the phone back in and press Run again
to renew it. A paid Apple Developer account ($99/year) makes it last a year, or you can use TestFlight.

**No XcodeGen?** In Xcode, create a new *iOS App* project named FindMe (SwiftUI), delete the generated
Swift files, drag in the four `.swift` files from `ios/FindMe`, and set *Build Settings → Info.plist File*
to the included `Info.plist` (or copy its location keys and the `location` background mode into yours).

## 3. Start sharing
1. Open FindMe, switch on **Share my location**, allow location, then choose **Change to Always Allow**
   when iOS asks (or set it in *Settings → FindMe → Location → Always*, with *Precise Location* on).
2. Tap **Send link to Android** (WhatsApp, SMS, email…) or scan the QR code with the Android camera.
3. On Android, open the link in Chrome. Use ⋮ → **Add to Home screen** to get an app icon.
   The page remembers the link, so the icon opens straight to the map.

## How "all the time" works, and its limits
- The app uses continuous background location (`allowsBackgroundLocationUpdates`) plus
  significant-location-change monitoring. That way iOS relaunches it after a reboot or after the
  system terminates it.
- Points are queued while offline and uploaded when the connection comes back.
- iOS always shows the blue location pill while the app tracks in the background. This cannot be hidden.
- Updates stop if the iPhone is off, has no battery, or has no internet for a long time.
  Low Power Mode or swiping the app away in the app switcher can also stop them; just open the app again.
  The Android map then shows the last known position and how long ago it was sent.
- Anyone with the link can see the location. **Stop sharing and erase from server** deletes the history
  and makes a new link.

## API
All ids are sent in headers, so they never appear in URLs or logs.

| Method | Headers | Body / result |
|---|---|---|
| `POST /api/location` | `x-share-id`, `x-write-key` | `{ points: [{lat, lon, acc, alt, spd, crs, ts}], battery, charging, device }`. The first upload claims the share id for that write key |
| `GET /api/location` | `x-share-id` | `{ latest, track, battery, charging, device, serverTime }` |
| `DELETE /api/location` | `x-share-id`, `x-write-key` | Erases everything for that share id |
