#!/usr/bin/env python3
"""Build "El Mohan" low-poly test figure as a binary glTF 2.0 (.glb).

Pure Python standard library. All geometry is procedural (lathe / loft
primitives), flat shaded (vertices duplicated per triangle), with a few
PBR materials and one looping "Idle" animation.

Units: meters. Feet at y=0, figure faces +Z.

Usage: python3 tools/build_mohan.py [output.glb]
"""

import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "..", "assets", "mohan-prueba.glb")

# ---------------------------------------------------------------------------
# Small vector helpers
# ---------------------------------------------------------------------------


def v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def v_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def v_len(a):
    return math.sqrt(v_dot(a, a))


def v_norm(a):
    length = v_len(a)
    if length < 1e-12:
        return (0.0, 1.0, 0.0)
    return (a[0] / length, a[1] / length, a[2] / length)


def rot_x(p, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c)


def rot_y(p, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c)


def rot_z(p, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2])


def hash01(i, salt=0):
    """Deterministic pseudo-random value in [0, 1) (no random module needed)."""
    x = math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
    return x - math.floor(x)


# ---------------------------------------------------------------------------
# Primitive builders. Every builder returns a list of triangles (p0, p1, p2)
# wound counter-clockwise when seen from outside.
# ---------------------------------------------------------------------------


def tri_area(a, b, c):
    return 0.5 * v_len(v_cross(v_sub(b, a), v_sub(c, a)))


def loft(rings, wrap=False):
    """Connect consecutive rings into a closed surface.

    A ring is a list of points; a ring with a single point acts as a cap
    apex. Multi-point rings must have the same count. Ring points follow
    the angle convention (sin(t), cos(t)) with t increasing, and rings go
    from top to bottom, which yields outward-facing triangles.
    wrap=True also connects the last ring back to the first (torus-like).
    """
    tris = []
    count = max(len(r) for r in rings)
    pairs = list(zip(rings[:-1], rings[1:]))
    if wrap:
        pairs.append((rings[-1], rings[0]))
    for upper, lower in pairs:
        for j in range(count):
            j2 = (j + 1) % count
            a = upper[0] if len(upper) == 1 else upper[j]
            d = upper[0] if len(upper) == 1 else upper[j2]
            b = lower[0] if len(lower) == 1 else lower[j]
            c = lower[0] if len(lower) == 1 else lower[j2]
            for t in ((a, b, c), (a, c, d)):
                if tri_area(*t) > 1e-12:
                    tris.append(t)
    return tris


def ring(center, rx, rz, segments, y_jitter=None, r_jitter=None, phase=0.0):
    """Horizontal ellipse ring around 'center'."""
    pts = []
    for j in range(segments):
        t = phase + 2.0 * math.pi * j / segments
        k = 1.0 + (r_jitter(j) if r_jitter else 0.0)
        dy = y_jitter(j) if y_jitter else 0.0
        pts.append((center[0] + rx * k * math.sin(t),
                    center[1] + dy,
                    center[2] + rz * k * math.cos(t)))
    return pts


def lathe(profile, segments, center=(0.0, 0.0, 0.0), r_jitter=None,
          scale_z=1.0, wrap=False, phase=0.0):
    """Revolve a (radius, y) profile around the Y axis (top to bottom)."""
    rings = []
    for r, y in profile:
        c = (center[0], center[1] + y, center[2])
        if r <= 0.0:
            rings.append([c])
        else:
            rings.append(ring(c, r, r * scale_z, segments,
                              r_jitter=r_jitter, phase=phase))
    return loft(rings, wrap=wrap)


def ellipsoid(center, rx, ry, rz, segments=8, stacks=6, phase=0.0):
    profile = []
    for i in range(stacks + 1):
        a = math.pi * i / stacks
        profile.append((math.sin(a), math.cos(a)))
    rings = []
    for s, c in profile:
        p = (center[0], center[1] + ry * c, center[2])
        if s < 1e-9:
            rings.append([p])
        else:
            rings.append(ring(p, rx * s, rz * s, segments, phase=phase))
    return loft(rings)


