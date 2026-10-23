# Laptop Remote

Control your whole laptop from your phone: see the screen live and tap to click, use the phone as a touchpad and keyboard, change the volume and media, open apps and websites, browse and transfer files, run terminal commands, close programs, and lock, sleep, restart or shut down.

There is nothing to install on the phone. It works in the phone's browser (Chrome, Safari, anything), and you can add it to your home screen so it opens like an app.

Works on **Windows, macOS and Linux**.

## Install (one time)

Download the file for your laptop from the **[Laptop Remote (latest)](https://github.com/divyanshpal597-cmd/Start-up-sensey/releases/tag/laptop-remote-latest)** page. You don't need Python or anything else.

**Windows**
1. Download **LaptopRemote-Setup.exe** and open it.
2. If a blue "Windows protected your PC" box appears, click **More info → Run anyway**. It appears because the app isn't signed with a paid certificate.
3. Click **Next → Install**, keep **"Start Laptop Remote and connect my phone"** ticked, and click **Finish**.

**Mac** (Apple M1/M2/M3/M4)
1. Download **LaptopRemote-mac.dmg**, open it, and drag **Laptop Remote** into **Applications**.
2. Open it from Applications. If macOS says it can't check the app, open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.
3. When asked, allow **Screen Recording** and **Accessibility** for Laptop Remote, then quit it from its menu-bar icon and open it again.

**Linux**
1. Download **LaptopRemote-linux**, right-click it → Properties → allow running as a program (or `chmod +x LaptopRemote-linux`), and run it.

The installer sets everything up for you:
- On Windows it lets your phone through the firewall on home (Private) Wi-Fi.
- The first time it runs, it opens the page with the QR code for connecting your phone.
- While it runs, it sits quietly as an icon near the clock (the menu bar on a Mac).

**It only runs when you open it.** Open **Laptop Remote** from the Start menu / desktop / Applications when you want to use your phone, and click the icon → **Quit** when you're done. After you quit, nothing is listening and no phone can reach the laptop. If you'd like it to start every time you log in, tick **Start when I log in** in the icon's menu (off by default).

The icon's menu: **Connect a phone…**, **Start when I log in**, **Unpair all phones**, **Quit**.

## Using it

| Tab | What you can do |
|---|---|
| **Screen** | Live view of the laptop. Tap = click, hold = right-click, drag = drag, two fingers = scroll. **Type** opens a keyboard with Ctrl/Alt/Win, arrows, F-keys and one-tap shortcuts (Copy, Paste, Switch app, Task manager…). Pick Fast/Balanced/Sharp quality, or go full screen. |
| **Touchpad** | Use the phone like a laptop touchpad. Tap to click, two-finger tap for right-click, two fingers to scroll, hold then move to drag. |
| **Controls** | Volume, mute, play/pause, next/previous. Open a website or app. Send text to and from the laptop's clipboard. Lock, screen off, sleep, sign out, restart, shut down. Battery, CPU, memory and disk. |
| **Files** | Browse every folder and drive. Open or save files to the phone, upload photos/files from the phone, make folders, delete. |
| **More** | A terminal to run any command. See running programs and close them. See and remove paired phones. |

Every action you take is saved to `~/.laptop-remote/activity.log` on the laptop.

## Keeping it safe

- **Only paired phones can do anything.** Pairing needs the PIN that is shown only on the laptop's own screen. Each PIN works once and expires after 10 minutes. After 5 wrong PINs, pairing locks.
- **Encrypted.** All traffic between phone and laptop uses HTTPS, so others on the same Wi-Fi can't see your screen or what you type.
- **Your network only.** Connections from the public internet are refused, even if your router exposes the port.
- **Other websites can't use it.** The login is a secure, same-site-only cookie, and every action checks the request came from the Laptop Remote page itself.
- **Off when you close it.** Tray icon → **Quit** stops it completely: nothing keeps running in the background and no phone can connect until you open it again.
- **Lost your phone?** On the laptop, click the tray icon → **Unpair all phones** (or **Connect a phone…** → **Remove** next to that phone).
- **Uninstalling removes everything it added:** the app, the firewall rule and the start-at-login entry. Your settings folder `~/.laptop-remote` can be deleted by hand.
- Risky actions (shut down, restart, delete, close a program) ask for confirmation on the phone.

Treat a paired phone like your laptop's password: anyone holding your unlocked phone can control the laptop. Keep a screen lock on your phone.

## Using it away from home

It only accepts connections from your own network on purpose. To use it from anywhere, install **[Tailscale](https://tailscale.com)** (free) on both the laptop and the phone, sign in to both, and open `https://<laptop's Tailscale IP>:8765` on the phone. Tailscale addresses are accepted, and nothing is exposed to the internet.

## First-time permissions

- **Mac:** the first time you use the screen or mouse, macOS asks for permission. Open **System Settings → Privacy & Security** and allow **Laptop Remote** under both **Screen Recording** and **Accessibility**, then quit and reopen it.
- **Windows:** if Windows Firewall asks, allow access on **Private networks**. If the phone can't connect, make sure your Wi-Fi is set to *Private*, not *Public*.
- **Linux:** screen and mouse control need an X11 session. On Wayland (the default on recent Ubuntu/Fedora), choose "Ubuntu on Xorg" on the login screen.

## Running from source instead

If you prefer not to use the installer (or have an Intel Mac), install Python 3.10+ and double-click `Start Laptop Remote.bat` (Windows) or `Start Laptop Remote.command` (Mac), or run `./start.sh` (Linux).

## Options

Pass these to the app (or to the start scripts / `python -m laptop_remote`):

| Command | Does |
|---|---|
| `--port 9000` | Use a different port (the pairing page uses the next one) |
| `--no-browser` | Don't open the pairing page on start |
| `devices` | List paired phones |
| `remove <id>` | Unpair one phone |
| `remove-all` | Unpair every phone |

The certificate, paired phones and activity log live in `~/.laptop-remote` (on Windows `C:\Users\<you>\.laptop-remote`). Deleting that folder resets everything.

## Troubleshooting

- **Phone can't open the page:** check both are on the same Wi-Fi (not a guest network). On Windows, set the Wi-Fi's **Network profile type** to **Private** (Settings → Network & internet → Wi-Fi → your network).
- **Home-screen icon stopped working:** the laptop's Wi-Fi address changed (for example, on a different network). Click the tray icon → **Connect a phone…** and scan the new QR code.
- **"Could not start… already running":** another copy is open, or something else uses port 8765. Close it or use `--port 9000`.
- **Screen is black on Mac:** give Screen Recording permission (see above).
- **Mouse/keyboard does nothing on Mac:** give Accessibility permission.
- **PIN expired or locked:** click **New PIN** on the laptop's pairing page (a locked PIN can be renewed after 5 minutes).

## For developers

```
pip install -r requirements.txt pytest pytest-aiohttp
python -m pytest
pip install pyinstaller && python packaging/build.py   # builds the installer for this OS
```

Every push that changes `laptop-remote/` runs `.github/workflows/laptop-remote.yml`, which tests, builds Windows/Mac/Linux apps and updates the release page.

`laptop_remote/server.py` is the phone-facing HTTPS server, `laptop_page.py` the localhost-only pairing page, `auth.py` the PIN pairing, `static/` the phone app.
