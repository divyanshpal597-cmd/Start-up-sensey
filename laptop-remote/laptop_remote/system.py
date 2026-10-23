"""Power, apps, clipboard, processes, system info and commands."""

import os
import platform
import shlex
import subprocess
import time
import webbrowser

import psutil

SYSTEM = platform.system()  # "Windows", "Darwin" or "Linux"

POWER_COMMANDS = {
    "Windows": {
        "lock": ["rundll32.exe", "user32.dll,LockWorkStation"],
        "sleep": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
        "restart": ["shutdown", "/r", "/t", "5"],
        "shutdown": ["shutdown", "/s", "/t", "5"],
        "signout": ["shutdown", "/l"],
        "screen_off": ["powershell", "-NoProfile", "-Command",
                       "(Add-Type '[DllImport(\"user32.dll\")]public static extern int SendMessage(int h,int m,int w,int l);' "
                       "-Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)"],
    },
    "Darwin": {
        "lock": ["pmset", "displaysleepnow"],
        "sleep": ["pmset", "sleepnow"],
        "restart": ["osascript", "-e", 'tell app "System Events" to restart'],
        "shutdown": ["osascript", "-e", 'tell app "System Events" to shut down'],
        "signout": ["osascript", "-e", 'tell app "System Events" to log out'],
        "screen_off": ["pmset", "displaysleepnow"],
    },
    "Linux": {
        "lock": ["loginctl", "lock-session"],
        "sleep": ["systemctl", "suspend"],
        "restart": ["systemctl", "reboot"],
        "shutdown": ["systemctl", "poweroff"],
        "signout": ["loginctl", "terminate-user", os.environ.get("USER", "")],
        "screen_off": ["xset", "dpms", "force", "off"],
    },
}


def power(action: str) -> None:
    commands = POWER_COMMANDS.get(SYSTEM, POWER_COMMANDS["Linux"])
    if action not in commands:
        raise ValueError(f"Unknown power action: {action}")
    subprocess.Popen(commands[action], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def open_url(url: str) -> None:
    url = url.strip()
    if not url:
        raise ValueError("Type a website address")
    if "://" not in url:
        url = "https://" + url
    if not url.startswith(("http://", "https://")):
        raise ValueError("Only http and https links can be opened")
    webbrowser.open(url)


def open_app(target: str) -> None:
    """Open an app by name, or a file or folder by path."""
    target = target.strip()
    if not target:
        raise ValueError("Type an app name or a file path")
    exists = os.path.exists(os.path.expanduser(target))
    if exists:
        target = os.path.expanduser(target)
    if SYSTEM == "Windows":
        if exists:
            os.startfile(target)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["cmd", "/c", "start", "", target], creationflags=0x08000000)
    elif SYSTEM == "Darwin":
        subprocess.Popen(["open", target] if exists else ["open", "-a", target])
    elif exists:
        subprocess.Popen(["xdg-open", target])
    else:
        subprocess.Popen(shlex.split(target), start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def get_clipboard() -> str:
    import pyperclip
    return pyperclip.paste()


def set_clipboard(text: str) -> None:
    import pyperclip
    pyperclip.copy(text)


def info() -> dict:
    battery = psutil.sensors_battery() if hasattr(psutil, "sensors_battery") else None
    disk = psutil.disk_usage(os.path.abspath(os.sep))
    mem = psutil.virtual_memory()
    return {
        "name": platform.node(),
        "os": f"{SYSTEM} {platform.release()}",
        "cpu": psutil.cpu_percent(interval=None),
        "memory": {"used": mem.used, "total": mem.total, "percent": mem.percent},
        "disk": {"used": disk.used, "total": disk.total, "percent": disk.percent},
        "battery": None if battery is None else {
            "percent": round(battery.percent),
            "plugged": battery.power_plugged,
        },
        "uptime": int(time.time() - psutil.boot_time()),
    }


def processes(limit: int = 60) -> list[dict]:
    procs = []
    for p in psutil.process_iter(["pid", "name", "memory_info", "username"]):
        try:
            mem = p.info["memory_info"].rss if p.info["memory_info"] else 0
            procs.append({"pid": p.info["pid"], "name": p.info["name"] or "?", "memory": mem})
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda p: p["memory"], reverse=True)
    return procs[:limit]


def kill(pid: int) -> None:
    if pid == os.getpid():
        raise ValueError("That is Laptop Remote itself")
    p = psutil.Process(pid)
    p.terminate()
    try:
        p.wait(timeout=3)
    except psutil.TimeoutExpired:
        p.kill()


def shell_command(command: str) -> list[str]:
    if SYSTEM == "Windows":
        return ["powershell", "-NoProfile", "-Command", command]
    return [os.environ.get("SHELL", "/bin/sh"), "-c", command]


def run_command(command: str, cwd: str, timeout: int = 60) -> dict:
    """Run a terminal command and return its output.

    `cd somewhere` is handled here so the folder sticks between commands.
    """
    stripped = command.strip()
    if stripped == "cd" or stripped.startswith("cd "):
        target = stripped[2:].strip().strip('"').strip("'") or os.path.expanduser("~")
        new_cwd = os.path.abspath(os.path.join(cwd, os.path.expanduser(target)))
        if not os.path.isdir(new_cwd):
            return {"output": f"No such folder: {new_cwd}\n", "code": 1, "cwd": cwd}
        return {"output": "", "code": 0, "cwd": new_cwd}
    try:
        result = subprocess.run(
            shell_command(command), cwd=cwd, capture_output=True, timeout=timeout,
            stdin=subprocess.DEVNULL,
            creationflags=0x08000000 if SYSTEM == "Windows" else 0,
        )
        output = (result.stdout + result.stderr).decode(errors="replace")
        code = result.returncode
    except subprocess.TimeoutExpired as e:
        output = ((e.stdout or b"") + (e.stderr or b"")).decode(errors="replace")
        output += f"\n[stopped after {timeout} seconds]\n"
        code = -1
    if len(output) > 200_000:
        output = output[-200_000:]
    return {"output": output, "code": code, "cwd": cwd}