def transform(tris, fn):
    return [tuple(fn(p) for p in t) for t in tris]


def signed_volume(tris):
    vol = 0.0
    for a, b, c in tris:
        vol += v_dot(a, v_cross(b, c)) / 6.0
    return vol


def solid(tris):
    """Safety net: make sure a closed part has outward-facing triangles."""
    if signed_volume(tris) < 0.0:
        tris = [(a, c, b) for a, b, c in tris]
    return tris


def strand(top, length, radius, segments=5, bend=(0.0, 0.0), steps=4):
    """Thin tapered hanging strand (algae / hair lock), top to bottom."""
    rings = []
    for i in range(steps + 1):
        f = i / steps
        c = (top[0] + bend[0] * f * f,
             top[1] - length * f,
             top[2] + bend[1] * f * f)
        r = radius * (1.0 - f) + 0.0004 * f
        rings.append(ring(c, r, r * 0.8, segments))
    rings.insert(0, [top])
    rings.append([(top[0] + bend[0], top[1] - length - 0.003, top[2] + bend[1])])
    return solid(loft(rings))


# ---------------------------------------------------------------------------
# Materials (baseColorFactor is linear in glTF; convert from sRGB picks)
# ---------------------------------------------------------------------------


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


MATERIAL_DEFS = [
    # name,          sRGB color,            roughness
    ("RiverStone",   (0.44, 0.50, 0.56),    0.85),
    ("RiverWater",   (0.16, 0.74, 0.72),    0.35),
    ("Poncho",       (0.50, 0.31, 0.17),    0.85),
    ("PonchoStripe", (0.80, 0.56, 0.20),    0.80),
    ("Skin",         (0.74, 0.50, 0.35),    0.70),
    ("Cloth",        (0.84, 0.79, 0.68),    0.85),
    ("BeardMoss",    (0.47, 0.54, 0.41),    0.90),
    ("Algae",        (0.22, 0.40, 0.25),    0.80),
    ("Straw",        (0.88, 0.72, 0.34),    0.80),
    ("HatBand",      (0.30, 0.17, 0.09),    0.80),
    ("EyeDark",      (0.07, 0.05, 0.04),    0.50),
]
MATERIAL_INDEX = {m[0]: i for i, m in enumerate(MATERIAL_DEFS)}


# ---------------------------------------------------------------------------
# Figure design (all values in meters)
# ---------------------------------------------------------------------------

BASE_TOP = 0.018
HEAD_CENTER = (0.0, 0.208, 0.0)
HEAD_RADIUS = 0.041
HAT_PIVOT = (0.0, 0.243, -0.002)   # Hat node origin (sits on the head)
SHOULDER_Y = 0.150

# Poncho silhouette (radius, y), top to bottom. Also used to drape the beard.
PONCHO_PROFILE = [
    (0.0, 0.174),
    (0.024, 0.174),
    (0.040, 0.164),
    (0.054, 0.146),
    (0.060, 0.100),
    (0.064, 0.056),
    (0.062, 0.046),
    (0.0, 0.046),
]


def poncho_radius(y):
    pts = [p for p in PONCHO_PROFILE if p[0] > 0.0]
    for (r0, y0), (r1, y1) in zip(pts[:-1], pts[1:]):
        if y1 <= y <= y0:
            f = (y0 - y) / (y0 - y1)
            return r0 + (r1 - r0) * f
    return pts[0][0] if y > pts[0][1] else pts[-1][0]


