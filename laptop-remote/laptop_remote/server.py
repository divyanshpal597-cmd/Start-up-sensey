"""The web server: the phone app (HTTPS, Wi-Fi) and the laptop's own pairing page (localhost only)."""

import asyncio
import concurrent.futures
import functools
import ipaddress
import json
import logging
import mimetypes
import os
import time
from pathlib import Path

from aiohttp import WSMsgType, web

from . import control, files, system
from .auth import Pairing
from .screen import ScreenGrabber

STATIC = Path(__file__).parent / "static"
COOKIE = "lr_token"
COOKIE_AGE = 365 * 24 * 3600

log = logging.getLogger("laptop_remote")
audit_log = logging.getLogger("laptop_remote.audit")


def is_local_network(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if getattr(addr, "ipv4_mapped", None):
        addr = addr.ipv4_mapped
    # Home Wi-Fi, this laptop, or a Tailscale / VPN address (100.64.0.0/10).
    return (addr.is_private or addr.is_loopback or addr.is_link_local
            or addr in ipaddress.ip_network("100.64.0.0/10"))


def audit(request: web.Request, action: str) -> None:
    device = request.get("device_name", "?")
    audit_log.info("%s | %s | %s", device, request.remote, action)
    print(f"  [{time.strftime('%H:%M:%S')}] {device}: {action}", flush=True)


def json_error(message: str, status: int = 400) -> web.Response:
    return web.json_response({"error": message}, status=status)


@web.middleware
async def security(request: web.Request, handler):
    app = request.app
    if not app["allow_any_network"] and not is_local_network(request.remote or ""):
        return web.Response(status=403, text="Laptop Remote only accepts connections from your own network.")

    is_write = request.method not in ("GET", "HEAD") or request.path == "/api/ws"
    if is_write:
        origin = request.headers.get("Origin")
        expected = f"{request.scheme}://{request.host}"
        if origin != expected:
            return json_error("Request blocked: wrong origin", 403)

    if request.path.startswith("/api/") and request.path not in ("/api/session", "/api/pair"):
        found = app["pairing"].check(request.cookies.get(COOKIE))
        if not found:
            return json_error("This phone is not paired", 401)
        request["device_id"], device = found
        request["device_name"] = device["name"]

    try:
        response = await handler(request)
    except web.HTTPException:
        raise
    except (ValueError, OSError) as e:
        response = json_error(str(e))
    except Exception as e:  # keep the server alive whatever a single action does
        log.exception("Action failed")
        response = json_error(f"Something went wrong: {e}", 500)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    )
    if request.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


async def run_blocking(request: web.Request, fn, *args):
    return await asyncio.get_running_loop().run_in_executor(request.app["pool"], functools.partial(fn, *args))


async def body(request: web.Request) -> dict:
    try:
        data = await request.json()
    except (ValueError, UnicodeDecodeError):
        raise ValueError("Invalid request")
    if not isinstance(data, dict):
        raise ValueError("Invalid request")
    return data


# ---------- pages ----------

