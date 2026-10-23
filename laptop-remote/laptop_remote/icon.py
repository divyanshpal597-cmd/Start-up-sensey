"""The app icon, drawn in code so the tray and the installers share one source."""

from PIL import Image, ImageDraw

BLUE = (47, 109, 246, 255)
WHITE = (255, 255, 255, 255)


def draw(size: int = 256) -> Image.Image:
    s = size / 64  # drawn on a 64-unit grid, like static/icon.svg
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = max(1, round(3.5 * s))
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=14 * s, fill=BLUE)
    d.rounded_rectangle((11 * s, 15 * s, 45 * s, 37 * s), radius=3 * s, outline=WHITE, width=w)
    d.line((7 * s, 43 * s, 49 * s, 43 * s), fill=WHITE, width=w)
    d.rounded_rectangle((40 * s, 27 * s, 56 * s, 53 * s), radius=3.5 * s, fill=BLUE, outline=WHITE, width=w)
    r = 1.8 * s
    d.ellipse((48 * s - r, 47 * s - r, 48 * s + r, 47 * s + r), fill=WHITE)
    return img
