# Generates card/mohan-card.svg. Original procedural art, fixed seed.
import math, random, base64, sys

QR = sys.argv[1]
OUT = sys.argv[2]
R = random.Random(7041)

W, H = 660, 880          # 1 unit = 0.1 mm
BL = 30                  # bleed area drawn around the card (3 mm)

GOLD, GOLD_L, GOLD_D = '#c9a227', '#e8c95e', '#8a6d14'
MOSS, MOSS_L, MOSS_P, MOSS_D = '#5c8a4a', '#7fb86a', '#9cc28a', '#3b5c30'
BONE = '#ece6d6'

def f(v): return f'{v:.1f}'.rstrip('0').rstrip('.')

def smooth_closed(pts):
    """Catmull-Rom -> cubic Bezier, closed path."""
    n = len(pts); d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    for i in range(n):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6)
        c2 = (p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6)
        d += f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d + 'Z'

def smooth_open(pts):
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    n = len(pts)
    for i in range(n-1):
        p0 = pts[max(i-1, 0)]; p1 = pts[i]; p2 = pts[i+1]; p3 = pts[min(i+2, n-1)]
        c1 = (p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6)
        c2 = (p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6)
        d += f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d

def blob(cx, cy, rx, ry, rot, k=10, noise=0.18):
    pts = []
    for i in range(k):
        a = 2*math.pi*i/k + R.uniform(-0.15, 0.15)
        r = 1 + R.uniform(-noise, noise)
        x, y = math.cos(a)*rx*r, math.sin(a)*ry*r
        c, s = math.cos(rot), math.sin(rot)
        pts.append((cx + x*c - y*s, cy + x*s + y*c))
    return pts

out = []
def add(s): out.append(s)

# ---------------------------------------------------------------- zones
MED = (322, 274, 164)                   # medallion centre/radius (slightly left of centre)
QRP = (378, 604, 248, 248)              # QR plate x, y, w, h  (QR itself 232 units = 23.2 mm)
TITLE_Y = 516

def in_rect(x, y, r, pad=0):
    x0, y0, w, h = r
    return x0-pad < x < x0+w+pad and y0-pad < y < y0+h+pad

