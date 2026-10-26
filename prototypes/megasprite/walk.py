"""Scripted overworld walk, Game Boy style: a MEGA gets a homework job, walks
tile by tile to the desk station, faces it and works. Driven by a tiny script
the way the app's job events would drive it."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1])
NAME = sys.argv[2] if len(sys.argv) > 2 else "teal"
frames = json.loads((OUT / "frames.json").read_text())[NAME]

TILE, COLS, ROWS, SCALE = 32, 8, 6, 3
OUTLINE = (27, 26, 58)
FLOOR_A, FLOOR_B, SEAM = (236, 214, 168), (226, 202, 154), (205, 178, 128)
WALL, TRIM = (214, 200, 236), (170, 150, 205)
STATIONS = {"desk": {"tile": (6, 1), "stand": (6, 2), "facing": "back"}}
SUBSTEPS, STEP_MS = 4, 65


def to_img(f):
    img = Image.new("RGBA", (f["w"], f["h"]))
    img.putdata([(0, 0, 0, 0) if c is None else tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for c in f["px"]])
    return img


def room():
    img = Image.new("RGB", (TILE * COLS, TILE * ROWS), FLOOR_A)
    d = ImageDraw.Draw(img)
    for ty in range(1, ROWS):
        for tx in range(COLS):
            x, y = tx * TILE, ty * TILE
            d.rectangle([x, y, x + TILE - 1, y + TILE - 1], fill=FLOOR_A if (tx + ty) % 2 else FLOOR_B)
            for py in (y + 10, y + 21):
                d.line([x, py, x + TILE - 1, py], fill=SEAM)
    d.rectangle([0, 0, TILE * COLS - 1, TILE - 1], fill=WALL)
    d.rectangle([0, TILE - 5, TILE * COLS - 1, TILE - 1], fill=TRIM)
    # Wall calendar and window
    d.rectangle([60, 6, 80, 22], fill=(250, 250, 250), outline=OUTLINE)
    d.rectangle([60, 6, 80, 10], fill=(240, 110, 100), outline=OUTLINE)
    d.rectangle([110, 4, 146, 22], fill=(150, 210, 245), outline=OUTLINE)
    d.line([128, 4, 128, 22], fill=OUTLINE)
    # Desk with computer (the homework station)
    x, y = STATIONS["desk"]["tile"][0] * TILE, STATIONS["desk"]["tile"][1] * TILE
    d.rectangle([x - 4, y + 6, x + TILE + 3, y + 22], fill=(170, 112, 70), outline=OUTLINE)
    d.rectangle([x - 2, y + 22, x + 2, y + 30], fill=(130, 84, 52), outline=OUTLINE)
    d.rectangle([x + TILE - 3, y + 22, x + TILE + 1, y + 30], fill=(130, 84, 52), outline=OUTLINE)
    d.rectangle([x + 6, y - 10, x + 26, y + 6], fill=(60, 64, 90), outline=OUTLINE)
    d.rectangle([x + 9, y - 7, x + 23, y + 3], fill=(120, 230, 210))
    # Rug and plant
    d.ellipse([20, 120, 100, 160], fill=(214, 128, 128), outline=OUTLINE)
    d.rectangle([236, 44, 252, 60], fill=(190, 110, 70), outline=OUTLINE)
    d.ellipse([232, 28, 255, 48], fill=(90, 170, 90), outline=OUTLINE)
    return img


BASE = room()


def bubble(d, x, y, kind):
    d.rectangle([x, y, x + 13, y + 11], fill=(255, 255, 255), outline=OUTLINE)
    d.polygon([(x + 3, y + 11), (x + 7, y + 11), (x + 3, y + 15)], fill=(255, 255, 255), outline=OUTLINE)
    if kind == "!":
        d.rectangle([x + 6, y + 2, x + 7, y + 6], fill=(220, 60, 60))
        d.rectangle([x + 6, y + 8, x + 7, y + 9], fill=(220, 60, 60))
    else:
        for i in range(3):
            d.rectangle([x + 3 + i * 3, y + 5, x + 4 + i * 3, y + 6], fill=OUTLINE)


try:
    FONT = ImageFont.load_default(size=22)
except TypeError:
    FONT = ImageFont.load_default()


def compose(key, px, py, emote=None, text=None):
    img = BASE.copy()
    d = ImageDraw.Draw(img)
    d.ellipse([px + 8, py + 36, px + 24, py + 40], fill=SEAM)
    s = to_img(frames[key])
    img.paste(s, (int(px), int(py)), s)
    if emote:
        bubble(d, int(px) + 22, int(py) - 6, emote)
    big = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    if text:
        bd = ImageDraw.Draw(big)
        h = big.height
        bd.rectangle([12, h - 92, big.width - 12, h - 12], fill=(250, 250, 250), outline=OUTLINE, width=6)
        bd.text((36, h - 70), text, fill=OUTLINE, font=FONT)
    return big


def pos(tile):
    return tile[0] * TILE, tile[1] * TILE - 8


script = [
    ("idle", (1, 4), 8, None, None),
    ("blink", (1, 4), 3, None, None),
    ("idle", (1, 4), 6, "!", "New job: help with math homework!"),
    ("walk", [(2, 4), (3, 4), (4, 4), (5, 4), (6, 4)], "right", None, None),
    ("walk", [(6, 3), (6, 2)], "back", None, None),
    ("work", (6, 2), 22, "...", "Teal is at the desk working on math."),
]

out, durations, tile, foot = [], [], (1, 4), 0
for step in script:
    kind = step[0]
    if kind in ("idle", "blink", "work"):
        _, tile, n, emote, text = step
        view = "back_stand" if kind == "work" else ("front_closed" if kind == "blink" else "front_open")
        for i in range(n):
            out.append(compose(view, *pos(tile), emote if (kind != "work" or i % 8 < 6) else None, text))
            durations.append(120)
    else:
        _, path, facing, _, _ = step
        for nxt in path:
            (x0, y0), (x1, y1) = pos(tile), pos(nxt)
            step_frame = "stepL" if foot % 2 == 0 else "stepR"
            for k in range(1, SUBSTEPS + 1):
                f = step_frame if k <= SUBSTEPS // 2 else "stand"
                out.append(compose(f"{facing}_{f}", x0 + (x1 - x0) * k / SUBSTEPS, y0 + (y1 - y0) * k / SUBSTEPS))
                durations.append(STEP_MS)
            tile, foot = nxt, foot + 1

gif = OUT / f"walk_{NAME}.gif"
out[0].save(gif, save_all=True, append_images=out[1:], duration=durations, loop=0, disposal=2)
out[30].save(OUT / f"walk_{NAME}_mid.png")
out[-1].save(OUT / f"walk_{NAME}_end.png")
print(len(out), "frames ->", gif)
