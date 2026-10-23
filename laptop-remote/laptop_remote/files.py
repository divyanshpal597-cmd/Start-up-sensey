"""Browsing the laptop's files."""

import os
import shutil
import string
from pathlib import Path

from .system import SYSTEM


def roots() -> list[dict]:
    items = [{"name": "Home", "path": str(Path.home())}]
    for name in ("Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"):
        p = Path.home() / name
        if p.is_dir():
            items.append({"name": name, "path": str(p)})
    if SYSTEM == "Windows":
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                items.append({"name": f"Drive {letter}:", "path": drive})
    else:
        items.append({"name": "Whole computer", "path": "/"})
    return items


def resolve(path: str) -> Path:
    if not path:
        return Path.home()
    return Path(os.path.expanduser(path)).resolve()


def listing(path: str, show_hidden: bool = False) -> dict:
    folder = resolve(path)
    if not folder.is_dir():
        raise ValueError(f"Not a folder: {folder}")
    entries = []
    with os.scandir(folder) as it:
        for entry in it:
            if not show_hidden and entry.name.startswith("."):
                continue
            try:
                is_dir = entry.is_dir()
                stat = entry.stat()
            except OSError:
                continue
            entries.append({
                "name": entry.name,
                "dir": is_dir,
                "size": 0 if is_dir else stat.st_size,
                "modified": int(stat.st_mtime),
            })
    entries.sort(key=lambda e: (not e["dir"], e["name"].lower()))
    parent = str(folder.parent) if folder.parent != folder else None
    return {"path": str(folder), "parent": parent, "entries": entries}


def safe_child(folder: Path, name: str) -> Path:
    """A file name typed or uploaded from the phone, kept inside `folder`."""
    clean = os.path.basename(name.replace("\\", "/")).strip()
    if clean in ("", ".", ".."):
        raise ValueError("Invalid name")
    return folder / clean


def unique(path: Path) -> Path:
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    n = 1
    while True:
        candidate = path.with_name(f"{stem} ({n}){suffix}")
        if not candidate.exists():
            return candidate
        n += 1


def make_folder(path: str, name: str) -> str:
    target = safe_child(resolve(path), name)
    target.mkdir()
    return str(target)


def delete(path: str) -> None:
    target = resolve(path)
    if target == Path.home() or target.parent == target:
        raise ValueError("Refusing to delete your home folder or a whole drive")
    if target.is_dir() and not target.is_symlink():
        shutil.rmtree(target)
    else:
        target.unlink()