# ---------------------------------------------------------------- header
add(f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="66mm" height="88mm" viewBox="0 0 {W} {H}">
<!-- "El Mohan" collectible card / 8th Wall image target.
     66 x 88 mm (3:4 portrait). 1 user unit = 0.1 mm.
     Original art, generated procedurally (fixed seed) and hand-tuned; no third-party assets.
     Fonts: generic system families only (serif / sans-serif).
     To render the 3 mm bleed version use viewBox="-30 -30 720 940" (art extends into it). -->
<defs>
  <!-- Soft green glow behind the medallion -->
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#8fbf6a" stop-opacity=".55"/>
    <stop offset=".45" stop-color="#5c8a4a" stop-opacity=".28"/>
    <stop offset="1" stop-color="#5c8a4a" stop-opacity="0"/>
  </radialGradient>
  <!-- Deep water inside the medallion -->
  <radialGradient id="water" cx="45%" cy="38%" r="70%">
    <stop offset="0" stop-color="#2a4a2c"/>
    <stop offset=".6" stop-color="#132216"/>
    <stop offset="1" stop-color="#070c08"/>
  </radialGradient>
  <!-- Burnished gold for rings and title -->
  <linearGradient id="gold" x1="0" y1="0" x2=".35" y2="1">
    <stop offset="0" stop-color="#f1d77a"/>
    <stop offset=".45" stop-color="#c9a227"/>
    <stop offset=".75" stop-color="#e2c35a"/>
    <stop offset="1" stop-color="#8a6d14"/>
  </linearGradient>
  <!-- Dark veil used to calm the area under the title -->
  <radialGradient id="veil" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#070906" stop-opacity=".82"/>
    <stop offset=".7" stop-color="#070906" stop-opacity=".7"/>
    <stop offset="1" stop-color="#070906" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="card"><rect x="{-BL}" y="{-BL}" width="{W+2*BL}" height="{H+2*BL}"/></clipPath>
  <clipPath id="medclip"><circle cx="{MED[0]}" cy="{MED[1]}" r="{MED[2]-26}"/></clipPath>
</defs>
<g clip-path="url(#card)">
<!-- Background: wet riverbed -->
<rect x="{-BL}" y="{-BL}" width="{W+2*BL}" height="{H+2*BL}" fill="#0b0f0a"/>''')

# ---------------------------------------------------------------- river stones (Poisson-ish)
add('<!-- River stones: irregular, every one different (dense unique features for tracking) -->')
add('<g id="stones">')
stones = []
tries = 0
while tries < 9000 and len(stones) < 520:
    tries += 1
    x = R.uniform(-BL, W+BL); y = R.uniform(-BL, H+BL)
    r = R.choice([R.uniform(9, 16), R.uniform(14, 26), R.uniform(20, 38)])
    if any((x-sx)**2 + (y-sy)**2 < ((r+sr)*0.86)**2 for sx, sy, sr in stones):
        continue
    stones.append((x, y, r))
fills = ['#1b2218', '#232c20', '#2c3628', '#364232', '#424d3c', '#4e5946', '#1f2a24', '#2d3a33', '#3b3a2c', '#565f4c']
for x, y, r in stones:
    rot = R.uniform(0, math.pi)
    pts = blob(x, y, r, r*R.uniform(0.55, 0.95), rot, k=R.randint(7, 11), noise=0.2)
    fill = R.choice(fills)
    add(f'<path d="{smooth_closed(pts)}" fill="{fill}" stroke="#050705" stroke-width="2.4"/>')
    # light rim on the upper-left side (fixed light direction gives orientation cues)
    a0 = R.uniform(3.4, 3.9); a1 = a0 + R.uniform(0.9, 1.7)
    rr = r*0.78
    x0, y0 = x + math.cos(a0)*rr, y + math.sin(a0)*rr*0.85
    x1, y1 = x + math.cos(a1)*rr, y + math.sin(a1)*rr*0.85
    col = R.choice(['#8d9781', '#6f7a69', '#a9b39b', '#7fb86a', '#b9b3a3'])
    add(f'<path d="M{f(x0)} {f(y0)}Q{f(x+math.cos((a0+a1)/2)*rr*1.25)} {f(y+math.sin((a0+a1)/2)*rr*1.05)} {f(x1)} {f(y1)}" fill="none" stroke="{col}" stroke-width="{f(R.uniform(1.4, 2.8))}" stroke-linecap="round" opacity=".85"/>')
    # moss patch / speckles / crack on some stones
    t = R.random()
    if t < 0.28:
        for _ in range(R.randint(2, 6)):
            mx, my = x + R.uniform(-r*.5, r*.5), y + R.uniform(-r*.4, r*.4)
            add(f'<circle cx="{f(mx)}" cy="{f(my)}" r="{f(R.uniform(1.2, 3.6))}" fill="{R.choice([MOSS, MOSS_L, MOSS_P, MOSS_D])}"/>')
    elif t < 0.48:
        cx0, cy0 = x + R.uniform(-r*.4, r*.4), y + R.uniform(-r*.4, r*.4)
        add(f'<path d="M{f(cx0)} {f(cy0)}l{f(R.uniform(-9, 9))} {f(R.uniform(-9, 9))}l{f(R.uniform(-7, 7))} {f(R.uniform(-7, 7))}" fill="none" stroke="#050705" stroke-width="1.6" stroke-linecap="round"/>')
    elif t < 0.6:
        add(f'<circle cx="{f(x + R.uniform(-r*.3, r*.3))}" cy="{f(y + R.uniform(-r*.3, r*.3))}" r="{f(R.uniform(1.5, 3))}" fill="#c9a227" opacity=".9"/>')
add('</g>')

# ---------------------------------------------------------------- glow + water flow
add('<!-- Green glow around the medallion -->')
add(f'<circle cx="{MED[0]}" cy="{MED[1]}" r="{MED[2]+95}" fill="url(#glow)"/>')

add('<!-- River currents: flowing lines of different lengths and weights across the card -->')
add('<g fill="none" stroke-linecap="round">')
for i in range(26):
    y0 = R.uniform(40, H-40); x = R.uniform(-40, W-80)
    L = R.uniform(70, 230); amp = R.uniform(3, 9); ph = R.uniform(0, 6)
    pts = [(x + L*t/8, y0 + math.sin(ph + t*0.9)*amp + t*R.uniform(-1, 1.5)) for t in range(9)]
    if math.hypot(pts[4][0]-MED[0], pts[4][1]-MED[1]) < MED[2]+10: continue
    if in_rect(pts[4][0], pts[4][1], QRP, 20) or abs(pts[4][1]-TITLE_Y) < 55: continue
    col = R.choice([MOSS_P, MOSS_L, '#b9b3a3', MOSS])
    add(f'<path d="{smooth_open(pts)}" stroke="{col}" stroke-width="{f(R.uniform(1.4, 3.2))}" opacity="{f(R.uniform(.55, .9))}"/>')
add('</g>')

# ---------------------------------------------------------------- plants
def fern(x, y, ang, L, col, n=None):
    """Curved frond with leaflets of decreasing, slightly random size."""
    n = n or R.randint(7, 12)
    bend = R.uniform(-0.5, 0.5)
    spine = []
    for i in range(n+1):
        t = i/n; a = ang + bend*t
        if not spine: spine.append((x, y)); continue
        px, py = spine[-1]
        spine.append((px + math.cos(a)*L/n, py + math.sin(a)*L/n))
    s = [f'<path d="{smooth_open(spine)}" stroke="{col}" stroke-width="2.2" fill="none" stroke-linecap="round"/>']
    for i in range(1, n):
        px, py = spine[i]; a = ang + bend*i/n
        size = (1 - i/n)*L*0.32 + 4
        for side in (-1, 1):
            if R.random() < 0.12: continue
            la = a + side*R.uniform(0.9, 1.3)
            tx, ty = px + math.cos(la)*size, py + math.sin(la)*size
            w = size*0.28
            nx, ny = -math.sin(la)*w, math.cos(la)*w
            mx, my = (px+tx)/2, (py+ty)/2
            s.append(f'<path d="M{f(px)} {f(py)}Q{f(mx+nx)} {f(my+ny)} {f(tx)} {f(ty)}Q{f(mx-nx)} {f(my-ny)} {f(px)} {f(py)}Z" fill="{col}"/>')
    return '\n'.join(s)

def leaf(x, y, ang, L, w, col, vein='#0b0f0a'):
    tx, ty = x + math.cos(ang)*L, y + math.sin(ang)*L
    nx, ny = -math.sin(ang)*w, math.cos(ang)*w
    m1 = (x + (tx-x)*.4, y + (ty-y)*.4)
    d = f'M{f(x)} {f(y)}C{f(m1[0]+nx)} {f(m1[1]+ny)} {f(tx+nx*.3)} {f(ty+ny*.3)} {f(tx)} {f(ty)}C{f(tx-nx*.2)} {f(ty-ny*.2)} {f(m1[0]-nx*.9)} {f(m1[1]-ny*.9)} {f(x)} {f(y)}Z'
    return (f'<path d="{d}" fill="{col}"/>'
            f'<path d="M{f(x)} {f(y)}L{f(x+(tx-x)*.85)} {f(y+(ty-y)*.85)}" stroke="{vein}" stroke-width="1.3" opacity=".7"/>')

def reed(x, y, h, lean, col):
    tx = x + lean; ty = y - h
    s = f'<path d="M{f(x)} {f(y)}Q{f(x+lean*.2)} {f(y-h*.6)} {f(tx)} {f(ty)}" stroke="{col}" stroke-width="{f(R.uniform(2, 3.4))}" fill="none" stroke-linecap="round"/>'
    if R.random() < 0.5:  # cattail head
        s += f'<ellipse cx="{f(x+lean*.55)}" cy="{f(y-h*.72)}" rx="3.6" ry="{f(R.uniform(9, 14))}" transform="rotate({f(math.degrees(math.atan2(lean, h))*0.6)} {f(x+lean*.55)} {f(y-h*.72)})" fill="#6b4f22" stroke="{GOLD}" stroke-width="1"/>'
    return s

def fish(x, y, L, ang, col, eye=True):
    c, s_ = math.cos(ang), math.sin(ang)
    def T(px, py): return (x + px*c - py*s_, y + px*s_ + py*c)
    body = [T(L*.5, 0), T(L*.2, -L*.2), T(-L*.2, -L*.15), T(-L*.42, 0), T(-L*.2, L*.14), T(L*.2, L*.19)]
    tail = [T(-L*.38, 0), T(-L*.62, -L*.17), T(-L*.55, 0), T(-L*.64, L*.16)]
    s = f'<path d="{smooth_closed(body)}" fill="{col}"/>'
    s += f'<path d="M{f(tail[0][0])} {f(tail[0][1])}L{f(tail[1][0])} {f(tail[1][1])}L{f(tail[2][0])} {f(tail[2][1])}L{f(tail[3][0])} {f(tail[3][1])}Z" fill="{col}"/>'
    fin = [T(0, -L*.17), T(-L*.12, -L*.3), T(-L*.18, -L*.15)]
    s += f'<path d="M{f(fin[0][0])} {f(fin[0][1])}L{f(fin[1][0])} {f(fin[1][1])}L{f(fin[2][0])} {f(fin[2][1])}Z" fill="{col}"/>'
    if eye:
        e = T(L*.3, -L*.03)
        s += f'<circle cx="{f(e[0])}" cy="{f(e[1])}" r="{f(max(1.4, L*.035))}" fill="#0b0f0a"/>'
    # gill line
    g0, g1, g2 = T(L*.16, -L*.12), T(L*.11, 0), T(L*.16, L*.12)
    s += f'<path d="M{f(g0[0])} {f(g0[1])}Q{f(g1[0])} {f(g1[1])} {f(g2[0])} {f(g2[1])}" stroke="#0b0f0a" stroke-width="1.3" fill="none"/>'
    return s

add('<!-- Vegetation: ferns, leaves, reeds, roots (all different, placed asymmetrically) -->')
add('<g id="plants">')
# Roots creeping from the top-right corner
for i in range(6):
    x, y = W - R.uniform(0, 60), R.uniform(-20, 40)
    pts = [(x, y)]
    a = R.uniform(2.0, 2.7)
    for k in range(R.randint(5, 8)):
        a += R.uniform(-0.45, 0.45)
        pts.append((pts[-1][0] + math.cos(a)*R.uniform(18, 30), pts[-1][1] + math.sin(a)*R.uniform(18, 30)))
    add(f'<path d="{smooth_open(pts)}" fill="none" stroke="#6b4f22" stroke-width="{f(R.uniform(3, 6))}" stroke-linecap="round"/>')
    add(f'<path d="{smooth_open(pts)}" fill="none" stroke="{GOLD}" stroke-width="1" stroke-linecap="round" opacity=".65"/>')
    for p in pts[2::2]:
        add(f'<path d="M{f(p[0])} {f(p[1])}l{f(R.uniform(-14, 6))} {f(R.uniform(4, 14))}" stroke="#8a6d14" stroke-width="1.4" fill="none" stroke-linecap="round"/>')
# Big fern curling into the left edge, under the medallion
add(fern(-6, 470, -0.95, 210, MOSS_L, 12))
add(fern(10, 210, -0.25, 120, MOSS, 9))
add(fern(560, 470, -2.2, 150, MOSS_P, 10))
add(fern(150, 876, -1.45, 140, MOSS_L, 10))
# Scattered leaves of different shapes
leaf_spots = [(84, 92, -0.6, 46, 13), (590, 150, 2.6, 52, 15), (40, 640, 0.4, 40, 12), (616, 420, 3.6, 38, 10),
              (150, 610, -2.4, 34, 11), (520, 70, 1.9, 30, 9), (270, 860, -1.0, 44, 12), (110, 300, 1.2, 28, 8),
              (640, 330, 2.9, 32, 10), (200, 46, 0.2, 26, 9)]
for x, y, a, L, w in leaf_spots:
    add(leaf(x, y, a, L, w, R.choice([MOSS, MOSS_L, MOSS_P, '#a7c94f'])))
add('</g>')

# ---------------------------------------------------------------- medallion
mx, my, mr = MED
add('<!-- Medallion: gold rings, carved glyph band, river waves, eye of the guardian -->')
add('<g id="medallion">')
add(f'<circle cx="{mx}" cy="{my}" r="{mr+6}" fill="#070906"/>')
add(f'<circle cx="{mx}" cy="{my}" r="{mr}" fill="#121810" stroke="url(#gold)" stroke-width="7"/>')
add(f'<circle cx="{mx}" cy="{my}" r="{mr-24}" fill="url(#water)" stroke="url(#gold)" stroke-width="3"/>')
# Carved band: glyphs of varying shape at irregular angles (no rotational symmetry)
ang = -math.pi/2 + 0.12
kinds = ['diamond', 'dot', 'tri', 'bar', 'spiral', 'dots2', 'chev', 'ring']
while ang < -math.pi/2 + 2*math.pi - 0.1:
    k = R.choice(kinds)
    rr = mr - 12
    gx, gy = mx + math.cos(ang)*rr, my + math.sin(ang)*rr
    deg = math.degrees(ang) + 90
    tr = f'transform="translate({f(gx)} {f(gy)}) rotate({f(deg)})"'
    if k == 'diamond': g = '<path d="M0 -7L4 0L0 7L-4 0Z" fill="#e2c35a"/>'
    elif k == 'dot': g = f'<circle r="{f(R.uniform(2, 3.6))}" fill="#c9a227"/>'
    elif k == 'tri': g = '<path d="M-5 5L0 -6L5 5Z" fill="none" stroke="#e2c35a" stroke-width="1.6"/>'
    elif k == 'bar': g = f'<rect x="-1.5" y="-{f(R.uniform(4, 8))}" width="3" height="{f(R.uniform(8, 14))}" fill="#c9a227"/>'
    elif k == 'spiral': g = '<path d="M0 0a2 2 0 1 1 2 2a4 4 0 1 1 -4 -4a6 6 0 0 1 6 6" fill="none" stroke="#e2c35a" stroke-width="1.4"/>'
    elif k == 'dots2': g = '<circle cx="-4" r="1.8" fill="#e2c35a"/><circle cx="4" r="1.8" fill="#e2c35a"/><circle cy="-5" r="1.4" fill="#9cc28a"/>'
    elif k == 'chev': g = '<path d="M-5 -3L0 3L5 -3" fill="none" stroke="#9cc28a" stroke-width="2"/>'
    else: g = '<circle r="4" fill="none" stroke="#c9a227" stroke-width="1.5"/><circle r="1.2" fill="#c9a227"/>'
    add(f'<g {tr}>{g}</g>')
    ang += R.uniform(0.11, 0.26)
# Big top diamond (like the project emblem) and smaller bottom one
add(f'<path d="M{mx} {my-mr-16}L{mx+10} {my-mr+2}L{mx} {my-mr+20}L{mx-10} {my-mr+2}Z" fill="url(#gold)" stroke="#070906" stroke-width="2"/>')

add('<g clip-path="url(#medclip)">')
# Stars above the river (irregular sizes)
for i in range(22):
    a = R.uniform(0, 2*math.pi); d = R.uniform(40, 130)
    sx, sy = mx + math.cos(a)*d, my - abs(math.sin(a))*d*0.95 - 10
    if math.hypot(sx-mx, sy-(my-58)) < 50: continue
    if R.random() < 0.3:
        z = R.uniform(3, 6)
        add(f'<path d="M{f(sx)} {f(sy-z)}L{f(sx+z*.3)} {f(sy)}L{f(sx)} {f(sy+z)}L{f(sx-z*.3)} {f(sy)}Z M{f(sx-z)} {f(sy)}L{f(sx)} {f(sy+z*.3)}L{f(sx+z)} {f(sy)}L{f(sx)} {f(sy-z*.3)}Z" fill="{BONE}"/>')
    else:
        add(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(R.uniform(1, 2.4))}" fill="{R.choice([BONE, GOLD_L, MOSS_P])}"/>')
# Rays from the eye
for i in range(13):
    a = -math.pi/2 + (i-6)*0.2 + R.uniform(-0.06, 0.06)
    L0, L1 = 30, R.uniform(70, 120)
    ex, ey = mx, my - 58
    add(f'<path d="M{f(ex+math.cos(a)*L0)} {f(ey+math.sin(a)*L0)}L{f(ex+math.cos(a)*L1)} {f(ey+math.sin(a)*L1)}" stroke="#e2c35a" stroke-width="{f(R.uniform(1, 2.4))}" opacity="{f(R.uniform(.35, .75))}"/>')
# Wave bands (moss colours), each with its own wavelength
bands = [(-6, 34, MOSS_P, 6.5), (24, 30, MOSS_L, 5.5), (52, 26, MOSS, 5), (78, 22, '#4d7a3d', 4.2), (100, 19, MOSS_D, 3.6)]
for dy, wl, col, sw in bands:
    y = my + dy; x = mx - 160 + R.uniform(-10, 0)
    d = f'M{f(x)} {f(y)}'
    while x < mx + 170:
        amp = R.uniform(6, 11)
        d += f'q{f(wl/2)} {f(-amp)} {f(wl)} 0t{f(wl)} 0'
        x += 2*wl
    add(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(sw)}" stroke-linecap="round"/>')
    # foam dots along the crest
    for j in range(R.randint(3, 6)):
        add(f'<circle cx="{f(mx + R.uniform(-130, 130))}" cy="{f(y - R.uniform(8, 14))}" r="{f(R.uniform(1.3, 2.6))}" fill="{BONE}" opacity=".8"/>')
# Fish swimming in the medallion (different sizes and directions)
add(fish(mx - 70, my + 96, 44, 0.2, '#e2c35a'))
add(fish(mx + 78, my + 104, 30, 3.0, MOSS_P))
add(fish(mx + 40, my + 10, 22, 2.7, '#c9a227'))
# Pebbles on the bottom of the river
for i in range(9):
    px = mx + R.uniform(-75, 75); py = my + R.uniform(112, 128)
    add(f'<path d="{smooth_closed(blob(px, py, R.uniform(5, 11), R.uniform(3, 6), R.uniform(-.3, .3), 7, .2))}" fill="{R.choice(["#565f4c", "#6f7a69", "#8d9781", "#3b3a2c"])}" stroke="#070906" stroke-width="1.2"/>')
add('</g>')
# Eye of the guardian (almond, gold, slightly tilted for asymmetry)
ex, ey = mx, my - 58
add(f'<g transform="rotate(-4 {ex} {ey})">'
    f'<path d="M{ex-44} {ey}Q{ex} {ey-34} {ex+44} {ey}Q{ex} {ey+30} {ex-44} {ey}Z" fill="#070906" stroke="url(#gold)" stroke-width="4"/>'
    f'<circle cx="{ex+3}" cy="{ey}" r="15" fill="none" stroke="#e2c35a" stroke-width="3"/>'
    f'<circle cx="{ex+3}" cy="{ey}" r="7" fill="#9cc28a"/>'
    f'<circle cx="{ex+6}" cy="{ey-4}" r="2.4" fill="{BONE}"/>'
    f'<path d="M{ex-56} {ey-4}l-12 -6M{ex-54} {ey+6}l-14 4M{ex+50} {ey-8}l10 -9" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>'
    '</g>')
# A leaf and a reed tuft overlapping the ring (breaks the circle's symmetry)
add(leaf(mx + 150, my + 70, 0.9, 70, 18, MOSS_L))
add(leaf(mx + 140, my + 96, 1.5, 54, 13, MOSS))
add(fern(mx - 168, my - 70, -1.9, 90, MOSS_P, 8))
add('</g>')

# ---------------------------------------------------------------- bottom-left scene
add('<!-- Lower river scene: reeds, ripples, fish shadows -->')
add('<g id="scene">')
for i in range(5):
    cx, cy = R.uniform(40, 340), R.uniform(640, 840)
    for k in range(R.randint(2, 4)):
        rx = 14 + k*R.uniform(9, 13); ry = rx*0.35
        a0 = R.uniform(0, 1.5); a1 = a0 + R.uniform(2.2, 4)
        p0 = (cx + math.cos(a0)*rx, cy + math.sin(a0)*ry); p1 = (cx + math.cos(a1)*rx, cy + math.sin(a1)*ry)
        large = 1 if a1 - a0 > math.pi else 0
        add(f'<path d="M{f(p0[0])} {f(p0[1])}A{f(rx)} {f(ry)} 0 {large} 1 {f(p1[0])} {f(p1[1])}" fill="none" stroke="{R.choice([MOSS_P, BONE, MOSS_L])}" stroke-width="{f(2.2 - k*0.35)}" opacity=".85"/>')
for x in [236, 252, 268, 281, 300, 322, 345, 360]:
    if R.random() < 0.85:
        add(reed(x + R.uniform(-4, 4), 872, R.uniform(90, 190), R.uniform(-30, 35), R.choice([MOSS, MOSS_L, '#a7c94f', MOSS_D])))
add(fish(118, 728, 64, -0.35, '#c9a227'))
add(fish(232, 806, 40, 3.4, MOSS_P))
add(fish(70, 800, 28, 0.6, '#e2c35a'))
add('</g>')

# ---------------------------------------------------------------- title cartouche
add('<!-- Title area: dark veil so the gold lettering keeps contrast -->')
add(f'<ellipse cx="{W/2}" cy="{TITLE_Y-8}" rx="270" ry="72" fill="url(#veil)"/>')
# Ornamental rules on either side of the subtitle (different motifs left/right)
add(f'<g fill="none" stroke="#c9a227" stroke-width="2" stroke-linecap="round">'
    f'<path d="M60 {TITLE_Y+44}h90q8 -8 16 0"/>'
    f'<path d="M500 {TITLE_Y+44}h96"/><path d="M500 {TITLE_Y+44}l-8 -6m8 6l-8 6"/>'
    '</g>')
add(f'<circle cx="54" cy="{TITLE_Y+44}" r="4" fill="#e2c35a"/>')
add(f'<path d="M604 {TITLE_Y+38}l6 6l-6 6l-6 -6z" fill="#e2c35a"/>')
add(f'<text x="{W/2}" y="{TITLE_Y}" text-anchor="middle" font-family="serif" font-weight="700" font-size="86" letter-spacing="2" '
    f'fill="url(#gold)" stroke="#070906" stroke-width="5" paint-order="stroke" stroke-linejoin="round">El Mohán</text>')
add(f'<text x="{W/2}" y="{TITLE_Y+52}" text-anchor="middle" font-family="serif" font-style="italic" font-size="31" '
    f'fill="{BONE}" stroke="#070906" stroke-width="4" paint-order="stroke">Guardián de los ríos</text>')

# ---------------------------------------------------------------- frame
add('<!-- Carved frame: double gold line with asymmetric glyphs along the band -->')
FI = 20  # frame inset (2 mm)
add(f'<rect x="{FI}" y="{FI}" width="{W-2*FI}" height="{H-2*FI}" rx="22" fill="none" stroke="#070906" stroke-width="12"/>')
add(f'<rect x="{FI}" y="{FI}" width="{W-2*FI}" height="{H-2*FI}" rx="22" fill="none" stroke="url(#gold)" stroke-width="4"/>')
add(f'<rect x="{FI+9}" y="{FI+9}" width="{W-2*FI-18}" height="{H-2*FI-18}" rx="15" fill="none" stroke="#8a6d14" stroke-width="1.6"/>')
# Glyphs along the outer band (between edge and frame), irregular spacing and shape
def edge_glyphs(x0, y0, x1, y1, normal_deg):
    L = math.hypot(x1-x0, y1-y0); t = R.uniform(10, 30)
    while t < L - 10:
        x = x0 + (x1-x0)*t/L; y = y0 + (y1-y0)*t/L
        if not in_rect(x, y, QRP, 14):
            k = R.choice(kinds)
            tr = f'transform="translate({f(x)} {f(y)}) rotate({normal_deg})"'
            if k == 'diamond': g = '<path d="M0 -5L3 0L0 5L-3 0Z" fill="#e2c35a"/>'
            elif k == 'dot': g = f'<circle r="{f(R.uniform(1.6, 2.8))}" fill="#c9a227"/>'
            elif k == 'tri': g = '<path d="M-4 3L0 -4L4 3Z" fill="#c9a227"/>'
            elif k == 'bar': g = '<rect x="-1" y="-4" width="2" height="8" fill="#9cc28a"/>'
            elif k == 'spiral': g = '<path d="M0 0a1.5 1.5 0 1 1 1.5 1.5a3 3 0 1 1 -3 -3" fill="none" stroke="#e2c35a" stroke-width="1.2"/>'
            elif k == 'dots2': g = '<circle cx="-3" r="1.4" fill="#e2c35a"/><circle cx="3" r="1.4" fill="#9cc28a"/>'
            elif k == 'chev': g = '<path d="M-4 -2L0 2L4 -2" fill="none" stroke="#e2c35a" stroke-width="1.5"/>'
            else: g = '<circle r="3" fill="none" stroke="#c9a227" stroke-width="1.2"/>'
            add(f'<g {tr}>{g}</g>')
        t += R.uniform(14, 40)
add('<g id="edge-glyphs">')
edge_glyphs(40, 9, W-40, 9, 0)
edge_glyphs(W-9, 40, W-9, H-40, 90)
edge_glyphs(W-40, H-9, 40, H-9, 180)
edge_glyphs(9, H-40, 9, 40, 270)
add('</g>')

# Corner ornaments: each corner different
add('<!-- Corner ornaments, deliberately different in each corner -->')
# top-left: gold spiral + leaves
add(f'<g transform="translate(46 50)"><circle r="22" fill="#070906" stroke="url(#gold)" stroke-width="3"/>'
    '<path d="M0 0a3 3 0 1 1 3 3a7 7 0 1 1 -7 -7a11 11 0 1 1 11 11" fill="none" stroke="#e2c35a" stroke-width="2.6" stroke-linecap="round"/></g>')
# top-right: three-stone cairn
add(f'<g transform="translate({W-52} 48)" stroke="#070906" stroke-width="2">'
    '<ellipse cx="0" cy="12" rx="17" ry="8" fill="#c9a227"/><ellipse cx="2" cy="-1" rx="12" ry="6.5" fill="#9cc28a"/><ellipse cx="-1" cy="-12" rx="7" ry="5" fill="#e2c35a"/></g>')
# bottom-left: crescent moon with stars
add(f'<g transform="translate(48 {H-50})"><path d="M8 -18a20 20 0 1 0 0 36a15 15 0 1 1 0 -36z" fill="#e2c35a" stroke="#070906" stroke-width="2"/>'
    '<circle cx="18" cy="-14" r="2.2" fill="#ece6d6"/><circle cx="24" cy="2" r="1.6" fill="#ece6d6"/></g>')

# ---------------------------------------------------------------- top labels
add('<!-- Header: brand label (left) and card number (right) -->')
add(f'<text x="84" y="62" font-family="serif" font-weight="700" font-size="21" letter-spacing="5.5" fill="#e2c35a" stroke="#070906" stroke-width="4" paint-order="stroke">ANCESTRALES</text>')
add(f'<text x="{W-88}" y="62" text-anchor="end" font-family="serif" font-style="italic" font-size="20" fill="{BONE}" stroke="#070906" stroke-width="4" paint-order="stroke">Nº 01</text>')
add(f'<text x="84" y="86" font-family="sans-serif" font-size="13" letter-spacing="2" fill="#9cc28a" stroke="#070906" stroke-width="3" paint-order="stroke">LEYENDAS DE COLOMBIA</text>')

# ---------------------------------------------------------------- QR plate
qx, qy, qw, qh = QRP
b64 = base64.b64encode(open(QR, 'rb').read()).decode()
add('<!-- QR plate: pure black/white QR with its own quiet zone, unrotated, on a white rounded plate -->')
add(f'<rect x="{qx-7}" y="{qy-7}" width="{qw+14}" height="{qh+14}" rx="20" fill="#070906" stroke="url(#gold)" stroke-width="4"/>')
add(f'<rect x="{qx}" y="{qy}" width="{qw}" height="{qh}" rx="14" fill="#ffffff"/>')
add(f'<image x="{qx+8}" y="{qy+8}" width="{qw-16}" height="{qh-16}" style="image-rendering:pixelated" preserveAspectRatio="none" '
    f'href="data:image/png;base64,{b64}" xlink:href="data:image/png;base64,{b64}"/>')
add(f'<text transform="translate({qx-22} {qy+qh}) rotate(-90)" font-family="sans-serif" font-weight="700" font-size="14" letter-spacing="2.2" fill="{BONE}" stroke="#070906" stroke-width="4" paint-order="stroke">ESCANÉAME</text>')
add(f'<path d="M{qx-30} {qy+qh-112}v-18l-5 6m5 -6l5 6" fill="none" stroke="#e2c35a" stroke-width="2" stroke-linecap="round" transform="rotate(90 {qx-30} {qy+qh-121})"/>')
add('</g>')
add('</svg>')
open(OUT, 'w').write('\n'.join(out))
print('stones', len(stones))
