"""The pairing page shown on the laptop itself. Reachable only from this laptop."""

import html
import io
import time

import qrcode
import qrcode.image.svg
from aiohttp import web

from .auth import Pairing
from .system import SYSTEM

FIREWALL_TIP = ("<p class='muted'>Phone can't open the page? In Windows Settings → Network &amp; internet → "
                "Wi-Fi → your network, set <b>Network profile type</b> to <b>Private</b>.</p>")


def qr_svg(text: str) -> str:
    img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode()


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laptop Remote</title>
<style>
:root {{ color-scheme: light dark; --bg:#f5f6f8; --card:#fff; --text:#16181d; --muted:#5d6472; --accent:#2f6df6; --line:#e3e6eb; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#101216; --card:#1a1d23; --text:#eceef2; --muted:#9aa1ad; --line:#2a2e36; }} }}
body {{ margin:0; font:16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--text); }}
main {{ max-width:760px; margin:0 auto; padding:32px 16px; }}
h1 {{ font-size:26px; margin:0 0 4px; }}
.muted {{ color:var(--muted); }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; margin-top:20px; }}
.pair {{ display:flex; gap:28px; flex-wrap:wrap; align-items:center; }}
.qr {{ background:#fff; padding:8px; border-radius:12px; width:240px; height:240px; }}
.qr svg {{ width:100%; height:100%; }}
.pin {{ font-size:44px; font-weight:700; letter-spacing:8px; font-variant-numeric:tabular-nums; }}
code {{ background:var(--bg); padding:2px 6px; border-radius:6px; word-break:break-all; }}
ol {{ padding-left:20px; }} li {{ margin:6px 0; }}
button {{ font:inherit; border:0; border-radius:10px; padding:10px 16px; background:var(--accent); color:#fff; cursor:pointer; }}
button.ghost {{ background:transparent; color:#d33; border:1px solid var(--line); padding:6px 12px; }}
table {{ width:100%; border-collapse:collapse; }} td {{ padding:10px 4px; border-top:1px solid var(--line); }}
.warn {{ color:#b26a00; }}
</style></head><body><main>
<h1>Laptop Remote is running</h1>
<div class="muted">It runs only while it is open. To open this page again, unpair phones or quit, click the Laptop Remote icon near the clock. After you quit, no phone can reach this laptop.</div>
<div class="card">{pair_section}</div>
<div class="card"><h2 style="margin-top:0">Paired phones</h2>{devices}</div>
</main>
<script>
async function post(path, body) {{
  await fetch(path, {{method:'POST', headers:{{'Content-Type':'application/json'}}, body:JSON.stringify(body||{{}})}});
  location.reload();
}}
document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = () => {{
  if (confirm('Remove this phone? It will need a new PIN to connect again.')) post('/revoke', {{id:b.dataset.revoke}});
}});
const np = document.getElementById('newpin'); if (np) np.onclick = () => post('/new-pin');
setTimeout(() => location.reload(), 30000);
</script>
</body></html>"""


def build_laptop_app(pairing: Pairing, phone_url: str, fingerprint: str, port: int) -> web.Application:
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    @web.middleware
    async def local_only(request, handler):
        # Host check stops other websites from reading this page via DNS rebinding.
        if request.host not in allowed_hosts:
            return web.Response(status=403, text="Forbidden")
        if request.method == "POST" and request.headers.get("Origin") not in {f"http://{h}" for h in allowed_hosts}:
            return web.Response(status=403, text="Forbidden")
        response = await handler(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store"
        return response

    async def page(request):
        state = pairing.status()
        if state == "open":
            link = f"{phone_url}/?pin={pairing.pin}"
            minutes = max(1, int((pairing.expires - pairing.clock()) // 60))
            pair_section = f"""
            <div class="pair">
              <div class="qr">{qr_svg(link)}</div>
              <div>
                <div class="muted">Pairing PIN (works once, for {minutes} more min)</div>
                <div class="pin">{pairing.pin}</div>
                <ol>
                  <li>Connect your phone to the <b>same Wi-Fi</b> as this laptop.</li>
                  <li>Scan the QR code with your phone camera, or open <code>{html.escape(phone_url)}</code></li>
                  <li>Your phone will warn about the connection being private. Tap <b>Advanced</b> → <b>Proceed</b>.
                      This is expected: the laptop made its own security certificate.
                      <div class="muted">Certificate fingerprint starts with <code>{fingerprint}</code></div></li>
                  <li>Enter the PIN and tap <b>Pair</b>.</li>
                  <li>Tip: in the phone browser's menu, choose <b>Add to Home Screen</b> to get an app icon.</li>
                </ol>
                {{firewall_tip}}
              </div>
            </div>"""
            pair_section = pair_section.replace("{firewall_tip}", FIREWALL_TIP if SYSTEM == "Windows" else "")
        else:
            why = ("Pairing is locked because of too many wrong PINs."
                   if state == "locked" else "No pairing PIN is active.")
            button = "" if state == "locked" else '<button id="newpin">New PIN</button>'
            pair_section = f"""<h2 style="margin-top:0">Pair a new phone</h2>
            <p class="{'warn' if state == 'locked' else 'muted'}">{why}
            Already paired phones keep working at <code>{html.escape(phone_url)}</code></p>{button}"""

        rows = "".join(
            f"<tr><td><b>{html.escape(d['name'])}</b><div class='muted'>paired "
            f"{time.strftime('%d %b %Y', time.localtime(d['paired_at']))}, last used "
            f"{time.strftime('%d %b %H:%M', time.localtime(d['last_seen']))}</div></td>"
            f"<td style='text-align:right'><button class='ghost' data-revoke='{html.escape(i)}'>Remove</button></td></tr>"
            for i, d in pairing.store.devices.items()
        )
        devices = f"<table>{rows}</table>" if rows else "<p class='muted'>None yet.</p>"
        return web.Response(text=PAGE.format(pair_section=pair_section, devices=devices),
                            content_type="text/html")

    async def new_pin(request):
        if pairing.status() != "locked":
            pairing.new_pin()
        return web.json_response({"ok": True})

    async def revoke(request):
        data = await request.json()
        pairing.store.remove(str(data.get("id", "")))
        return web.json_response({"ok": True})

    app = web.Application(middlewares=[local_only])
    app.router.add_get("/", page)
    app.router.add_post("/new-pin", new_pin)
    app.router.add_post("/revoke", revoke)
    return app