async def index(request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


# ---------- pairing ----------

async def session(request: web.Request) -> web.Response:
    found = request.app["pairing"].check(request.cookies.get(COOKIE))
    return web.json_response({
        "paired": bool(found),
        "device": found[1]["name"] if found else None,
        "laptop": system.info()["name"],
        "pairing": request.app["pairing"].status(),
    })


async def pair(request: web.Request) -> web.Response:
    data = await body(request)
    result = request.app["pairing"].pair(str(data.get("pin", "")), str(data.get("name", "")))
    if isinstance(result, str):
        messages = {
            "wrong_pin": "That PIN is not right. Check the PIN on your laptop.",
            "locked": "Too many wrong PINs. Pairing is locked: on the laptop, click 'New PIN' after 5 minutes.",
            "expired": "The PIN expired. On the laptop, click 'New PIN'.",
        }
        print(f"  Pairing attempt from {request.remote} failed ({result}).", flush=True)
        return json_error(messages[result], 403 if result != "wrong_pin" else 400)
    device_id, token = result
    name = request.app["pairing"].store.devices[device_id]["name"]
    audit_log.info("%s | %s | paired", name, request.remote)
    print(f"\n  New phone paired: {name} ({request.remote})\n", flush=True)
    response = web.json_response({"ok": True})
    response.set_cookie(COOKIE, token, max_age=COOKIE_AGE, httponly=True,
                        secure=request.secure, samesite="Strict", path="/")
    return response


async def unpair(request: web.Request) -> web.Response:
    request.app["pairing"].store.remove(request["device_id"])
    audit(request, "unpaired itself")
    response = web.json_response({"ok": True})
    response.del_cookie(COOKIE, path="/")
    return response


async def devices(request: web.Request) -> web.Response:
    store = request.app["pairing"].store
    return web.json_response([
        {"id": i, "name": d["name"], "paired_at": d["paired_at"], "last_seen": d["last_seen"],
         "this": i == request["device_id"]}
        for i, d in store.devices.items()
    ])


async def revoke(request: web.Request) -> web.Response:
    data = await body(request)
    if not request.app["pairing"].store.remove(str(data.get("id", ""))):
        raise ValueError("No such device")
    audit(request, f"removed device {data.get('id')}")
    return web.json_response({"ok": True})


# ---------- system ----------

async def info(request: web.Request) -> web.Response:
    return web.json_response(await run_blocking(request, system.info))


async def power(request: web.Request) -> web.Response:
    action = str((await body(request)).get("action", ""))
    audit(request, f"power: {action}")
    await run_blocking(request, system.power, action)
    return web.json_response({"ok": True})


async def open_thing(request: web.Request) -> web.Response:
    data = await body(request)
    target = str(data.get("target", ""))
    if data.get("kind") == "url":
        audit(request, f"open website {target}")
        await run_blocking(request, system.open_url, target)
    else:
        audit(request, f"open {target}")
        await run_blocking(request, system.open_app, target)
    return web.json_response({"ok": True})


async def clipboard_get(request: web.Request) -> web.Response:
    return web.json_response({"text": await run_blocking(request, system.get_clipboard)})


async def clipboard_set(request: web.Request) -> web.Response:
    text = str((await body(request)).get("text", ""))
    await run_blocking(request, system.set_clipboard, text)
    audit(request, "set clipboard")
    return web.json_response({"ok": True})


async def processes(request: web.Request) -> web.Response:
    return web.json_response(await run_blocking(request, system.processes))


async def kill(request: web.Request) -> web.Response:
    pid = int((await body(request)).get("pid", 0))
    audit(request, f"close process {pid}")
    await run_blocking(request, system.kill, pid)
    return web.json_response({"ok": True})


async def run_command(request: web.Request) -> web.Response:
    data = await body(request)
    command = str(data.get("command", "")).strip()
    if not command:
        raise ValueError("Type a command")
    cwd = str(data.get("cwd") or Path.home())
    if not os.path.isdir(cwd):
        cwd = str(Path.home())
    audit(request, f"terminal: {command}")
    return web.json_response(await run_blocking(request, system.run_command, command, cwd))


# ---------- files ----------

async def file_roots(request: web.Request) -> web.Response:
    return web.json_response(files.roots())


async def file_list(request: web.Request) -> web.Response:
    hidden = request.query.get("hidden") == "1"
    return web.json_response(await run_blocking(request, files.listing, request.query.get("path", ""), hidden))


async def file_download(request: web.Request) -> web.StreamResponse:
    path = files.resolve(request.query.get("path", ""))
    if not path.is_file():
        raise ValueError("Not a file")
    audit(request, f"download {path}")
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    disposition = "inline" if request.query.get("view") == "1" else "attachment"
    quoted = path.name.replace('"', "")
    return web.FileResponse(path, headers={
        "Content-Type": ctype,
        "Content-Disposition": f'{disposition}; filename="{quoted}"',
        # Files from disk are shown as-is, never run as part of this site.
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    })


async def file_upload(request: web.Request) -> web.Response:
    folder = files.resolve(request.query.get("path", ""))
    if not folder.is_dir():
        raise ValueError("Not a folder")
    reader = await request.multipart()
    saved = []
    while (part := await reader.next()) is not None:
        if not part.filename:
            continue
        target = files.unique(files.safe_child(folder, part.filename))
        with open(target, "wb") as f:
            while chunk := await part.read_chunk(1 << 20):
                f.write(chunk)
        saved.append(target.name)
    audit(request, f"upload {', '.join(saved)} to {folder}")
    return web.json_response({"saved": saved})


async def file_mkdir(request: web.Request) -> web.Response:
    data = await body(request)
    created = files.make_folder(str(data.get("path", "")), str(data.get("name", "")))
    audit(request, f"new folder {created}")
    return web.json_response({"ok": True})


async def file_delete(request: web.Request) -> web.Response:
    path = str((await body(request)).get("path", ""))
    audit(request, f"delete {path}")
    await run_blocking(request, files.delete, path)
    return web.json_response({"ok": True})


# ---------- live control (WebSocket) ----------

def handle_input(msg: dict, monitor: dict) -> None:
    kind = msg.get("t")
    if kind == "move":
        control.move_relative(float(msg["dx"]), float(msg["dy"]))
    elif kind == "abs":
        control.move_absolute(float(msg["x"]), float(msg["y"]), monitor)
    elif kind == "click":
        if "x" in msg:
            control.move_absolute(float(msg["x"]), float(msg["y"]), monitor)
        control.click(str(msg.get("b", "left")), int(msg.get("n", 1)))
    elif kind == "down":
        control.press(str(msg.get("b", "left")))
    elif kind == "up":
        control.release(str(msg.get("b", "left")))
    elif kind == "scroll":
        control.scroll(float(msg.get("dx", 0)), float(msg.get("dy", 0)))
    elif kind == "type":
        control.type_text(str(msg.get("text", "")))
    elif kind == "keys":
        control.press_keys([str(k) for k in msg.get("keys", [])])


async def websocket(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=1 << 20)
    await ws.prepare(request)
    print(f"  {request['device_name']} connected for live control.", flush=True)
    loop = asyncio.get_running_loop()
    # Screen capture and input each stay on one thread of their own.
    grab_thread = concurrent.futures.ThreadPoolExecutor(1)
    input_thread = concurrent.futures.ThreadPoolExecutor(1)
    grabber = ScreenGrabber()
    state = {"monitor": None}

    async def current_monitor(index: int) -> dict:
        monitors = await loop.run_in_executor(grab_thread, grabber.monitors)
        return monitors[min(max(index, 0), len(monitors) - 1)]

    try:
        async for message in ws:
            if message.type != WSMsgType.TEXT:
                continue
            try:
                msg = json.loads(message.data)
                kind = msg.get("t")
                if kind == "frame":
                    width = min(max(int(msg.get("w", 1280)), 320), 3840)
                    quality = min(max(int(msg.get("q", 60)), 20), 95)
                    jpeg, monitor = await loop.run_in_executor(
                        grab_thread, grabber.grab, int(msg.get("m", 0)), width, quality)
                    state["monitor"] = monitor
                    await ws.send_bytes(jpeg)
                elif kind == "monitors":
                    monitors = await loop.run_in_executor(grab_thread, grabber.monitors)
                    await ws.send_json({"t": "monitors", "monitors": [
                        {"width": m["width"], "height": m["height"]} for m in monitors]})
                else:
                    if state["monitor"] is None or "m" in msg:
                        state["monitor"] = await current_monitor(int(msg.get("m", 0)))
                    await loop.run_in_executor(input_thread, handle_input, msg, state["monitor"])
            except Exception as e:  # a bad message must not drop the connection
                log.debug("ws message failed: %s", e)
                if not ws.closed:
                    await ws.send_json({"t": "error", "error": str(e)})
    finally:
        await loop.run_in_executor(grab_thread, grabber.close)
        grab_thread.shutdown(wait=False)
        input_thread.shutdown(wait=False)
        print(f"  {request['device_name']} disconnected.", flush=True)
    return ws


def build_app(pairing: Pairing, allow_any_network: bool = False) -> web.Application:
    app = web.Application(middlewares=[security], client_max_size=1024 ** 3 * 4)
    app["pairing"] = pairing
    app["allow_any_network"] = allow_any_network
    app["pool"] = concurrent.futures.ThreadPoolExecutor(8)
    app.router.add_get("/", index)
    app.router.add_static("/static/", STATIC)
    app.router.add_get("/api/session", session)
    app.router.add_post("/api/pair", pair)
    app.router.add_post("/api/unpair", unpair)
    app.router.add_get("/api/devices", devices)
    app.router.add_post("/api/devices/revoke", revoke)
    app.router.add_get("/api/info", info)
    app.router.add_post("/api/power", power)
    app.router.add_post("/api/open", open_thing)
    app.router.add_get("/api/clipboard", clipboard_get)
    app.router.add_post("/api/clipboard", clipboard_set)
    app.router.add_get("/api/processes", processes)
    app.router.add_post("/api/kill", kill)
    app.router.add_post("/api/exec", run_command)
    app.router.add_get("/api/files/roots", file_roots)
    app.router.add_get("/api/files", file_list)
    app.router.add_get("/api/files/download", file_download)
    app.router.add_post("/api/files/upload", file_upload)
    app.router.add_post("/api/files/mkdir", file_mkdir)
    app.router.add_post("/api/files/delete", file_delete)
    app.router.add_get("/api/ws", websocket)

    async def close_pool(app):
        app["pool"].shutdown(wait=False)
    app.on_cleanup.append(close_pool)
    return app
