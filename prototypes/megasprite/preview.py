"""Preview for the code-drawn MEGA: a contact sheet of every colourway and view."""
import json
import sys
from pathlib import Path

from PIL import Image

OUT = Path(sys.argv[1])
BG = (20, 19, 43)          # Midnight theme background
frames = json.loads((OUT / "frames.json").read_text())


def sprite(f, scale):
    img = Image.new("RGBA", (f["w"], f["h"]), (0, 0, 0, 0))
    img.putdata([(0, 0, 0, 0) if c is None else tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for c in f["px"]])
    return img.resize((f["w"] * scale, f["h"] * scale), Image.NEAREST)


def sheet():
    cols = ["badge_happy", "front_open", "front_happy", "back_stand", "right_stand", "left_stand", "front_stepL", "right_stepL"]
    scale, cell = 5, 34 * 5
    rows = list(frames)
    img = Image.new("RGB", (cell * len(cols) + 20, 42 * scale * len(rows) + 20), BG)
    for r, name in enumerate(rows):
        for c, key in enumerate(cols):
            s = sprite(frames[name][key], scale)
            x = 10 + c * cell + (cell - s.width) // 2
            y = 10 + r * 42 * scale + (40 * scale - s.height)
            img.paste(s, (x, y), s)
    img.save(OUT / "sheet.png")


sheet()
print("sheet.png")