def build_base():
    parts = {}
    # River stone: slightly irregular faceted disc.
    stone_profile = [(0.0, BASE_TOP), (0.058, BASE_TOP), (0.068, 0.014),
                     (0.072, 0.006), (0.066, 0.0), (0.0, 0.0)]
    stone = lathe(stone_profile, 11,
                  r_jitter=lambda j: (hash01(j, 3) - 0.5) * 0.10)
    parts["RiverStone"] = solid(stone)

    # Water ring: annulus with a wavy top, partly tucked under the stone.
    segs = 18
    wave = lambda j: 0.0022 * math.sin(j * 2.1) + 0.0012 * (hash01(j, 7) - 0.5)
    top_inner = ring((0, 0.011, 0), 0.060, 0.060, segs, y_jitter=wave)
    top_outer = ring((0, 0.010, 0), 0.080, 0.080, segs, y_jitter=wave)
    bot_outer = ring((0, 0.0005, 0), 0.082, 0.082, segs)
    bot_inner = ring((0, 0.0005, 0), 0.060, 0.060, segs)
    parts["RiverWater"] = solid(loft([top_inner, top_outer, bot_outer, bot_inner],
                                     wrap=True))
    return parts


def build_body():
    parts = {"Poncho": [], "PonchoStripe": [], "Cloth": [], "Skin": []}
    parts["Poncho"] += solid(lathe(PONCHO_PROFILE, 8, phase=math.pi / 8))
    # Ochre stripe near the hem, slightly proud of the poncho surface.
    stripe = [(0.0, 0.074), (0.0628, 0.074), (0.0648, 0.064),
              (0.0660, 0.058), (0.0, 0.058)]
    parts["PonchoStripe"] += solid(lathe(stripe, 8, phase=math.pi / 8))
    # Second thin stripe higher up for a woven ruana feel.
    stripe2 = [(0.0, 0.124), (0.0596, 0.124), (0.0602, 0.116), (0.0, 0.116)]
    parts["PonchoStripe"] += solid(lathe(stripe2, 8, phase=math.pi / 8))
    # Neck.
    parts["Skin"] += solid(lathe([(0.0, 0.186), (0.016, 0.186),
                                  (0.018, 0.168), (0.0, 0.168)], 6))
    for side in (-1.0, 1.0):
        x = 0.024 * side
        # Rolled-up white trousers (short legs under the poncho).
        leg = [(0.0, 0.052), (0.015, 0.052), (0.013, 0.026), (0.0, 0.026)]
        parts["Cloth"] += solid(lathe(leg, 6, center=(x, 0.0, 0.0)))
        # Bare shin + chunky bare foot pointing forward.
        shin = [(0.0, 0.030), (0.010, 0.030), (0.0095, 0.022), (0.0, 0.022)]
        parts["Skin"] += solid(lathe(shin, 6, center=(x, 0.0, 0.0)))
        parts["Skin"] += solid(ellipsoid((x * 1.05, BASE_TOP + 0.003, 0.010),
                                         0.0125, 0.0075, 0.021, 7, 4))
    return parts


def build_head():
    parts = {"Skin": [], "EyeDark": [], "BeardMoss": []}
    cx, cy, cz = HEAD_CENTER
    parts["Skin"] += solid(ellipsoid(HEAD_CENTER, HEAD_RADIUS, HEAD_RADIUS * 1.02,
                                     HEAD_RADIUS * 0.96, 8, 6, phase=math.pi / 8))
    # Big round nose.
    parts["Skin"] += solid(ellipsoid((0.0, cy - 0.002, cz + HEAD_RADIUS * 0.93),
                                     0.0095, 0.0085, 0.008, 6, 4))
    # Ears.
    for side in (-1.0, 1.0):
        parts["Skin"] += solid(ellipsoid((side * HEAD_RADIUS * 0.98, cy, cz - 0.002),
                                         0.006, 0.010, 0.006, 5, 3))
    # Eyes: small dark lenses set into the face, with bushy mossy brows.
    for side in (-1.0, 1.0):
        ex, ey = side * 0.0150, cy + 0.007
        ez = math.sqrt(max(HEAD_RADIUS ** 2 - ex ** 2 - (ey - cy) ** 2, 0.0)) * 0.96
        parts["EyeDark"] += solid(ellipsoid((ex, ey, ez), 0.0052, 0.0060, 0.0030, 6, 3))
        brow = ellipsoid((ex, ey + 0.0095, ez + 0.0008), 0.0095, 0.0035, 0.0040, 5, 3)
        brow = transform(brow, lambda p, s=side, x0=ex, y0=ey + 0.0095:
                         v_add(rot_z(v_sub(p, (x0, y0, 0)), -12 * s), (x0, y0, 0)))
        parts["BeardMoss"] += solid(brow)
    return parts


