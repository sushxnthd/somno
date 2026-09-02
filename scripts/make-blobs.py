"""
Bakes the ambient blobs into textures.

The design draws every glow as `conic-gradient(from Ndeg, …) + filter: blur(Npx) saturate(N%)`,
animated with a slow rotation. The port reproduced that literally: 48 SVG wedges under an
`feGaussianBlur`, spun by animating the group's rotation.

That is close to the worst thing you can ask a phone to do. `react-native-svg` implements
`feGaussianBlur` on Android by rendering the group to a Bitmap, creating a **RenderScript** context
— deprecated since Android 12, and emulated on modern devices — and blurring through it, with the
radius hard-clamped to 25. All of that ran on every frame of the rotation, over the bridge, because
a rotating `<G>` cannot use the native driver. The result was a slideshow, and because of the clamp
it did not even look right: past a certain size the blob rendered as a hard-edged coloured disc
instead of a glow.

None of that work is per-frame work. A blurred conic gradient is a *static image*; only its
orientation changes. So it is drawn once, here, at build time — with the same maths the CSS uses,
including Chromium's blur(N) = stdDeviation N/2 — and the app rotates the texture on the GPU.

    python3 scripts/make-blobs.py

Writes assets/blobs/<ring>-<step>.png plus a manifest the component imports. Rerun after changing a
ring's colours or adding a blur ratio to the ladder.
"""

import json
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "blobs")

# The four colour rings, in source order, matching src/components/blobRings.ts. The last entry
# repeats the first, exactly as a CSS conic-gradient requires.
RINGS = {
    "cool": ["#8A7BFF", "#B49CFF", "#C9A6FF", "#FFB877", "#8A7BFF"],
    "warm": ["#FFB877", "#E9A2B4", "#C9A6FF", "#8A7BFF", "#FFB877"],
    "dusk": ["#8A7BFF", "#C9A6FF", "#FFB877", "#8A7BFF"],
    "teal": ["#6F86FF", "#C9A6FF", "#8FE3D9", "#6F86FF"],
}

SATURATE = 1.65  # the `saturate(165%)` every blob in the design carries

# Blur radius as a fraction of the disc's diameter, and the whole reason this file can be small:
# every blob in the app lives between 0.113 and 0.232, so the ladder only has to cover that band.
# The rungs are fitted to where those call sites cluster — worst-case snapping error about 4%,
# which is nothing on a soft glow. There is deliberately no headroom beyond the band: a future
# screen asking for something well outside it should be a loud "add a rung", which is what
# `check_call_sites` below prints, rather than a silent snap to the end of the ladder.
RATIOS = [0.113, 0.132, 0.151, 0.176, 0.203, 0.232]

# The disc's diameter inside the texture. Everything is drawn at 4x and downsampled, so the wedge
# seams and the disc edge are properly resolved before the blur touches them.
DISC = 256
SS = 4


def hex_rgb(value):
    v = value.lstrip("#")
    return tuple(int(v[i : i + 2], 16) for i in (0, 2, 4))


