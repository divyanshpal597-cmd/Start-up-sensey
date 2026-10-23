"""Start Laptop Remote:  python -m laptop_remote  [--port 8765] [devices | remove ID | remove-all]"""

import argparse
import asyncio
import logging
import logging.handlers
import os
import socket
import sys
import webbrowser

from aiohttp import web

from .auth import Pairing
from .config import DeviceStore, data_dir
from .laptop_page import build_laptop_app
from .server import build_app
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


async def serve(args) -> None:
    folder = data_dir()
    store = DeviceStore(folder / "devices.json")
    ips = lan_ips()
    scheme = "http" if args.no_https else "https"
    phone_url = f"{scheme}://{ips[0]}:{args.port}"
    laptop_url = f"http://127.0.0.1:{args.port + 1}"

    def show_pin(pin: str) -> None:
        print(f"\n  New pairing PIN: {pin}   (see {laptop_url})\n", flush=True)

    pairing = Pairing(store, on_new_pin=show_pin)

    ssl_ctx = None
    fp = "(HTTPS is off)"
    if not args.no_https:
        cert, key = ensure_certificate(folder, ips)
        ssl_ctx = ssl_context(cert, key)
        fp = fingerprint(cert)

    phone_runner = web.AppRunner(build_app(pairing, args.allow_any_network), access_log=None)
    await phone_runner.setup()
    await web.TCPSite(phone_runner, args.host, args.port, ssl_context=ssl_ctx).start()

    laptop_runner = web.AppRunner(build_laptop_app(pairing, phone_url, fp, args.port + 1), access_log=None)
    await laptop_runner.setup()
    await web.TCPSite(laptop_runner, "127.0.0.1", args.port + 1).start()

    print("=" * 64)
    print("  Laptop Remote is running.")
    print(f"  On your phone (same Wi-Fi):  {phone_url}")
    for ip in ips[1:]:
        print(f"                           or  {scheme}://{ip}:{args.port}")
    print(f"  Pairing page on this laptop: {laptop_url}")
    if args.no_https:
        print("  WARNING: HTTPS is off. Others on your Wi-Fi could read the traffic.")
    print("  Press Ctrl+C or close this window to stop.")
    print("=" * 64, flush=True)
    pairing.new_pin()
    if not args.no_browser:
        webbrowser.open(laptop_url)

    await asyncio.Event().wait()


def main() -> int:
    parser = argparse.ArgumentParser(prog="laptop-remote", description="Control this laptop from your phone.")
    parser.add_argument("--port", type=int, default=8765, help="phone port (the pairing page uses port+1)")
    parser.add_argument("--host", default="0.0.0.0", help="address to listen on (default: all)")
    parser.add_argument("--no-https", action="store_true", help="turn off encryption (not recommended)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the pairing page on start")
    parser.add_argument("--allow-any-network", action="store_true",
                        help="accept connections from public internet addresses (not recommended)")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("devices", help="list paired phones")
    remove = sub.add_parser("remove", help="unpair one phone")
    remove.add_argument("id")
    sub.add_parser("remove-all", help="unpair every phone")
    args = parser.parse_args()

    folder = data_dir()
    if args.command:
        return manage_devices(args, DeviceStore(folder / "devices.json"))

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

    try:
        asyncio.run(serve(args))
    except KeyboardInterrupt:
        print("\nStopped.")
    except OSError as e:
        print(f"\nCould not start: {e}\nIs Laptop Remote already running? Try --port 9876.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