def build_beard():
    parts = {"BeardMoss": [], "Algae": []}
    cx, cy, cz = HEAD_CENTER
    # Beard: lofted from under the nose down over the poncho to a tip.
    levels = [0.200, 0.188, 0.174, 0.160, 0.142, 0.124, 0.106, 0.090, 0.078]
    widths = [0.033, 0.036, 0.037, 0.034, 0.029, 0.023, 0.016, 0.009, 0.004]
    depths = [0.006, 0.009, 0.012, 0.013, 0.011, 0.009, 0.007, 0.005, 0.003]
    segs = 8
    rings = []
    for idx, (y, w, d) in enumerate(zip(levels, widths, depths)):
        dy = y - cy
        face = math.sqrt(max(HEAD_RADIUS ** 2 - dy * dy, 0.0)) * 0.96 - d * 0.35
        chest = poncho_radius(y) * math.cos(math.pi / 8) + d * 0.15
        zc = max(face, chest, 0.016)
        jitter = lambda j, k=idx: (hash01(j * 7 + k, 11) - 0.5) * 0.16
        rings.append(ring((0.0, y, zc), w, d, segs, r_jitter=jitter))
    # Caps: top apex tucked into the face, bottom tip.
    top_cap = [(0.0, levels[0] + 0.004, rings[0][0][2] - 0.006)]
    tip = [(0.0, 0.070, poncho_radius(0.07) + 0.004)]
    parts["BeardMoss"] += solid(loft([top_cap] + rings + [tip]))
    # Mustache: two drooping lobes under the nose.
    for side in (-1.0, 1.0):
        m = ellipsoid((side * 0.010, cy - 0.011, cz + HEAD_RADIUS * 0.90),
                      0.013, 0.0045, 0.006, 6, 3)
        m = transform(m, lambda p, s=side, y0=cy - 0.011:
                      v_add(rot_z(v_sub(p, (0, y0, 0)), 18 * s), (0, y0, 0)))
        parts["BeardMoss"] += solid(m)
    # Long hair at the back of the head down to the shoulders.
    parts["BeardMoss"] += solid(ellipsoid((0.0, cy - 0.016, cz - 0.020),
                                          0.040, 0.040, 0.024, 8, 5))
    # Algae strands hanging from the beard and hair.
    strand_spots = [
        ((-0.024, 0.160), 0.034, (-0.004, 0.006)),
        ((0.023, 0.150), 0.036, (0.004, 0.006)),
        ((-0.010, 0.112), 0.030, (-0.002, 0.007)),
    ]
    for (x, y), length, bend in strand_spots:
        z = poncho_radius(y) * math.cos(math.pi / 8) + 0.006
        parts["Algae"] += strand((x, y, z), length, 0.0042, bend=bend)
    for x in (-0.028, 0.0, 0.028):
        parts["Algae"] += strand((x, cy - 0.040, cz - 0.034), 0.040, 0.004,
                                 bend=(x * 0.2, -0.006))
    return parts


def build_hat():
    """Hat geometry is local to the Hat node origin (HAT_PIVOT)."""
    parts = {"Straw": [], "HatBand": [], "Algae": []}
    # Tall crown + wide drooping brim, one closed profile.
    profile = [
        (0.0, 0.050),
        (0.024, 0.049),
        (0.033, 0.040),
        (0.038, 0.010),
        (0.050, 0.004),
        (0.077, -0.003),
        (0.079, -0.008),
        (0.064, -0.006),
        (0.038, -0.003),
        (0.0, -0.003),
    ]
    tilt_back = lambda p: rot_x(p, -9.0)   # raise the front brim to show the face
    parts["Straw"] += solid(transform(lathe(profile, 10, scale_z=0.96), tilt_back))
    # Dent on top of the crown (pinched sombrero look).
    parts["Straw"] += solid(transform(
        ellipsoid((0.0, 0.049, 0.0), 0.018, 0.005, 0.011, 6, 3), tilt_back))
    band = [(0.0, 0.022), (0.0385, 0.022), (0.0400, 0.010), (0.0, 0.010)]
    parts["HatBand"] += solid(transform(lathe(band, 10, scale_z=0.96), tilt_back))
    # A few algae strands dripping from the brim (river-spirit touch).
    for ang in (35.0, 150.0, 215.0, 320.0):
        a = math.radians(ang)
        r = 0.070
        top = rot_x((r * math.sin(a), -0.005, r * math.cos(a) * 0.96), -9.0)
        parts["Algae"] += strand(top, 0.018, 0.0030, bend=(0.0, 0.0), steps=3)
    return parts


