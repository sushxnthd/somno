"""
Turns the raw screen captures into the images Play actually accepts.

Play's phone screenshots must be between 320 and 3840 px and no more extreme than 2:1, which a
modern phone screen (390x844, about 2.16:1) already fails. So each screen is placed on a 1080x1920
board with a caption above it — the standard listing frame, and the only way to show a full screen
without letterboxing or cropping it.

    python3 scripts/compose-store-assets.py

Reads listing/raw/*.png (see scripts/store-assets.cjs) and writes listing/play/.
"""

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "listing", "raw")
OUT = os.path.join(ROOT, "listing", "play")
FONTS = os.path.abspath(os.path.join(ROOT, "..", "project", "_fonts"))

W, H = 1080, 1920
BG = (11, 9, 22)

# The caption is what the shopper reads; the screen behind it is the evidence. Each one names a
# thing the app does, in the app's own voice, and none of them promises an outcome.
CAPTIONS = [
    ("home", "Know what you're\nrunning on"),
    ("pvt", "A 30-second reaction\ntest, taken from the lab"),
    ("result", "A score that\nshows its working"),
    ("recovery", "What tonight can\nrealistically fix"),
    ("trends", "Your own baseline,\nnot a population average"),
    ("week", "One thing to change,\nevery week"),
    ("alarms", "Wake in light sleep,\nnot mid-cycle"),
    ("how-it-works", "Clear about what it\nmeasures — and what it can't"),
]


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def board(w=W, h=H):
    """The app's own background: a near-black field with the indigo bloom the screens sit in."""
    img = Image.new("RGB", (w, h), BG)
    glow = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(glow)
    d.ellipse((-w * 0.3, -h * 0.29, w * 1.3, h * 0.32), fill=(46, 33, 92))
    d.ellipse((w - h * 0.27, h - h * 0.36, w + h * 0.22, h * 1.15), fill=(52, 26, 60))
    return Image.blend(img, glow.filter(ImageFilter.GaussianBlur(h * 0.115)), 0.85)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def compose(name, caption):
    shot = Image.open(os.path.join(RAW, f"{name}.png")).convert("RGB")
    device_w = 760
    device_h = round(shot.size[1] * device_w / shot.size[0])
    shot = shot.resize((device_w, device_h), Image.LANCZOS)

    canvas = board()
    draw = ImageDraw.Draw(canvas)

    title = font("Figtree_600SemiBold.ttf", 62)
    y = 96
    for line in caption.split("\n"):
        draw.text((W // 2, y), line, font=title, fill=(244, 241, 255), anchor="ma")
        y += 76

    device = rounded(shot, 46)
    # A hairline edge so the near-black screen does not dissolve into the near-black board.
    edge = Image.new("RGBA", (device_w + 4, device_h + 4), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        (0, 0, device_w + 3, device_h + 3), radius=48, outline=(255, 255, 255, 46), width=2
    )

    x = (W - device_w) // 2
    top = H - device_h - 24
    canvas.paste(device, (x, top), device)
    canvas.paste(edge, (x - 2, top - 2), edge)

    path = os.path.join(OUT, f"{name}.png")
    canvas.save(path)
    return path


def feature_graphic():
    """1024x500, shown at the top of the listing. No screenshot in it — Play crops it unpredictably
    across surfaces, so it carries only the name, the line, and the mark."""
    fw, fh = 1024, 500
    img = board(fw, fh)
    draw = ImageDraw.Draw(img)

    icon = Image.open(os.path.join(ROOT, "assets", "android-icon-foreground.png")).convert("RGBA")
    icon = icon.resize((188, 188), Image.LANCZOS)
    img.paste(icon, (92, 156), icon)

    draw.text((320, 172), "Somno", font=font("InstrumentSerif_400Regular.ttf", 104), fill=(246, 243, 255))
    draw.text(
        (324, 296),
        "Measure how tired you actually are.",
        font=font("Figtree_500Medium.ttf", 36),
        fill=(186, 176, 224),
    )
    path = os.path.join(OUT, "feature-graphic.png")
    img.save(path)
    return path


def store_icon():
    """Play wants exactly 512x512 for the listing icon; the app ships a 1024 master."""
    icon = Image.open(os.path.join(ROOT, "assets", "icon.png")).convert("RGB").resize((512, 512), Image.LANCZOS)
    path = os.path.join(OUT, "icon-512.png")
    icon.save(path)
    return path


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, caption in CAPTIONS:
        print("  ", compose(name, caption))
    print("  ", feature_graphic())
    print("  ", store_icon())
