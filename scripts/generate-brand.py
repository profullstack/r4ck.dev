"""Rasterise the r4ck mark into every PNG the PWA and OG tags need. PIL only."""
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'web', 'public')
GROUND = (11, 13, 18)
ACCENT = (190, 242, 100)
ACCENT2 = (110, 231, 249)
FG = (236, 239, 244)

def mark(size, pad_ratio=0.16, bg=GROUND, rounded=True):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)
    pad = int(size * pad_ratio)
    inner = size - 2 * pad
    # four rack units, the third lit
    gap = int(inner * 0.08)
    h = (inner - 3 * gap) // 4
    for i in range(4):
        y = pad + i * (h + gap)
        color = ACCENT if i == 2 else (52, 58, 72)
        d.rounded_rectangle([pad, y, pad + inner, y + h], radius=max(2, h // 4), fill=color)
        led = max(2, h // 3)
        lx = pad + inner - int(inner * 0.12)
        ly = y + (h - led) // 2
        d.ellipse([lx, ly, lx + led, ly + led], fill=GROUND if i == 2 else ACCENT2 if i == 0 else (90, 98, 115))
    return img

os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
for s in (48, 96, 128, 192, 256, 384, 512):
    mark(s).save(os.path.join(OUT, 'icons', f'icon-{s}.png'))
mark(512, pad_ratio=0.26, rounded=False).save(os.path.join(OUT, 'icons', 'maskable-512.png'))
mark(180).save(os.path.join(OUT, 'icons', 'apple-touch-icon.png'))
ico = mark(64)
ico.save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
# OG image 1200x630
og = Image.new('RGB', (1200, 630), GROUND)
d = ImageDraw.Draw(og)
for x in range(0, 1200, 40):
    d.line([(x, 0), (x, 630)], fill=(17, 20, 27))
for y in range(0, 630, 40):
    d.line([(0, y), (1200, y)], fill=(17, 20, 27))
m = mark(300)
og.paste(m, (90, 165), m)
try:
    from PIL import ImageFont
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 120)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 40)
except Exception:
    font = small = None
d.text((440, 200), 'r4ck', fill=FG, font=font)
d.text((440, 340), 'the server search engine', fill=(160, 168, 184), font=small)
d.text((440, 395), 'built for agents', fill=ACCENT, font=small)
og.save(os.path.join(OUT, 'og.png'))
print('brand written')