def build_arm(side):
    """Arm geometry local to the shoulder pivot; side=+1 is the figure's left (+X)."""
    parts = {"Poncho": [], "Skin": []}
    length = 0.070
    # Sleeve along -Y, tapering, then a chunky hand.
    sleeve = [(0.0, 0.004), (0.016, 0.0), (0.017, -0.030),
              (0.014, -length), (0.0, -length - 0.002)]
    arm = lathe(sleeve, 7)
    hand = ellipsoid((0.0, -length - 0.010, 0.0), 0.0115, 0.0135, 0.0105, 6, 4)

    def pose(p):
        p = rot_z(p, 14.0 * side)   # swing outwards
        p = rot_x(p, -16.0)         # hands slightly forward
        return p

    parts["Poncho"] += solid(transform(arm, pose))
    parts["Skin"] += solid(transform(hand, pose))
    return parts


# ---------------------------------------------------------------------------
# glTF writer
# ---------------------------------------------------------------------------


class GlbWriter:
    def __init__(self):
        self.bin = bytearray()
        self.buffer_views = []
        self.accessors = []

    def _align(self):
        while len(self.bin) % 4:
            self.bin.append(0)

    def add_view(self, data, target=None):
        self._align()
        view = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.bin += data
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def add_accessor(self, view, comp_type, count, acc_type, vmin=None, vmax=None):
        acc = {"bufferView": view, "byteOffset": 0, "componentType": comp_type,
               "count": count, "type": acc_type}
        if vmin is not None:
            acc["min"] = vmin
            acc["max"] = vmax
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def add_floats(self, values, acc_type, width, with_bounds=False, target=None):
        data = struct.pack("<%df" % len(values), *values)
        view = self.add_view(data, target)
        count = len(values) // width
        vmin = vmax = None
        if with_bounds:
            # Bounds computed from the float32-rounded values actually stored.
            stored = struct.unpack("<%df" % len(values), data)
            vmin = [min(stored[i::width]) for i in range(width)]
            vmax = [max(stored[i::width]) for i in range(width)]
        return self.add_accessor(view, 5126, count, acc_type, vmin, vmax)

    def add_primitive(self, tris, material):
        positions, normals = [], []
        for a, b, c in tris:
            n = v_norm(v_cross(v_sub(b, a), v_sub(c, a)))
            for p in (a, b, c):
                positions += p
                normals += n
        vcount = len(positions) // 3
        if vcount > 65535:
            raise ValueError("primitive too large for uint16 indices")
        pos = self.add_floats(positions, "VEC3", 3, with_bounds=True, target=34962)
        nrm = self.add_floats(normals, "VEC3", 3, target=34962)
        idx_data = struct.pack("<%dH" % vcount, *range(vcount))
        idx_view = self.add_view(idx_data, target=34963)
        idx = self.add_accessor(idx_view, 5123, vcount, "SCALAR",
                                [0], [vcount - 1])
        return {"attributes": {"POSITION": pos, "NORMAL": nrm},
                "indices": idx, "material": MATERIAL_INDEX[material], "mode": 4}


def write_glb(path, gltf, binary):
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(binary) + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
        f.write(bin_bytes)
    return total


def quat_axis(axis, deg):
    h = math.radians(deg) / 2.0
    s = math.sin(h)
    return [axis[0] * s, axis[1] * s, axis[2] * s, math.cos(h)]


