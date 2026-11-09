#!/usr/bin/env python3
"""Draw apps/novanex_tyres/icon.png (140 x 140, transparent): a tyre with a pressure gauge.
   python3 tools/novanex_tyres/make_tyre_icon.py"""
import math, os
from PIL import Image, ImageDraw

S = 560                                   # drawn 4x, scaled down for smooth edges
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# tyre: dark ring with tread blocks, silver rim
cx, cy, R = 250, 290, 230
d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(28, 30, 36, 255))
for i in range(28):                        # tread blocks on the outside
    a = 2 * math.pi * i / 28
    x0, y0 = cx + math.cos(a) * (R - 6), cy + math.sin(a) * (R - 6)
    x1, y1 = cx + math.cos(a) * (R - 46), cy + math.sin(a) * (R - 46)
    d.line([x0, y0, x1, y1], fill=(60, 64, 74, 255), width=14)
d.ellipse([cx - 150, cy - 150, cx + 150, cy + 150], fill=(196, 202, 212, 255))
d.ellipse([cx - 128, cy - 128, cx + 128, cy + 128], fill=(120, 126, 138, 255))
for i in range(5):                         # spokes
    a = 2 * math.pi * i / 5 - math.pi / 2
    d.line([cx, cy, cx + math.cos(a) * 124, cy + math.sin(a) * 124], fill=(214, 218, 226, 255), width=30)
d.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], fill=(70, 76, 88, 255))

# gauge, top right, over the tyre
gx, gy, gr = 410, 150, 140
d.ellipse([gx - gr - 10, gy - gr - 10, gx + gr + 10, gy + gr + 10], fill=(20, 22, 28, 255))
d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=(245, 247, 250, 255))
# scale arc: red (low) -> green -> amber (high)
for start, end, col in ((135, 195, (230, 50, 50, 255)), (195, 345, (47, 210, 122, 255)), (345, 405, (255, 176, 32, 255))):
    d.arc([gx - gr + 18, gy - gr + 18, gx + gr - 18, gy + gr - 18], start, end, fill=col, width=26)
a = math.radians(285)                      # needle in the green
d.line([gx, gy, gx + math.cos(a) * (gr - 40), gy + math.sin(a) * (gr - 40)], fill=(20, 22, 28, 255), width=16)
d.ellipse([gx - 20, gy - 20, gx + 20, gy + 20], fill=(20, 22, 28, 255))

out = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'novanex_tyres', 'icon.png')
img.resize((140, 140), Image.LANCZOS).save(out)
print('wrote', os.path.normpath(out))
