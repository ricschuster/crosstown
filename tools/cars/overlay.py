"""Lay our Kestrel's side silhouette over a reference side view and print where they differ.

Why: the shape was tuned by eye against the reference render, and "close" is not a number. The
reference is our own FLUX.1-schnell image (docs/research/car-pilot-trellis.md, "Shape
measurement"), framed by its wheel centres: front hub at column 170, rear at 785, ground at row
554, so 250 px per metre against our 2.46 m wheelbase. `sideview.py` renders ours at that scale.

  python3 tools/cars/overlay.py REFERENCE.png OURS.png OUT.png

Prints the top and bottom edge of each silhouette at fifteen stations from tail to nose, as a
height above the ground in metres, and the difference (ours minus reference). Writes the
reference with our outline in cyan and the reference's in yellow.
"""
import sys
import numpy as np
from PIL import Image

PXM, GROUND, FRONT_HUB, REAR_HUB = 250.0, 554, 170.0, 785.0
ref = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
ours = np.asarray(Image.open(sys.argv[2]).convert('RGBA'))
H, W = ref.shape[:2]

# Reference mask: the car is saturated red or dark; the backdrop is pale grey and the floor
# shadow lies below the ground line, which is cut off.
mx, mn = ref.max(2), ref.min(2)
sat = (mx - mn) / np.maximum(mx, 1)
mask_ref = (sat > 0.35) | (mx < 90)
mask_ref[GROUND + 4:] = False
mask_ours = ours[:, :, 3] > 128

def edges(mask, col):
    rows = np.flatnonzero(mask[:, col])
    return (None, None) if len(rows) < 3 else (rows[0], rows[-1])

cars_x = lambda y: REAR_HUB + (FRONT_HUB - REAR_HUB) * y     # t 0 tail .. 1 nose, along hub to hub
x_tail = int(REAR_HUB + 0.0)
rows = []
print(' t    x    top ref  top ours  d    bottom ref  bottom ours  d   (heights above ground, m)')
xs_all = np.flatnonzero(mask_ref.any(0)); lo, hi = xs_all[0], xs_all[-1]
for k in range(15):
    col = int(hi - (hi - lo) * (k + 0.5) / 15)
    t = (k + 0.5) / 15
    tr, br = edges(mask_ref, col); to, bo = edges(mask_ours, col)
    if tr is None or to is None: continue
    h = lambda r: (GROUND - r) / PXM
    print(f'{t:.2f}  {col:4d}   {h(tr):.2f}    {h(to):.2f}   {h(to) - h(tr):+.2f}      {h(br):.2f}       {h(bo):.2f}     {h(bo) - h(br):+.2f}')
print(f'length ref {(hi - lo) / PXM:.2f} m, ours {(np.flatnonzero(mask_ours.any(0))[-1] - np.flatnonzero(mask_ours.any(0))[0]) / PXM:.2f} m')

def outline(mask):
    e = mask & ~(np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))
    return e
img = ref.copy()
for m, c in ((outline(mask_ref), (255, 220, 0)), (outline(mask_ours), (0, 230, 255))):
    ys, xs = np.nonzero(m)
    for dy in (0, 1):
        for dx in (0, 1):
            img[np.clip(ys + dy, 0, H - 1), np.clip(xs + dx, 0, W - 1)] = c
Image.fromarray(img.astype(np.uint8)).save(sys.argv[3])
