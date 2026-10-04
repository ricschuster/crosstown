"""Nudge the Kestrel's ROOF keys in kestrel.py toward the reference silhouette's top edge.

Why: ROOF was tuned by reading overlay.py's table by hand. This reads the same two silhouettes
(see overlay.py for the framing: 250 px/m, ground row 554, hubs at columns 170 and 785) and, for
each ROOF key, moves its height by the difference found at that key's column, damped. The mirror
bumps the top edge by 0.1 m near the windscreen foot, so a difference above 0.08 m is not trusted
and that key is left alone. Only the keys' heights change, never their t.

  python3 tools/cars/fitprofile.py REFERENCE.png OURS.png [--write]

Re-render OURS (sideview.py) after --write and run again until the moves are under 5 mm. Reads
NOSE_T and NOSE_SQUEEZE from kestrel.py to map a key's t to a column.
"""
import re, sys
import numpy as np
from PIL import Image

PXM, GROUND, CENTRE = 250.0, 554, 477.5
src = open('tools/cars/kestrel.py').read()
L = float(re.search(r'^L = ([\d.]+)', src, re.M).group(1))
nt, nsq = (float(x) for x in re.search(r'NOSE_T, NOSE_SQUEEZE = ([\d.]+), ([\d.]+)', src).groups())
block = re.search(r'^ROOF = \[(.*?)\]\n', src, re.M | re.S)
keys = [(float(a), float(b)) for a, b in re.findall(r'\(([\d.]+), (\.?[\d.]+)\)', block.group(1))]

def y_of(t):
    y = -(t - 0.5) * L
    return y if t <= nt else -(nt - 0.5) * L - (t - nt) * L * nsq

ref = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
mx, mn = ref.max(2), ref.min(2)
m_ref = (((mx - mn) / np.maximum(mx, 1)) > 0.35) | (mx < 90)
m_ref[GROUND + 4:] = False
m_our = np.asarray(Image.open(sys.argv[2]).convert('RGBA'))[:, :, 3] > 128
top = lambda m, c: (GROUND - np.flatnonzero(m[:, c])[0]) / PXM
out, worst = [], 0.0
for t, h in keys:
    c = int(round(CENTRE + y_of(t) * 250))
    if not 0 <= c < m_ref.shape[1] or not m_ref[:, c].any() or not m_our[:, c].any():
        out.append((t, h)); continue
    d = top(m_our, c) - top(m_ref, c)
    if abs(d) > 0.08: print(f't {t:.3f} col {c}: d {d:+.3f} not trusted'); out.append((t, h)); continue
    print(f't {t:.3f} col {c}: d {d:+.3f}'); worst = max(worst, abs(d))
    out.append((t, round(h - 0.8 * d, 3)))
print('largest trusted difference', round(worst, 3))
if '--write' in sys.argv:
    new = 'ROOF = [' + ', '.join(f'({t:g}, {h:g})' for t, h in out) + ']\n'
    open('tools/cars/kestrel.py', 'w').write(src.replace(block.group(0), new))
