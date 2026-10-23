# Laptop Remote

Control your whole laptop from your phone: see the screen live and tap to click, use the phone as a touchpad and keyboard, change the volume and media, open apps and websites, browse and transfer files, run terminal commands, close programs, and lock, sleep, restart or shut down.

There is nothing to install on the phone. It works in the phone's browser (Chrome, Safari, anything), and you can add it to your home screen so it opens like an app.

Works on **Windows, macOS and Linux**.

## Install and start (one time, about 2 minutes)

1. Install **Python 3.10 or newer** from <https://www.python.org/downloads/>.
   On Windows, tick **"Add python.exe to PATH"** in the installer.
2. Download this `laptop-remote` folder and put it anywhere (for example in Documents).
3. Start it:
   - **Windows:** double-click `Start Laptop Remote.bat`
   - **Mac:** double-click `Start Laptop Remote.command` (the first time, right-click → Open)
   - **Linux:** run `./start.sh`

   The first start downloads what it needs (about a minute). After that it starts instantly, even offline.
4. A page opens on the laptop with a **QR code** and a **6-digit PIN**.

## Connect your phone (one time)

1. Put your phone on the **same Wi-Fi** as the laptop.
2. Scan the QR code with the phone camera.
3. The phone will say the connection isn't private. Tap **Advanced → Proceed** (Chrome) or **Show Details → visit this website** (Safari). This is expected: the laptop made its own security certificate, so the connection *is* encrypted, it just isn't signed by a public authority.
4. Tap **Pair**. Done. The phone stays paired, so next time just open the same link (tip: "Add to Home Screen").

## Using it

| Tab | What you can do |
|---|---|
| **Screen** | Live view of the laptop. Tap = click, hold = right-click, drag = drag, two fingers = scroll. **Type** opens a keyboard with Ctrl/Alt/Win, arrows, F-keys and one-tap shortcuts (Copy, Paste, Switch app, Task manager…). Pick Fast/Balanced/Sharp quality, or go full screen. |
| **Touchpad** | Use the phone like a laptop touchpad. Tap to click, two-finger tap for right-click, two fingers to scroll, hold then move to drag. |
| **Controls** | Volume, mute, play/pause, next/previous. Open a website or app. Send text to and from the laptop's clipboard. Lock, screen off, sleep, sign out, restart, shut down. Battery, CPU, memory and disk. |
| **Files** | Browse every folder and drive. Open or save files to the phone, upload photos/files from the phone, make folders, delete. |
| **More** | A terminal to run any command. See running programs and close them. See and remove paired phones. |

Every action you take is shown in the laptop's console window and saved to `~/.laptop-remote/activity.log`.

## Keeping it safe

- **Only paired phones can do anything.** Pairing needs the PIN that is shown only on the laptop's own screen. Each PIN works once and expires after 10 minutes. After 5 wrong PINs, pairing locks.
- **Encrypted.** All traffic between phone and laptop uses HTTPS, so others on the same Wi-Fi can't see your screen or what you type.
- **Your network only.** Connections from the public internet are refused, even if your router exposes the port.
- **Other websites can't use it.** The login is a secure, same-site-only cookie, and every action checks the request came from the Laptop Remote page itself.
- **Nothing runs while it's closed.** Close the console window and nothing is listening any more.
- **Lost your phone?** Open the pairing page on the laptop (`http://127.0.0.1:8766` while it runs) and click **Remove**, or run `Start Laptop Remote` with `remove-all`.
- Risky actions (shut down, restart, delete, close a program) ask for confirmation on the phone.

Treat a paired phone like your laptop's password: anyone holding your unlocked phone can control the laptop. Keep a screen lock on your phone.

## Using it away from home

It only accepts connections from your own network on purpose. To use it from anywhere, install **[Tailscale](https://tailscale.com)** (free) on both the laptop and the phone, sign in to both, and open `https://<laptop's Tailscale IP>:8765` on the phone. Tailscale addresses are accepted, and nothing is exposed to the internet.

## First-time permissions

- **Mac:** the first time you use the screen or mouse, macOS asks for permission. Open **System Settings → Privacy & Security** and allow **Terminal** (or whichever app runs the script) under both **Screen Recording** and **Accessibility**, then restart Laptop Remote.
- **Windows:** if Windows Firewall asks, allow access on **Private networks**. If the phone can't connect, make sure your Wi-Fi is set to *Private*, not *Public*.
- **Linux:** screen and mouse control need an X11 session. On Wayland (the default on recent Ubuntu/Fedora), choose "Ubuntu on Xorg" on the login screen.

## Options

Run these from a terminal in this folder (`start.sh` on Mac/Linux, `"Start Laptop Remote.bat"` on Windows), or with `python -m laptop_remote`:

| Command | Does |
|---|---|
| `--port 9000` | Use a different port (the pairing page uses the next one) |
| `--no-browser` | Don't open the pairing page on start |
| `devices` | List paired phones |
| `remove <id>` | Unpair one phone |
| `remove-all` | Unpair every phone |

The certificate, paired phones and activity log live in `~/.laptop-remote` (on Windows `C:\Users\<you>\.laptop-remote`). Deleting that folder resets everything.

## Troubleshooting

- **Phone can't open the page:** check both are on the same Wi-Fi (not a guest network), and allow the app through the laptop's firewall. If the laptop shows several addresses, try the others.
- **"Could not start… already running":** another copy is open, or something else uses port 8765. Close it or use `--port 9000`.
- **Screen is black on Mac:** give Screen Recording permission (see above).
- **Mouse/keyboard does nothing on Mac:** give Accessibility permission.
- **PIN expired or locked:** click **New PIN** on the laptop's pairing page (a locked PIN can be renewed after 5 minutes).

## For developers

```
pip install -r requirements.txt pytest pytest-aiohttp
python -m pytest
```

`laptop_remote/server.py` is the phone-facing HTTPS server, `laptop_page.py` the localhost-only pairing page, `auth.py` the PIN pairing, `static/` the phone app.
