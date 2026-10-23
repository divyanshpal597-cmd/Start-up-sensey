"""Where Laptop Remote keeps its files, and the paired-device list."""

import json
import os
import threading
import time
from pathlib import Path


def data_dir() -> Path:
    override = os.environ.get("LAPTOP_REMOTE_HOME")
    path = Path(override) if override else Path.home() / ".laptop-remote"
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass
    return path


def write_private(path: Path, data: bytes) -> None:
    """Write a file only the current user can read."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


class DeviceStore:
    """Paired phones. Only a hash of each device's secret token is stored."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self.devices: dict[str, dict] = {}
        self._mtime = None
        self._reload()

    def _reload(self) -> None:
        """Pick up changes made by `laptop-remote revoke` while the server runs."""
        try:
            mtime = self.path.stat().st_mtime_ns
        except OSError:
            self.devices, self._mtime = {}, None
            return
        if mtime == self._mtime:
            return
        try:
            self.devices = json.loads(self.path.read_text()).get("devices", {})
        except (ValueError, OSError):
            self.devices = {}
        self._mtime = mtime

    def _save(self) -> None:
        write_private(self.path, json.dumps({"devices": self.devices}, indent=2).encode())
        self._mtime = self.path.stat().st_mtime_ns

    def add(self, device_id: str, name: str, token_hash: str) -> None:
        with self._lock:
            self.devices[device_id] = {
                "name": name,
                "token_hash": token_hash,
                "paired_at": int(time.time()),
                "last_seen": int(time.time()),
            }
            self._save()

    def find_by_hash(self, token_hash: str) -> tuple[str, dict] | None:
        with self._lock:
            self._reload()
        for device_id, dev in self.devices.items():
            if dev["token_hash"] == token_hash:
                return device_id, dev
        return None

    def touch(self, device_id: str) -> None:
        with self._lock:
            dev = self.devices.get(device_id)
            if dev and time.time() - dev.get("last_seen", 0) > 60:
                dev["last_seen"] = int(time.time())
                self._save()

    def remove(self, device_id: str) -> bool:
        with self._lock:
            if self.devices.pop(device_id, None) is None:
                return False
            self._save()
            return True

    def clear(self) -> int:
        with self._lock:
            count = len(self.devices)
            self.devices = {}
            self._save()
            return count
