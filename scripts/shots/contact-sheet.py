#!/usr/bin/env python3
"""Before/after contact sheets for screenshot-judged UI work.

    python3 scripts/shots/contact-sheet.py BEFORE_DIR AFTER_DIR OUT_DIR [--detail x,y,w,h ...]

Pairs PNGs by filename. Each sheet: the full frame before (left) and after
(right) downscaled to 1440 wide, then one row per --detail region cropped at
native resolution (2x shots stay 2x, which is the point: hairlines and glass
edges are judged there). Coordinates are in CSS px of a 1440x900 frame; the
script scales them by the image's own factor, so 1x and 2x shots share a
config. Labels carry the filename and the region so a sheet stands alone.
"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont

def parse(argv):
    dirs = [a for a in argv if not a.startswith('--')]
    details = []
    i = 0
    while i < len(argv):
        if argv[i] == '--detail':
            x, y, w, h = map(int, argv[i + 1].split(','))
            label = argv[i + 2] if i + 2 < len(argv) and not argv[i + 2].startswith('--') and not os.path.isdir(argv[i + 2]) else ''
            details.append((x, y, w, h, label)); i += 3 if label else 2
        else:
            i += 1
    return dirs[0], dirs[1], dirs[2], details

def font(size):
    for f in ['/System/Library/Fonts/SFNS.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf']:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, size)
            except Exception: pass
    return ImageFont.load_default()

def sheet(before, after, out, details):
    b, a = Image.open(before).convert('RGB'), Image.open(after).convert('RGB')
    fb, fa = b.width / 1440, a.width / 1440
    GAP, PAD, LABEL = 24, 24, 34
    W = 1440 * 2 + GAP + PAD * 2
    rows = [(b.resize((1440, round(b.height / fb)), Image.LANCZOS), a.resize((1440, round(a.height / fa)), Image.LANCZOS), 'full frame')]
    for (x, y, w, h, label) in details:
        cb = b.crop((round(x * fb), round(y * fb), round((x + w) * fb), round((y + h) * fb)))
        ca = a.crop((round(x * fa), round(y * fa), round((x + w) * fa), round((y + h) * fa)))
        # Show crops at 2x CSS scale regardless of source so rows line up.
        cb = cb.resize((w * 2, h * 2), Image.LANCZOS if fb < 2 else Image.NEAREST) if cb.width != w * 2 else cb
        ca = ca.resize((w * 2, h * 2), Image.LANCZOS if fa < 2 else Image.NEAREST) if ca.width != w * 2 else ca
        rows.append((cb, ca, f'{label or "detail"}  ({x},{y} {w}x{h} css px, shown 2x)'))
    H = PAD + sum(LABEL + max(r[0].height, r[1].height) + GAP for r in rows) + PAD
    im = Image.new('RGB', (W, H), (28, 28, 30))
    d = ImageDraw.Draw(im)
    f, fs = font(18), font(22)
    name = os.path.basename(before)
    y = PAD
    for (L, R, label) in rows:
        d.text((PAD, y), f'BEFORE   {name}   {label}', fill=(200, 200, 205), font=fs if label == 'full frame' else f)
        d.text((PAD + 1440 + GAP, y), f'AFTER   {name}   {label}', fill=(200, 200, 205), font=fs if label == 'full frame' else f)
        y += LABEL
        im.paste(L, (PAD, y)); im.paste(R, (PAD + 1440 + GAP, y))
        y += max(L.height, R.height) + GAP
    im.save(out, optimize=True)

if __name__ == '__main__':
    bdir, adir, odir, details = parse(sys.argv[1:])
    os.makedirs(odir, exist_ok=True)
    n = 0
    for bp in sorted(glob.glob(os.path.join(bdir, '*.png'))):
        ap = os.path.join(adir, os.path.basename(bp))
        if not os.path.exists(ap):
            print('no after for', os.path.basename(bp)); continue
        op = os.path.join(odir, os.path.basename(bp).replace('.png', '-sheet.png'))
        sheet(bp, ap, op, details); n += 1
        print('sheet', op)
    print(n, 'sheets')
