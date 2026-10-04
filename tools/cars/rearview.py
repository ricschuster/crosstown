"""Compare the Kestrel's width with a reference rear view, as width over height at depths below the roof.

Why: sideview/overlay pin the profile but cannot see width. The reference is our own FLUX.1-schnell
rear render (flux2/p4_s3.png, the one true rear view; its roundel is ignored) and it is a
perspective picture, so only proportions travel: each silhouette is measured as width divided by its
own height (roof to tyre bottom) at fractions of that height. Mirrors show up as a bulge at 0.2-0.3.

  blender -b -P tools/cars/sideview.py -- kestrel.glb OURS.png rear
  python3 tools/cars/rearview.py REFERENCE.png OURS.png

The reference's roof row and tyre-bottom row are measured, not framed (149 and 662 for p4_s3).
"""
import sys
import numpy as np
from PIL import Image

ref = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
mx, mn = ref.max(2), ref.min(2)
m_ref = (((mx - mn) / np.maximum(mx, 1)) > 0.35) | (mx < 90)
m_our = np.asarray(Image.open(sys.argv[2]).convert('RGBA'))[:, :, 3] > 128

def widths(m, top, bot):
    out = []
    for f in (.05, .1, .15, .2, .25, .3, .4, .5, .6, .7, .8, .9):
        r = np.flatnonzero(m[int(top + f * (bot - top))])
        out.append((f, (r.max() - r.min()) / (bot - top)))
    return out
ys = np.nonzero(m_our)[0]
print('depth  ref   ours   d')
for (f, a), (_, b) in zip(widths(m_ref, 149, 662), widths(m_our, ys.min(), ys.max())):
    print(f'{f:.2f}  {a:.3f}  {b:.3f}  {b - a:+.3f}')
