#!/usr/bin/env python3
"""Draw apps/novanex_ambient/icon.png (140x140, transparent): a glowing ambient light strip
   bending through the colours. python3 tools/novanex_ambient/make_icon.py"""
import colorsys, math, os
from PIL import Image, ImageDraw, ImageFilter

S = 560
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

# a wavy strip of colour dots across the car interior
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
N = 22
for i in range(N):
    f = i / (N - 1)
    x = 70 + f * (S - 140)
    y = S / 2 + math.sin(f * math.pi * 2) * 150
    r, g, b = colorsys.hsv_to_rgb(f, 0.95, 1.0)
    col = (int(r * 255), int(g * 255), int(b * 255), 255)
    gd.ellipse([x - 34, y - 34, x + 34, y + 34], fill=col)
glow = glow.filter(ImageFilter.GaussianBlur(26))
img = Image.alpha_composite(img, glow)

d = ImageDraw.Draw(img)
for i in range(N * 3):
    f = i / (N * 3 - 1)
    x = 70 + f * (S - 140)
    y = S / 2 + math.sin(f * math.pi * 2) * 150
    r, g, b = colorsys.hsv_to_rgb(f, 0.9, 1.0)
    col = (int(r * 255), int(g * 255), int(b * 255), 255)
    d.ellipse([x - 15, y - 15, x + 15, y + 15], fill=col)

out = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'novanex_ambient', 'icon.png')
img.resize((140, 140), Image.LANCZOS).save(out)
print('wrote', os.path.normpath(out))
