"""
Draws Somno's icon set.

The project shipped with Expo's template icon — the blue chevron on pale blue, with the layout
guides still visible in it. It is the single most visible unfinished thing in a listing, and it is
also wrong twice over: it looks nothing like the app, and a light-blue mark next to a near-black
screenshot reads as a different product.

The mark is a crescent, filled with the same lavender-to-peach the SDI dial uses, on the app's own
indigo. Everything is drawn at 4x and downsampled, which is what keeps the curve clean at 48px.

    python3 scripts/make-icons.py

Writes assets/icon.png, android-icon-{foreground,background,monochrome}.png, splash-icon.png and
favicon.png.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SS = 4  # supersampling

INK = (7, 6, 12)
GRAD_FROM = (201, 188, 255)  # the dial's purple
GRAD_TO = (246, 184, 160)  # and its peach

# How much of the frame the crescent occupies. Android composes the adaptive foreground inside a
# mask that can crop to the middle 66%, so the foreground uses a smaller figure than the flat icon.
FLAT_SCALE = 0.62
ADAPTIVE_SCALE = 0.46


def crescent_mask(size, scale):
    """A moon: one disc minus a second disc offset up and to the right."""
    s = size * SS
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    r = s * scale / 2
    # Nudged right: cutting the disc on that side moves the shape's mass left, and a geometrically
    # centred crescent looks off-centre on a launcher grid.
    cx, cy = s / 2 + r * 0.10, s / 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    ir = r * 0.82
    ix, iy = cx + r * 0.38, cy - r * 0.18
    d.ellipse((ix - ir, iy - ir, ix + ir, iy + ir), fill=0)
    return mask


def gradient(size, frm, to):
    """A 135° linear ramp, drawn small and scaled up — a gradient has no detail to lose."""
    s = size * SS
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(round(frm[i] + (to[i] - frm[i]) * t) for i in range(3))
    return small.resize((s, s), Image.BICUBIC)


def field(size, top=(27, 20, 54), edge=INK):
    """The app's background: an indigo bloom over near-black, brightest above centre."""
    s = size * SS
    img = Image.new("RGB", (s, s), edge)
    glow = Image.new("RGB", (s, s), edge)
    ImageDraw.Draw(glow).ellipse((-s * 0.35, -s * 0.55, s * 1.35, s * 0.75), fill=top)
    return Image.blend(img, glow.filter(ImageFilter.GaussianBlur(s * 0.16)), 0.9)


def moon(size, scale, glow=True):
    """The mark on transparency, with the soft halo the dial has."""
    s = size * SS
    mask = crescent_mask(size, scale)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    if glow:
        halo = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        halo.paste((138, 123, 255, 150), (0, 0), mask)
        out = Image.alpha_composite(out, halo.filter(ImageFilter.GaussianBlur(s * 0.045)))
    body = gradient(size, GRAD_FROM, GRAD_TO).convert("RGBA")
    body.putalpha(mask)
    return Image.alpha_composite(out, body)


def down(img, size):
    return img.resize((size, size), Image.LANCZOS)


def write(img, name, size):
    path = os.path.join(ASSETS, name)
    down(img, size).save(path)
    print("  ", os.path.relpath(path, ROOT), f"{size}x{size}")


if __name__ == "__main__":
    # The flat icon: mark on its own field, for iOS and anywhere Android cannot use layers.
    flat = field(1024).convert("RGBA")
    write(Image.alpha_composite(flat, moon(1024, FLAT_SCALE)).convert("RGB"), "icon.png", 1024)

    # Adaptive layers. Kept separate so Android can parallax and mask them.
    write(moon(512, ADAPTIVE_SCALE), "android-icon-foreground.png", 512)
    write(field(512).convert("RGBA"), "android-icon-background.png", 512)

    # Themed icon and the notification icon are the same file: a flat silhouette, no gradient, no
    # glow — Android tints it and discards colour, so anything else only muddies the shape.
    mono = Image.new("RGBA", (432 * SS, 432 * SS), (0, 0, 0, 0))
    mono.paste((255, 255, 255, 255), (0, 0), crescent_mask(432, ADAPTIVE_SCALE))
    write(mono, "android-icon-monochrome.png", 432)

    # The splash draws this over the app's own background colour, so it carries no field of its own.
    write(moon(512, 0.72), "splash-icon.png", 512)
    write(Image.alpha_composite(field(196).convert("RGBA"), moon(196, FLAT_SCALE)).convert("RGB"), "favicon.png", 196)
