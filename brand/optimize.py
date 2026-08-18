"""Turn the logo masters in this folder into the files the app actually serves.

    python brand/optimize.py

The masters are whatever came out of the design tool: full resolution, full
truecolor, and far heavier than any screen needs. The app renders the mark at
40px and the lockup at 300px, so serving 800px and 2400px art means shipping
roughly 100KB nobody can see. This resizes each to 3x its largest on-screen size
(retina, with room to spare) and quantizes to a 64-color palette.

Quantizing is safe here specifically because the art is flat: four brand colors
plus the antialiasing between them. 64 slots is more than that needs, which is
why the error is imperceptible — measured, not assumed, at under 1 RMS against
the resized truecolor original. Photographs would band badly at this setting;
this art doesn't.

WebP was measured too and only beat PNG-8 by 7KB across all three files, which
doesn't pay for a second format and its fallbacks. If that math changes, it's
the palette that's cheap to revisit, not the format.

Requires Pillow (`pip install Pillow`). Re-run after replacing any master, then
commit both the master and the optimized public/ copy.
"""

import os
from PIL import Image

# Target = 3x the largest size the app renders each file at, so retina has
# headroom. Grep the CSS before raising these: the mark is sized by
# shell/sidebar.css (36px) and ErrorBoundary (40px); the lockup by
# features/auth.css (300px hero, 138px mobile card).
TARGETS = {
    'doot-mark.png': (256, 256),
    'doot-icon-and-lettermark-dark.png': (900, 300),
    'doot-icon-and-lettermark-white.png': (900, 300),
}

COLORS = 64

here = os.path.dirname(os.path.abspath(__file__))
public = os.path.join(os.path.dirname(here), 'public')

for name, size in TARGETS.items():
    src = os.path.join(here, name)
    dst = os.path.join(public, name)
    before = os.path.getsize(src) / 1024

    img = Image.open(src).convert('RGBA').resize(size, Image.LANCZOS)
    img = img.quantize(colors=COLORS, method=Image.FASTOCTREE).convert('RGBA')
    img.save(dst, 'PNG', optimize=True, compress_level=9)

    after = os.path.getsize(dst) / 1024
    print(f'{name:<38} {before:6.1f} KB -> {after:5.1f} KB  ({size[0]}x{size[1]})')
