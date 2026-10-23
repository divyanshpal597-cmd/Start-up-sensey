"""Mouse and keyboard control."""

import threading

_lock = threading.Lock()
_mouse = None
_keyboard = None


def _devices():
    # pynput needs a display, so it is only loaded on first use.
    global _mouse, _keyboard
    with _lock:
        if _mouse is None:
            from pynput import keyboard, mouse
            _mouse = mouse.Controller()
            _keyboard = keyboard.Controller()
    return _mouse, _keyboard


def _button(name: str):
    from pynput.mouse import Button
    return {"left": Button.left, "right": Button.right, "middle": Button.middle}.get(name, Button.left)


# Names the phone sends -> pynput key names.
KEY_ALIASES = {
    "ctrl": "ctrl", "control": "ctrl", "alt": "alt", "option": "alt", "shift": "shift",
    "win": "cmd", "cmd": "cmd", "super": "cmd", "meta": "cmd",
    "enter": "enter", "return": "enter", "esc": "esc", "escape": "esc", "tab": "tab",
    "backspace": "backspace", "delete": "delete", "space": "space",
    "up": "up", "down": "down", "left": "left", "right": "right",
    "home": "home", "end": "end", "pageup": "page_up", "pagedown": "page_down",
    "capslock": "caps_lock", "printscreen": "print_screen", "insert": "insert",
    "volumeup": "media_volume_up", "volumedown": "media_volume_down", "mute": "media_volume_mute",
    "playpause": "media_play_pause", "next": "media_next", "previous": "media_previous",
    **{f"f{i}": f"f{i}" for i in range(1, 21)},
}


def resolve_key(name: str):
    from pynput.keyboard import Key, KeyCode
    lowered = name.lower()
    if lowered in KEY_ALIASES:
        return getattr(Key, KEY_ALIASES[lowered])
    if len(name) == 1:
        return KeyCode.from_char(lowered)
    raise ValueError(f"Unknown key: {name}")


def move_relative(dx: float, dy: float) -> None:
    mouse, _ = _devices()
    mouse.move(int(round(dx)), int(round(dy)))


def move_absolute(x: float, y: float, monitor: dict) -> None:
    """x and y are 0..1 positions on the given monitor."""
    mouse, _ = _devices()
    x = min(max(x, 0.0), 1.0)
    y = min(max(y, 0.0), 1.0)
    mouse.position = (
        monitor["left"] + int(x * (monitor["width"] - 1)),
        monitor["top"] + int(y * (monitor["height"] - 1)),
    )


def click(button: str = "left", count: int = 1) -> None:
    mouse, _ = _devices()
    mouse.click(_button(button), max(1, min(int(count), 3)))


def press(button: str = "left") -> None:
    mouse, _ = _devices()
    mouse.press(_button(button))


def release(button: str = "left") -> None:
    mouse, _ = _devices()
    mouse.release(_button(button))


def scroll(dx: float, dy: float) -> None:
    mouse, _ = _devices()
    mouse.scroll(int(dx), int(dy))


def type_text(text: str) -> None:
    _, keyboard = _devices()
    keyboard.type(text[:5000])


def press_keys(keys: list[str]) -> None:
    """Press a key or a combination like ["ctrl", "c"]."""
    _, keyboard = _devices()
    resolved = [resolve_key(k) for k in keys[:6]]
    for key in resolved:
        keyboard.press(key)
    for key in reversed(resolved):
        keyboard.release(key)
