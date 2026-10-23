import sys

import pytest

from laptop_remote import autostart
from laptop_remote.icon import draw


@pytest.fixture
def frozen_linux(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "/opt/Laptop Remote/LaptopRemote")
    monkeypatch.setattr(autostart, "SYSTEM", "Linux")
    monkeypatch.setattr(autostart, "LINUX_DESKTOP", tmp_path / "autostart" / "laptop-remote.desktop")


def test_start_at_login_is_opt_in_and_reversible(frozen_linux):
    assert not autostart.is_enabled()  # nothing is set up until the user asks
    autostart.enable()
    assert '"/opt/Laptop Remote/LaptopRemote" "--autostart"' in autostart.LINUX_DESKTOP.read_text()
    autostart.disable()
    assert not autostart.is_enabled()


def test_icon_draws():
    assert draw(64).size == (64, 64)
