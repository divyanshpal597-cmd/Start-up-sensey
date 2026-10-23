"""Start Laptop Remote automatically when the user logs in."""

import os
import plistlib
import sys
from pathlib import Path

from .system import SYSTEM

NAME = "LaptopRemote"
MAC_PLIST = Path.home() / "Library" / "LaunchAgents" / "com.laptopremote.app.plist"
LINUX_DESKTOP = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "autostart" / "laptop-remote.desktop"


def supported() -> bool:
    # Only the installed app has a fixed program file to point login items at.
    return bool(getattr(sys, "frozen", False))


def _command() -> list[str]:
    return [sys.executable, "--autostart"]


def is_enabled() -> bool:
    if SYSTEM == "Windows":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as key:
                winreg.QueryValueEx(key, NAME)
                return True
        except OSError:
            return False
    if SYSTEM == "Darwin":
        return MAC_PLIST.exists()
    return LINUX_DESKTOP.exists()


def enable() -> None:
    cmd = _command()
    if SYSTEM == "Windows":
        import winreg
        value = " ".join(f'"{c}"' if " " in c else c for c in cmd)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as key:
            winreg.SetValueEx(key, NAME, 0, winreg.REG_SZ, value)
    elif SYSTEM == "Darwin":
        MAC_PLIST.parent.mkdir(parents=True, exist_ok=True)
        MAC_PLIST.write_bytes(plistlib.dumps({
            "Label": "com.laptopremote.app",
            "ProgramArguments": cmd,
            "RunAtLoad": True,
            "ProcessType": "Interactive",
        }))
    else:
        LINUX_DESKTOP.parent.mkdir(parents=True, exist_ok=True)
        exec_line = " ".join(f'"{c}"' for c in cmd)
        LINUX_DESKTOP.write_text(
            "[Desktop Entry]\nType=Application\nName=Laptop Remote\n"
            f"Exec={exec_line}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n"
        )


def disable() -> None:
    if SYSTEM == "Windows":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run",
                                0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, NAME)
        except OSError:
            pass
    elif SYSTEM == "Darwin":
        MAC_PLIST.unlink(missing_ok=True)
    else:
        LINUX_DESKTOP.unlink(missing_ok=True)
