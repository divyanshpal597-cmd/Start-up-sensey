import aiohttp
import pytest
from aiohttp import web

from laptop_remote import auth
from laptop_remote.auth import Pairing
from laptop_remote.config import DeviceStore
from laptop_remote.server import build_app, is_local_network


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def pairing(tmp_path):
    p = Pairing(DeviceStore(tmp_path / "devices.json"), clock=Clock())
    p.new_pin()
    return p


@pytest.fixture
async def client(aiohttp_client, pairing):
    app = build_app(pairing)
    c = await aiohttp_client(app)
    c.origin = {"Origin": f"http://{c.server.host}:{c.server.port}"}
    return c


# ---------- pairing ----------

def test_pin_is_single_use(pairing):
    pin = pairing.pin
    device_id, token = pairing.pair(pin, "Phone")
    assert pairing.check(token)[0] == device_id
    assert pairing.pair(pin, "Other") == "expired"


def test_wrong_pins_lock_pairing(pairing):
    real = pairing.pin
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(auth.MAX_ATTEMPTS - 1):
        assert pairing.pair(wrong, "x") == "wrong_pin"
    assert pairing.pair(wrong, "x") == "locked"
    assert pairing.pair(real, "x") == "locked"  # even the right PIN is refused now
    pairing.clock.now += auth.LOCKOUT_SECONDS + 1
    assert pairing.pair(real, "x") == "expired"  # a new PIN must be made on the laptop


def test_pin_expires(pairing):
    pairing.clock.now += auth.PIN_LIFETIME + 1
    assert pairing.pair(pairing.pin, "x") == "expired"


def test_tokens_stored_hashed(pairing, tmp_path):
    _, token = pairing.pair(pairing.pin, "Phone")
    assert token not in (tmp_path / "devices.json").read_text()


def test_revoked_device_rejected_even_if_removed_by_another_process(pairing, tmp_path):
    device_id, token = pairing.pair(pairing.pin, "Phone")
    other = DeviceStore(tmp_path / "devices.json")  # e.g. `laptop-remote remove`
    other.remove(device_id)
    assert pairing.check(token) is None


def test_local_network_check():
    for ip in ["192.168.1.5", "10.0.0.2", "172.16.4.4", "127.0.0.1", "::1", "100.101.102.103", "fe80::1"]:
        assert is_local_network(ip), ip
    for ip in ["8.8.8.8", "1.2.3.4", "2606:4700::1111", "", "garbage"]:
        assert not is_local_network(ip), ip


# ---------- HTTP ----------

PROTECTED = [
    ("GET", "/api/info"), ("GET", "/api/devices"), ("GET", "/api/processes"), ("GET", "/api/clipboard"),
    ("GET", "/api/files"), ("GET", "/api/files/roots"), ("GET", "/api/files/download?path=/etc/hostname"),
    ("POST", "/api/power"), ("POST", "/api/exec"), ("POST", "/api/open"), ("POST", "/api/kill"),
    ("POST", "/api/files/delete"), ("POST", "/api/files/mkdir"), ("POST", "/api/files/upload"),
    ("POST", "/api/clipboard"), ("POST", "/api/devices/revoke"), ("POST", "/api/unpair"),
    ("GET", "/api/ws"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
async def test_everything_needs_pairing(client, method, path):
    r = await client.request(method, path, headers=client.origin, json={"command": "echo hi"})
    assert r.status == 401


async def test_bad_token_rejected(client):
    client.session.cookie_jar.update_cookies({"lr_token": "made-up"})
    r = await client.get("/api/info")
    assert r.status == 401


async def pair(client, pairing):
    r = await client.post("/api/pair", json={"pin": pairing.pin, "name": "Test"}, headers=client.origin)
    assert r.status == 200
    cookie = r.cookies["lr_token"]
    assert cookie["httponly"] and cookie["samesite"] == "Strict"


async def test_pair_then_use(client, pairing):
    await pair(client, pairing)
    r = await client.get("/api/session")
    assert (await r.json())["paired"] is True
    r = await client.post("/api/exec", json={"command": "echo hello"}, headers=client.origin)
    assert r.status == 200
    assert "hello" in (await r.json())["output"]


async def test_wrong_pin_over_http(client, pairing):
    wrong = "000000" if pairing.pin != "000000" else "111111"
    r = await client.post("/api/pair", json={"pin": wrong, "name": "x"}, headers=client.origin)
    assert r.status == 400
    assert "lr_token" not in r.cookies


async def test_cross_site_requests_blocked(client, pairing):
    await pair(client, pairing)
    for origin in [{"Origin": "https://evil.example"}, {}]:
        r = await client.post("/api/exec", json={"command": "echo hi"}, headers=origin)
        assert r.status == 403
    r = await client.get("/api/ws", headers={"Origin": "https://evil.example"})
    assert r.status == 403


async def test_public_addresses_refused(aiohttp_client, pairing):
    @web.middleware
    async def from_internet(request, handler):
        return await handler(request.clone(remote="8.8.8.8"))

    app = build_app(pairing)
    app.middlewares.insert(0, from_internet)
    c = await aiohttp_client(app)
    r = await c.get("/api/session")
    assert r.status == 403


async def test_security_headers(client):
    r = await client.get("/")
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'self'" in r.headers["Content-Security-Policy"]


async def test_upload_cannot_escape_folder(client, pairing, tmp_path):
    await pair(client, pairing)
    form = aiohttp.FormData()
    form.add_field("file", b"data", filename="../../escape.txt")
    r = await client.post(f"/api/files/upload?path={tmp_path}", data=form, headers=client.origin)
    assert r.status == 200
    saved = (await r.json())["saved"]
    assert len(saved) == 1 and "/" not in saved[0]
    assert (tmp_path / saved[0]).read_bytes() == b"data"
    assert not (tmp_path.parent.parent / "escape.txt").exists()


async def test_files_list_and_download(client, pairing, tmp_path):
    await pair(client, pairing)
    (tmp_path / "a.txt").write_text("hi")
    r = await client.get(f"/api/files?path={tmp_path}")
    names = [e["name"] for e in (await r.json())["entries"]]
    assert "a.txt" in names
    r = await client.get(f"/api/files/download?path={tmp_path / 'a.txt'}")
    assert await r.text() == "hi"
    assert "sandbox" in r.headers["Content-Security-Policy"]


async def test_unpair_removes_access(client, pairing):
    await pair(client, pairing)
    r = await client.post("/api/unpair", json={}, headers=client.origin)
    assert r.status == 200
    client.session.cookie_jar.clear()
    assert (await client.get("/api/info")).status == 401


async def test_terminal_cd_persists(client, pairing, tmp_path):
    await pair(client, pairing)
    (tmp_path / "sub").mkdir()
    r = await client.post("/api/exec", json={"command": "cd sub", "cwd": str(tmp_path)}, headers=client.origin)
    assert (await r.json())["cwd"] == str(tmp_path / "sub")