def build(out_path):
    w = GlbWriter()
    meshes, nodes = [], []

    def add_mesh(name, parts):
        prims = [w.add_primitive(tris, mat) for mat, tris in parts.items() if tris]
        meshes.append({"name": name, "primitives": prims})
        return len(meshes) - 1

    def add_node(node):
        nodes.append(node)
        return len(nodes) - 1

    tri_total = 0

    def count(parts):
        nonlocal tri_total
        tri_total += sum(len(t) for t in parts.values())
        return parts

    base = add_node({"name": "Base", "mesh": add_mesh("Base", count(build_base()))})
    body = add_node({"name": "Body", "mesh": add_mesh("Body", count(build_body()))})
    head = add_node({"name": "Head", "mesh": add_mesh("Head", count(build_head()))})
    beard = add_node({"name": "Beard", "mesh": add_mesh("Beard", count(build_beard()))})
    hat = add_node({"name": "Hat", "mesh": add_mesh("Hat", count(build_hat())),
                    "translation": list(HAT_PIVOT)})
    arm_l = add_node({"name": "ArmL", "mesh": add_mesh("ArmL", count(build_arm(1.0))),
                      "translation": [0.048, SHOULDER_Y, 0.0]})
    arm_r = add_node({"name": "ArmR", "mesh": add_mesh("ArmR", count(build_arm(-1.0))),
                      "translation": [-0.048, SHOULDER_Y, 0.0]})
    figure = add_node({"name": "Figure",
                       "children": [body, head, beard, hat, arm_l, arm_r]})
    root = add_node({"name": "Mohan", "children": [base, figure]})

    # --- Idle animation: 3 s loop, LINEAR, first key == last key ----------
    duration = 3.0
    keys = 13
    times = [duration * i / (keys - 1) for i in range(keys)]
    bob, sway, tilt = [], [], []
    for i, t in enumerate(times):
        phase = 2.0 * math.pi * (i % (keys - 1)) / (keys - 1)  # last == first
        bob += [0.0, 0.003 * (1.0 - math.cos(phase)), 0.0]
        sway += quat_axis((0.0, 1.0, 0.0), 6.0 * math.sin(phase))
        # Hat tilts slightly, lagging the sway.
        tilt += quat_axis((0.0, 0.0, 1.0), 2.5 * math.sin(phase - 0.9))
    t_acc = w.add_floats(times, "SCALAR", 1, with_bounds=True)
    bob_acc = w.add_floats(bob, "VEC3", 3)
    sway_acc = w.add_floats(sway, "VEC4", 4)
    tilt_acc = w.add_floats(tilt, "VEC4", 4)
    animation = {
        "name": "Idle",
        "samplers": [
            {"input": t_acc, "output": bob_acc, "interpolation": "LINEAR"},
            {"input": t_acc, "output": sway_acc, "interpolation": "LINEAR"},
            {"input": t_acc, "output": tilt_acc, "interpolation": "LINEAR"},
        ],
        "channels": [
            {"sampler": 0, "target": {"node": figure, "path": "translation"}},
            {"sampler": 1, "target": {"node": figure, "path": "rotation"}},
            {"sampler": 2, "target": {"node": hat, "path": "rotation"}},
        ],
    }

    materials = []
    for name, color, rough in MATERIAL_DEFS:
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [round(srgb_to_linear(c), 5) for c in color] + [1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": rough,
            },
        })

    w._align()
    gltf = {
        "asset": {"version": "2.0", "generator": "build_mohan.py (stdlib, original)",
                  "copyright": "Original procedural test figure"},
        "scene": 0,
        "scenes": [{"name": "MohanScene", "nodes": [root]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "animations": [animation],
        "accessors": w.accessors,
        "bufferViews": w.buffer_views,
        "buffers": [{"byteLength": len(w.bin)}],
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    size = write_glb(out_path, gltf, w.bin)
    print("wrote %s (%d bytes, %d triangles)" % (out_path, size, tri_total))


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
