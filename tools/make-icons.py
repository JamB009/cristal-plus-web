#!/usr/bin/env python3
"""Draws the app icon (the Android launcher's pokéball on its blue gradient) at the sizes the PWA needs."""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
START, END = (0x5B, 0xC0, 0xEB), (0x1B, 0x3A, 0x5C)  # ic_launcher_bg.xml, angle 315
SUPERSAMPLE = 4


def draw(size: int) -> Image.Image:
    s = size * SUPERSAMPLE
    horizontal = Image.linear_gradient("L").rotate(90).resize((s, s))
    vertical = Image.linear_gradient("L").resize((s, s))
    t = ImageChops.add(horizontal, vertical, scale=2)  # 0 at top-left, 255 at bottom-right
    img = Image.composite(Image.new("RGB", (s, s), END), Image.new("RGB", (s, s), START), t)

    d = ImageDraw.Draw(img)
    cx = cy = s / 2
    r = 0.30 * s  # inside the 80% safe zone, so the same file works as a maskable icon
    u = r / 10  # ic_launcher_fg.xml is drawn on a 24-unit grid with a radius of 10

    def box(radius):
        return [cx - radius, cy - radius, cx + radius, cy + radius]

    d.pieslice(box(r), 180, 360, fill="#e53935")
    d.pieslice(box(r), 0, 180, fill="#f5f5f5")
    d.rectangle([cx - r, cy - 0.8 * u, cx + r, cy + 0.8 * u], fill="#212121")
    d.ellipse(box(3.4 * u), fill="#212121")
    d.ellipse(box(1.8 * u), fill="#f5f5f5")
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        draw(size).save(OUT / f"icon-{size}.png", optimize=True)
        print(f"icon-{size}.png")
