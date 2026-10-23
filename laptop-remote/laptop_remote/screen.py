"""Screen capture as JPEG frames."""

import io

import mss
from PIL import Image


class ScreenGrabber:
    """One per stream: mss handles must stay on the thread that made them."""

    def __init__(self):
        self._sct = None

    def monitors(self) -> list[dict]:
        sct = self._get()
        # monitors[0] is all screens combined; the rest are the real displays.
        return [dict(m) for m in sct.monitors[1:]] or [dict(sct.monitors[0])]

    def _get(self):
        if self._sct is None:
            # mss 10 renamed mss.mss to mss.MSS; support both.
            self._sct = (getattr(mss, "MSS", None) or mss.mss)()
        return self._sct

    def grab(self, monitor_index: int, max_width: int, quality: int) -> tuple[bytes, dict]:
        monitors = self.monitors()
        monitor = monitors[min(max(monitor_index, 0), len(monitors) - 1)]
        shot = self._get().grab(monitor)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        if img.width > max_width:
            img = img.resize((max_width, round(img.height * max_width / img.width)), Image.BILINEAR)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=False)
        return buf.getvalue(), monitor

    def close(self):
        if self._sct is not None:
            self._sct.close()
            self._sct = None
