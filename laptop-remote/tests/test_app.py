import json
import sys

import pytest

from laptop_remote import autostart
from laptop_remote.__main__ import first_run_setup
from laptop_remote.icon import draw


@pytest.fixture
def frozen_linux(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "/opt/Laptop Remote/LaptopRemote")
    monkeypatch.setattr(autostart, "SYSTEM", "Linux")
    monkeypatch.setattr(autostart, "LINUX_DESKTOP", tmp_path / "autostart" / "laptop-remote.desktop")


def test_installed_app_turns_on_start_at_login_once(frozen_linux, tmp_path):
    first_run_setup(tmp_path)
    assert autostart.is_enabled()
    assert '"/opt/Laptop Remote/LaptopRemote" "--autostart"' in autostart.LINUX_DESKTOP.read_text()
    assert json.loads((tmp_path / "settings.json").read_text())["autostart_initialized"]

    # If the user turns it off, later starts must not turn it back on.
    autostart.disable()
    first_run_setup(tmp_path)
    assert not autostart.is_enabled()


def test_source_checkout_does_not_touch_login_items(monkeypatch, tmp_path):
    monkeypatch.delattr(sys, "frozen", raising=False)
    first_run_setup(tmp_path)
    assert not (tmp_path / "settings.json").exists()


def test_icon_draws():
    assert draw(64).size == (64, 64)
