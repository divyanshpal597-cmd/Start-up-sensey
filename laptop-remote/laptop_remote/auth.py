"""Pairing a phone with a one-time PIN, and recognising paired phones afterwards."""

import hashlib
import hmac
import secrets
import time

from .config import DeviceStore

PIN_LIFETIME = 10 * 60      # a PIN works for 10 minutes
MAX_ATTEMPTS = 5            # wrong PINs before pairing locks
LOCKOUT_SECONDS = 5 * 60


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Pairing:
    """A single-use 6-digit PIN shown only on the laptop's own screen.

    The PIN is replaced after every successful pairing, after it expires, and
    after too many wrong guesses, so it cannot be brute-forced.
    """

    def __init__(self, store: DeviceStore, on_new_pin=None, clock=time.monotonic):
        self.store = store
        self.on_new_pin = on_new_pin or (lambda pin: None)
        self.clock = clock
        self.pin: str | None = None
        self.expires = 0.0
        self.failures = 0
        self.locked_until = 0.0

    def new_pin(self) -> str:
        self.pin = f"{secrets.randbelow(10**6):06d}"
        self.expires = self.clock() + PIN_LIFETIME
        self.failures = 0
        self.on_new_pin(self.pin)
        return self.pin

    def status(self) -> str:
        now = self.clock()
        if now < self.locked_until:
            return "locked"
        if self.pin is None or now > self.expires:
            return "expired"
        return "open"

    def pair(self, pin: str, device_name: str) -> tuple[str, str] | str:
        """Returns (device_id, token) on success, or an error code."""
        state = self.status()
        if state != "open":
            return state
        if not hmac.compare_digest(str(pin).strip().encode(), self.pin.encode()):
            self.failures += 1
            if self.failures >= MAX_ATTEMPTS:
                self.locked_until = self.clock() + LOCKOUT_SECONDS
                self.pin = None
                return "locked"
            return "wrong_pin"
        self.pin = None  # single use
        device_id = secrets.token_hex(4)
        token = secrets.token_urlsafe(32)
        name = (device_name or "Phone").strip()[:40] or "Phone"
        self.store.add(device_id, name, hash_token(token))
        return device_id, token

    def check(self, token: str | None) -> tuple[str, dict] | None:
        if not token:
            return None
        found = self.store.find_by_hash(hash_token(token))
        if found:
            self.store.touch(found[0])
        return found
