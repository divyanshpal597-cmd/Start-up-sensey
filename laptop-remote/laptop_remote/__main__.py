"""Start Laptop Remote:  python -m laptop_remote  [--port 8765] [devices | remove ID | remove-all]"""

import argparse
import asyncio
import logging
import logging.handlers
import os
import socket
import sys
import threading
import urllib.request
import webbrowser

from aiohttp import web

from . import autostart
from .auth import Pairing
from .config import DeviceStore, data_dir
from .laptop_page import build_laptop_app
from .server import build_app
from .system import SYSTEM
from .tls import ensure_certificate, fingerprint, ssl_context


def lan_ips() -> list[str]:
    ips = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packet is sent; this picks the Wi-Fi address
            ips.append(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    return ips or ["127.0.0.1"]


def manage_devices(args, store: DeviceStore) -> int:
    if args.command == "devices":
        if not store.devices:
            print("No paired phones.")
        for device_id, d in store.devices.items():
            print(f"{device_id}  {d['name']}")
    elif args.command == "remove":
        print("Removed." if store.remove(args.id) else "No device with that id.")
    elif args.command == "remove-all":
        print(f"Removed {store.clear()} device(s). Every phone must pair again.")
    return 0


def already_running(laptop_url: str) -> bool:
    try:
        with urllib.request.urlopen(laptop_url + "/", timeout=2) as r:
            return b"Laptop Remote" in r.read()
    except OSError:
        return False


class Remote:
    """The running servers, started on their own event loop."""

    def __init__(self, args):
        self.args = args
        self.folder = data_dir()
        self.store = DeviceStore(self.folder / "devices.json")
        self.laptop_url = f"http://127.0.0.1:{args.port + 1}"
        self.loop: asyncio.AbstractEventLoop | None = None
        self.stop_event: asyncio.Event | None = None
        self.pairing = Pairing(self.store, on_new_pin=self._show_pin)

    def _show_pin(self, pin: str) -> None:
        print(f"\n  New pairing PIN: {pin}   (see {self.laptop_url})\n", flush=True)

    async def serve(self, started: threading.Event | None = None) -> None:
        args = self.args
        self.loop = asyncio.get_running_loop()
        self.stop_event = asyncio.Event()
        ips = lan_ips()
        scheme = "http" if args.no_https else "https"
        phone_url = f"{scheme}://{ips[0]}:{args.port}"

        ssl_ctx = None
        fp = "(HTTPS is off)"
        if not args.no_https:
            cert, key = ensure_certificate(self.folder, ips)
            ssl_ctx = ssl_context(cert, key)
            fp = fingerprint(cert)

        phone_runner = web.AppRunner(build_app(self.pairing, args.allow_any_network), access_log=None)
        await phone_runner.setup()
        await web.TCPSite(phone_runner, args.host, args.port, ssl_context=ssl_ctx).start()

        laptop_runner = web.AppRunner(build_laptop_app(self.pairing, phone_url, fp, args.port + 1),
                                      access_log=None)
        await laptop_runner.setup()
        await web.TCPSite(laptop_runner, "127.0.0.1", args.port + 1).start()

        print("=" * 64)
        print("  Laptop Remote is running.")
        print(f"  On your phone (same Wi-Fi):  {phone_url}")
        for ip in ips[1:]:
            print(f"                           or  {scheme}://{ip}:{args.port}")
        print(f"  Pairing page on this laptop: {self.laptop_url}")
        if args.no_https:
            print("  WARNING: HTTPS is off. Others on your Wi-Fi could read the traffic.")
        print("=" * 64, flush=True)
        self.pairing.new_pin()
        if started:
            started.set()
        try:
            await self.stop_event.wait()
        finally:
            await phone_runner.cleanup()
            await laptop_runner.cleanup()

    def open_pairing_page(self) -> None:
        """From the tray: make sure a PIN is ready, then show the QR page."""
        async def fresh_pin():
            if self.pairing.status() == "expired":
                self.pairing.new_pin()
        if self.loop:
            try:
                asyncio.run_coroutine_threadsafe(fresh_pin(), self.loop).result(timeout=3)
            except Exception:
                pass
        webbrowser.open(self.laptop_url)

    def stop(self) -> None:
        if self.loop and self.stop_event:
            self.loop.call_soon_threadsafe(self.stop_event.set)


def run_with_tray(remote: Remote, open_page: bool) -> int:
    import pystray

    from .icon import draw

    started = threading.Event()
    failure: list[BaseException] = []

    def server_thread():
        try:
            asyncio.run(remote.serve(started))
        except BaseException as e:  # reported on the main thread
            failure.append(e)
            started.set()

    thread = threading.Thread(target=server_thread, daemon=True)
    thread.start()
    started.wait(30)
    if failure:
        raise failure[0]

    def toggle_autostart(icon, item):
        if autostart.is_enabled():
            autostart.disable()
        else:
            autostart.enable()

    def unpair_all(icon, item):
        count = remote.store.clear()
        try:
            icon.notify(f"{count} phone(s) unpaired. They need a new PIN to connect again.", "Laptop Remote")
        except Exception:
            pass

    def quit_app(icon, item):
        remote.stop()
        icon.stop()

    items = [pystray.MenuItem("Connect a phone…", lambda icon, item: remote.open_pairing_page(), default=True)]
    if autostart.supported():
        items.append(pystray.MenuItem("Start when I log in", toggle_autostart,
                                      checked=lambda item: autostart.is_enabled()))
    items.append(pystray.MenuItem("Unpair all phones", unpair_all))
    items.append(pystray.Menu.SEPARATOR)
    items.append(pystray.MenuItem("Quit Laptop Remote", quit_app))
    icon = pystray.Icon("LaptopRemote", draw(64), "Laptop Remote is running", pystray.Menu(*items))

    def setup(icon):
        icon.visible = True
        if open_page:
            remote.open_pairing_page()

    icon.run(setup=setup)
    remote.stop()
    thread.join(5)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="laptop-remote", description="Control this laptop from your phone.")
    parser.add_argument("--port", type=int, default=8765, help="phone port (the pairing page uses port+1)")
    parser.add_argument("--host", default="0.0.0.0", help="address to listen on (default: all)")
    parser.add_argument("--no-https", action="store_true", help="turn off encryption (not recommended)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the pairing page on start")
    parser.add_argument("--no-tray", action="store_true", help="run in this terminal without a tray icon")
    parser.add_argument("--autostart", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--allow-any-network", action="store_true",
                        help="accept connections from public internet addresses (not recommended)")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("devices", help="list paired phones")
    remove = sub.add_parser("remove", help="unpair one phone")
    remove.add_argument("id")
    sub.add_parser("remove-all", help="unpair every phone")
    # parse_known_args: macOS can add its own arguments when an app is opened from Finder.
    args, _ = parser.parse_known_args()

    folder = data_dir()
    if args.command:
        return manage_devices(args, DeviceStore(folder / "devices.json"))

    if getattr(sys, "frozen", False) and sys.stdout is None:
        # The installed app has no console window: keep its messages in a file.
        out = open(folder / "app.log", "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = out

    if SYSTEM == "Windows":
        try:  # real pixel coordinates, so taps land where they should on scaled displays
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass

    open_page = not (args.no_browser or args.autostart)
    laptop_url = f"http://127.0.0.1:{args.port + 1}"
    if already_running(laptop_url):
        if open_page:
            webbrowser.open(laptop_url)
        return 0

    log_path = folder / "activity.log"
    handler = logging.handlers.RotatingFileHandler(log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    try:
        os.chmod(log_path, 0o600)
    except OSError:
        pass
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    audit = logging.getLogger("laptop_remote.audit")
    audit.addHandler(handler)
    audit.setLevel(logging.INFO)
    audit.propagate = False
    logging.basicConfig(level=logging.WARNING)

    remote = Remote(args)

    use_tray = not args.no_tray
    if SYSTEM == "Linux" and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        use_tray = False
    if use_tray:
        try:
            import pystray  # noqa: F401
        except Exception as e:  # no desktop tray available: fall back to the console
            logging.warning("No tray icon (%s); running in the console.", e)
            use_tray = False

    try:
        if use_tray:
            return run_with_tray(remote, open_page)

        async def console():
            started = threading.Event()
            task = asyncio.create_task(remote.serve(started))
            while not started.is_set():
                await asyncio.sleep(0.05)
                if task.done():
                    return await task
            if open_page:
                webbrowser.open(laptop_url)
            print("  Press Ctrl+C or close this window to stop.", flush=True)
            await task
        asyncio.run(console())
    except KeyboardInterrupt:
        print("\nStopped.")
    except OSError as e:
        print(f"\nCould not start: {e}\nIs Laptop Remote already running? Try --port 9876.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
