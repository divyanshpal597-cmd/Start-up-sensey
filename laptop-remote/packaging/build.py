"""Build the installable app for the current OS.

    pip install -r requirements.txt pyinstaller
    python packaging/build.py

Windows -> dist/LaptopRemote-Setup.exe   (needs Inno Setup's iscc on PATH)
macOS   -> dist/LaptopRemote-mac.dmg
Linux   -> dist/LaptopRemote-linux
"""

import os
import platform
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
DIST = ROOT / "dist"
SYSTEM = platform.system()

sys.path.insert(0, str(ROOT))
from laptop_remote.icon import draw  # noqa: E402

VERSION = os.environ.get("APP_VERSION", "1.0.0")


def make_icons() -> Path:
    BUILD.mkdir(exist_ok=True)
    img = draw(1024)
    img.save(BUILD / "icon.png")
    if SYSTEM == "Windows":
        img.save(BUILD / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        return BUILD / "icon.ico"
    if SYSTEM == "Darwin":
        img.save(BUILD / "icon.icns")
        return BUILD / "icon.icns"
    return BUILD / "icon.png"


def pyinstaller(icon: Path) -> None:
    args = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
        "--name", "LaptopRemote",
        "--windowed",
        "--paths", str(ROOT),
        "--icon", str(icon),
        "--add-data", f"{ROOT / 'laptop_remote' / 'static'}{os.pathsep}laptop_remote/static",
        "--collect-submodules", "pynput",
        "--collect-submodules", "pystray",
        "--distpath", str(DIST), "--workpath", str(BUILD / "work"), "--specpath", str(BUILD),
    ]
    # pynput and pystray pick their backend at runtime, and collecting them can
    # silently skip a backend that fails to import on the build machine, so name them.
    backend = {"Windows": "win32", "Darwin": "darwin"}.get(SYSTEM, "xorg")
    for module in (f"pynput.keyboard._{backend}", f"pynput.mouse._{backend}",
                   f"pynput._util.{backend}", f"pystray._{backend}"):
        args += ["--hidden-import", module]
    if SYSTEM == "Linux":
        args += ["--onefile", "--collect-submodules", "Xlib"]
    if SYSTEM == "Darwin":
        args += ["--osx-bundle-identifier", "com.laptopremote.app"]
    args.append(str(ROOT / "packaging" / "launch.py"))
    subprocess.run(args, check=True, cwd=ROOT)


def package_windows() -> Path:
    iscc = shutil.which("iscc") or r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    subprocess.run([iscc, f"/DAppVersion={VERSION}", f"/DSourceDir={DIST / 'LaptopRemote'}",
                    f"/DIconFile={BUILD / 'icon.ico'}", f"/O{DIST}",
                    str(ROOT / "packaging" / "installer.iss")], check=True)
    return DIST / "LaptopRemote-Setup.exe"


def package_mac() -> Path:
    app = DIST / "LaptopRemote.app"
    plist_path = app / "Contents" / "Info.plist"
    info = plistlib.loads(plist_path.read_bytes())
    info.update({
        "CFBundleDisplayName": "Laptop Remote",
        "CFBundleName": "Laptop Remote",
        "CFBundleShortVersionString": VERSION,
        "CFBundleVersion": VERSION,
        "LSUIElement": True,  # menu-bar icon only, no Dock icon
        "NSAppleEventsUsageDescription": "Laptop Remote uses this to restart, shut down or sign out when you ask from your phone.",
        "NSHighResolutionCapable": True,
    })
    plist_path.write_bytes(plistlib.dumps(info))
    subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(app)], check=True)

    staging = BUILD / "dmg"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    shutil.copytree(app, staging / "Laptop Remote.app", symlinks=True)
    (staging / "Applications").symlink_to("/Applications")
    dmg = DIST / "LaptopRemote-mac.dmg"
    dmg.unlink(missing_ok=True)
    subprocess.run(["hdiutil", "create", "-volname", "Laptop Remote", "-srcfolder", str(staging),
                    "-ov", "-format", "UDZO", str(dmg)], check=True)
    return dmg


def package_linux() -> Path:
    out = DIST / "LaptopRemote-linux"
    (DIST / "LaptopRemote").replace(out)
    out.chmod(0o755)
    return out


def main() -> None:
    shutil.rmtree(DIST, ignore_errors=True)
    icon = make_icons()
    pyinstaller(icon)
    result = {"Windows": package_windows, "Darwin": package_mac}.get(SYSTEM, package_linux)()
    print(f"\nBuilt {result}")


if __name__ == "__main__":
    main()
