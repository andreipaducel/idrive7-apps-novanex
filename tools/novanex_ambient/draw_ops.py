#!/usr/bin/env python3
"""Turn tools/novanex_tyres/layout_preview.js drawing ops into a PNG (rough look, not the car's exact fonts).
   python3 tools/novanex_tyres/draw_ops.py ops.json out.png"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

FONTS = {'label': 'DejaVuSansCondensed.ttf', 'bold': 'DejaVuSansCondensed-Bold.ttf', 'num': 'DejaVuSansCondensed.ttf'}


def font(kind, size):
    try:
        return ImageFont.truetype(FONTS.get(kind, FONTS['label']), int(size))
    except OSError:
        return ImageFont.load_default()


def color(c):
    c = c.lstrip('#')
    if len(c) == 8:
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4, 6))
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


ops = json.load(open(sys.argv[1]))
img = Image.new('RGBA', (1600, 520), (0, 0, 0, 255))
for op in ops:
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if op[0] == 'rect':
        _, x, y, w, h, r, c = op
        d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=color(c))
    elif op[0] == 'stroke':
        _, x, y, w, h, r, c, lw = op
        d.rounded_rectangle([x, y, x + w, y + h], radius=r, outline=color(c), width=int(lw))
    elif op[0] == 'line':
        _, x0, y0, x1, y1, lw, c = op
        d.line([x0, y0, x1, y1], fill=color(c), width=int(lw))
    elif op[0] == 'text':
        _, s, x, y, size, c, al, kind = op
        f = font(kind, size * 0.92)
        w = d.textlength(s, font=f)
        x = x - w if al == 'right' else x - w / 2 if al == 'center' else x
        d.text((x, y), s, font=f, fill=color(c), anchor='ls')
    img = Image.alpha_composite(img, layer)
img.convert('RGB').save(sys.argv[2])
print('wrote', sys.argv[2])