def saturate(rgb, s):
    """The Filter Effects saturate() matrix — luminance-preserving, same as the CSS filter."""
    r, g, b = rgb
    out = (
        (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
        (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
        (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
    )
    return tuple(max(0, min(255, round(c))) for c in out)


def ring_color(colors, t):
    """Colour at fractional bearing t (0..1) around a closed ring."""
    n = len(colors) - 1
    x = t % 1.0
    idx = min(n - 1, int(x * n))
    local = x * n - idx
    a, b = hex_rgb(colors[idx]), hex_rgb(colors[idx + 1])
    return tuple(a[i] + (b[i] - a[i]) * local for i in range(3))


def conic_field(colors, size):
    """
    The angular colour sweep, filling the whole square — no disc, no transparency.

    Colour and coverage are deliberately kept apart. Blurring a disc-shaped RGBA image mixes the
    transparent *black* outside the disc into the halo, because PIL (like most 2D libraries) blurs
    the colour channels without premultiplying by alpha; the glow came out about a quarter darker
    than the design's, uniformly. Defining the colour everywhere and blurring coverage separately
    into the alpha channel sidesteps premultiplication entirely, and is what CSS is doing anyway.

    Written per-pixel rather than as wedges: wedges were an SVG workaround for having no angular
    gradient primitive, and they leave seams that only the blur was hiding. Here the exact bearing
    of every pixel is available, so the sweep is continuous.
    """
    img = Image.new("RGB", (size, size))
    px = img.load()
    c = (size - 1) / 2
    import math

    for y in range(size):
        dy = y - c
        for x in range(size):
            dx = x - c
            # Bearing measured from 12 o'clock, clockwise, as `conic-gradient(from 0deg)` does.
            t = (math.atan2(dx, -dy) / (2 * math.pi)) % 1.0
            px[x, y] = saturate(ring_color(colors, t), SATURATE)
    return img


def disc_mask(size):
    """Coverage: solid inside the disc, one pixel of feathering at the rim."""
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    c = (size - 1) / 2
    r = size / 2
    import math

    for y in range(size):
        dy = y - c
        for x in range(size):
            dist = math.hypot(x - c, dy)
            if dist >= r:
                continue
            px[x, y] = 255 if dist < r - 1 else int(255 * (r - dist))
    return mask


_FIELD_CACHE = {}
_MASK_CACHE = {}


def field_for(name, colors):
    """Rendered once per ring and reused across the whole blur ladder."""
    if name not in _FIELD_CACHE:
        _FIELD_CACHE[name] = conic_field(colors, DISC * SS).resize((DISC, DISC), Image.LANCZOS)
    return _FIELD_CACHE[name]


def mask_for():
    if "m" not in _MASK_CACHE:
        _MASK_CACHE["m"] = disc_mask(DISC * SS).resize((DISC, DISC), Image.LANCZOS)
    return _MASK_CACHE["m"]


def bake(name, colors, ratio):
    """
    One texture: the disc, plus the room its blur needs to bleed into.

    In the design the gradient fills the element and the blur spills outside it, so the texture is
    larger than the disc and the component draws it oversized and centred. Three standard deviations
    covers the visible extent of a Gaussian, and Chromium renders `blur(N)` at sd = N/2.
    """
    blur_px = ratio * DISC
    sd = blur_px / 2
    # Four standard deviations of room, not three. At 3σ a Gaussian is still at about 1% of peak,
    # and since the colour field is full brightness everywhere, that 1% is a faint but *uniform*
    # alpha right up to the texture's edge — where it stops dead. Against a near-black screen that
    # reads as a square outline around the glow. At 4σ it is under a thousandth, and the explicit
    # feather below takes what remains to nothing.
    pad = int(4 * sd) + 2
    canvas_px = DISC + 2 * pad

    # Colour: the sweep, extended to the edges of the canvas so the blur has real colour to pull
    # from rather than transparent black. `edge` replication is what a premultiplied blur would
    # have produced inside the halo, without the round trip.
    field = field_for(name, colors).resize((canvas_px, canvas_px), Image.LANCZOS)
    # Coverage: the disc, at its true size within the canvas.
    mask = Image.new("L", (canvas_px, canvas_px), 0)
    disc = mask_for()
    mask.paste(disc, (pad, pad))

    if sd > 0:
        # Both channels get the same blur, which is what compositing-then-blurring would do.
        field = field.filter(ImageFilter.GaussianBlur(sd))
        mask = mask.filter(ImageFilter.GaussianBlur(sd))

    # Force the outermost ring of pixels to nothing, so the texture cannot end on a step no matter
    # how the blur landed. A few pixels at this scale is well under a screen pixel once drawn.
    edge = max(2, canvas_px // 64)
    fade = Image.new("L", (canvas_px, canvas_px), 0)
    ImageDraw.Draw(fade).rectangle((edge, edge, canvas_px - 1 - edge, canvas_px - 1 - edge), fill=255)
    fade = fade.filter(ImageFilter.GaussianBlur(edge / 2))
    mask = ImageChops.multiply(mask, fade)

    canvas = field.convert("RGBA")
    canvas.putalpha(mask)

    # Textures are only ever drawn soft and scaled up, and the GPU's bilinear filtering softens
    # them further on the way — which is the same direction as the blur, so a smaller texture costs
    # nothing visible. The sharp rungs keep more pixels because their disc edge is still an edge.
    # 128 across the ladder. At these blur radii the texture's finest feature is several pixels
    # wide before it is drawn, and it is then upscaled about 2x with bilinear filtering — which
    # softens in the same direction the blur already went. Measured against 176: no visible
    # difference, half the bytes.
    target = 128
    canvas = canvas.resize((target, target), Image.LANCZOS)

    # Deliberately NOT palette-quantised. It is five times smaller, but a 256-colour palette
    # cannot hold a smooth radial falloff: the dither lands as concentric contour rings and the
    # colour boundaries turn into hard facets. On the app's signature visual that is not a trade
    # worth 100KB. Size is controlled by the length of the ladder instead.
    path = os.path.join(OUT, f"{name}-{RATIOS.index(ratio)}.png")
    canvas.save(path, optimize=True)
    return canvas_px / DISC, os.path.getsize(path)


TS_HEADER = '''/**
 * The baked ambient-blob textures. GENERATED by scripts/make-blobs.py — do not edit.
 *
 * Metro resolves `require` at build time, so the paths have to be literal and the ladder has to be
 * mirrored here. Both are written out by the generator rather than kept in step by hand: the
 * overscan figures in particular are geometry the generator knows and a reader would only be
 * guessing at.
 */

export const BLOB_RATIOS = [{ratios}] as const;

/**
 * How much larger each texture is than the disc inside it.
 *
 * In the design the gradient fills the element and its blur spills outside, so the texture is drawn
 * oversized and centred on the layout box; the disc inside it then lands at exactly `size`.
 */
export const BLOB_OVERSCAN = [{overscan}] as const;

export type BlobRing = {rings};

const TEXTURES: Record<BlobRing, number[]> = {{
{tables}}};

/** The rung whose blur ratio is closest to what the call site asked for. */
export function blobRungFor(size: number, blurPx: number): number {{
  const wanted = blurPx / Math.max(1, size);
  let best = 0;
  for (let i = 1; i < BLOB_RATIOS.length; i++) {{
    if (Math.abs(BLOB_RATIOS[i] - wanted) < Math.abs(BLOB_RATIOS[best] - wanted)) best = i;
  }}
  return best;
}}

export function blobTextureFor(ring: BlobRing, rung: number): number {{
  return TEXTURES[ring][rung];
}}
'''


def write_ts(overscans):
    tables = ""
    for name in RINGS:
        rows = "".join(f"    require('../../assets/blobs/{name}-{i}.png'),\n" for i in range(len(RATIOS)))
        tables += f"  {name}: [\n{rows}  ],\n"
    src = TS_HEADER.format(
        ratios=", ".join(str(r) for r in RATIOS),
        overscan=", ".join(f"{o:.4f}" for o in overscans),
        rings=" | ".join(f"'{n}'" for n in RINGS),
        tables=tables,
    )
    path = os.path.join(ROOT, "src", "components", "blobTextures.ts")
    with open(path, "w") as f:
        f.write(src)
    return path


def check_call_sites():
    """
    Reads every blob in the app and reports how far the ladder is from what it asked for.

    The ladder is only cheap because it covers a narrow band, and nothing else would notice if a new
    screen asked for a glow well outside it — the component would silently snap to an end rung and
    the blob would come out visibly wrong. So the generator goes and looks.
    """
    import glob
    import math
    import re

    worst = 0.0
    outside = []
    for path in glob.glob(os.path.join(ROOT, "src", "**", "*.tsx"), recursive=True):
        for m in re.finditer(r"<(?:AmbientBlob|ConicBlob)\b([^>]*?)/>", open(path).read(), re.S):
            attrs = m.group(1)
            size_m = re.search(r"size=\{([^}]+)\}", attrs)
            blur_m = re.search(r"blurPx=\{(\d+)\}", attrs)
            if not size_m or not blur_m:
                continue
            try:
                # `size={size * 1.125}` inside a component: every such component's own default is
                # 224–238, so 230 is representative to within a couple of percent.
                size = eval(size_m.group(1), {}, {"size": 230})
            except Exception:
                continue
            ratio = int(blur_m.group(1)) / size
            nearest = min(RATIOS, key=lambda r: abs(math.log(r / ratio)))
            err = abs(math.log(nearest / ratio))
            worst = max(worst, err)
            # Judged by how wrong the nearest rung is, not by whether the ratio sits inside the
            # ladder's endpoints — a call site a hair under the bottom rung is served perfectly
            # well by it, and flagging that is just noise. 12% is roughly where a difference in
            # halo softness starts to be visible against the design.
            if math.exp(err) - 1 > 0.12:
                outside.append((os.path.basename(path), round(ratio, 3), round(100 * (math.exp(err) - 1))))
    print(f"   call sites: worst snap {100 * (math.exp(worst) - 1):.1f}%")
    for name, ratio, pct in outside:
        print(f"   !! {name} asks for ratio {ratio} — nearest rung is {pct}% off; add one")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    manifest = {"ratios": RATIOS, "overscan": [], "rings": list(RINGS)}
    total = 0
    for ratio in RATIOS:
        overscan = None
        for name, colors in RINGS.items():
            overscan, size = bake(name, colors, ratio)
            total += size
        manifest["overscan"].append(round(overscan, 4))
        print(f"  ratio {ratio:<5} overscan {overscan:.3f}")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print("  ", write_ts(manifest["overscan"]))
    check_call_sites()
    print(f"  {len(RATIOS) * len(RINGS)} textures, {total / 1024:.0f}KB total")
