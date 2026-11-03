#!/usr/bin/env python3
"""Minimal glTF 2.0 binary (.glb) validator, standard library only.

Checks: GLB header and chunks, JSON parse, required fields, bufferView
bounds, 4-byte alignment, accessor bounds, POSITION min/max correctness,
index ranges, animation samplers (input/output counts, monotonic times),
node references. Prints a summary (triangles, nodes, materials, bbox).

Usage: python3 tools/check_glb.py assets/mohan-prueba.glb
"""

import json
import math
import struct
import sys

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
        5125: ("I", 4), 5126: ("f", 4)}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def read_accessor(gltf, binary, idx):
    acc = gltf["accessors"][idx]
    view = gltf["bufferViews"][acc["bufferView"]]
    fmt, size = COMP[acc["componentType"]]
    width = WIDTH[acc["type"]]
    stride = view.get("byteStride", size * width)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    out = []
    for i in range(acc["count"]):
        off = start + i * stride
        out.append(struct.unpack_from("<%d%s" % (width, fmt), binary, off))
    return out


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)]
            for i in range(4)]


def node_matrix(node):
    t = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    m = [[r[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)]
    return m + [[0, 0, 0, 1]]


def main(path):
    data = open(path, "rb").read()
    if len(data) < 20:
        err("file too small")
        return report(None, path, data)
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        err("bad magic")
    if version != 2:
        err("version %d != 2" % version)
    if length != len(data):
        err("header length %d != file size %d" % (length, len(data)))
    off = 12
    chunks = []
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        if clen % 4:
            err("chunk length %d not 4-byte aligned" % clen)
        chunks.append((ctype, data[off + 8: off + 8 + clen]))
        off += 8 + clen
    if not chunks or chunks[0][0] != 0x4E4F534A:
        err("first chunk is not JSON")
        return report(None, path, data)
    try:
        gltf = json.loads(chunks[0][1].decode("utf-8"))
    except ValueError as e:
        err("JSON parse error: %s" % e)
        return report(None, path, data)
    binary = chunks[1][1] if len(chunks) > 1 and chunks[1][0] == 0x004E4942 else b""
    if gltf.get("asset", {}).get("version") != "2.0":
        err("asset.version must be '2.0'")

    buffers = gltf.get("buffers", [])
    if buffers and buffers[0].get("byteLength", 0) > len(binary):
        err("buffer 0 byteLength exceeds BIN chunk")

    for i, v in enumerate(gltf.get("bufferViews", [])):
        end = v.get("byteOffset", 0) + v["byteLength"]
        if end > buffers[v["buffer"]]["byteLength"]:
            err("bufferView %d out of buffer bounds" % i)
        if v.get("byteOffset", 0) % 4:
            err("bufferView %d byteOffset %d not 4-byte aligned" % (i, v["byteOffset"]))

    for i, a in enumerate(gltf.get("accessors", [])):
        fmt, size = COMP[a["componentType"]]
        view = gltf["bufferViews"][a["bufferView"]]
        elem = size * WIDTH[a["type"]]
        stride = view.get("byteStride", elem)
        need = a.get("byteOffset", 0) + stride * (a["count"] - 1) + elem
        if need > view["byteLength"]:
            err("accessor %d exceeds its bufferView" % i)
        if (view.get("byteOffset", 0) + a.get("byteOffset", 0)) % size:
            err("accessor %d misaligned for its component type" % i)
        vals = read_accessor(gltf, binary, i)
        if any(isinstance(x, float) and not math.isfinite(x) for v in vals for x in v):
            err("accessor %d has NaN/Inf" % i)

    tri_count = 0
    for mi, mesh in enumerate(gltf.get("meshes", [])):
        for pi, prim in enumerate(mesh["primitives"]):
            pos_idx = prim["attributes"].get("POSITION")
            if pos_idx is None:
                err("mesh %d prim %d has no POSITION" % (mi, pi))
                continue
            acc = gltf["accessors"][pos_idx]
            if "min" not in acc or "max" not in acc:
                err("POSITION accessor %d missing min/max" % pos_idx)
            else:
                pts = read_accessor(gltf, binary, pos_idx)
                real_min = [min(p[k] for p in pts) for k in range(3)]
                real_max = [max(p[k] for p in pts) for k in range(3)]
                if any(abs(real_min[k] - acc["min"][k]) > 1e-6 or
                       abs(real_max[k] - acc["max"][k]) > 1e-6 for k in range(3)):
                    err("POSITION accessor %d min/max do not match data" % pos_idx)
            nrm_idx = prim["attributes"].get("NORMAL")
            if nrm_idx is not None:
                for n in read_accessor(gltf, binary, nrm_idx):
                    if abs(math.sqrt(sum(c * c for c in n)) - 1.0) > 1e-3:
                        err("mesh %d prim %d has non-unit normal" % (mi, pi))
                        break
                if gltf["accessors"][nrm_idx]["count"] != acc["count"]:
                    err("mesh %d prim %d NORMAL count != POSITION count" % (mi, pi))
            vcount = acc["count"]
            if "indices" in prim:
                idx = [i[0] for i in read_accessor(gltf, binary, prim["indices"])]
                if idx and (max(idx) >= vcount or min(idx) < 0):
                    err("mesh %d prim %d index out of range" % (mi, pi))
                if len(idx) % 3:
                    err("mesh %d prim %d index count not multiple of 3" % (mi, pi))
                tri_count += len(idx) // 3
            else:
                tri_count += vcount // 3
            mat = prim.get("material")
            if mat is not None and mat >= len(gltf.get("materials", [])):
                err("mesh %d prim %d bad material index" % (mi, pi))

    nodes = gltf.get("nodes", [])
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            if c >= len(nodes):
                err("node %d has bad child %d" % (i, c))
        if "mesh" in n and n["mesh"] >= len(gltf.get("meshes", [])):
            err("node %d bad mesh" % i)

    anims = gltf.get("animations", [])
    anim_info = []
    for ai, anim in enumerate(anims):
        dur = 0.0
        for si, s in enumerate(anim["samplers"]):
            inp = gltf["accessors"][s["input"]]
            out = gltf["accessors"][s["output"]]
            if "min" not in inp or "max" not in inp:
                err("anim %d sampler %d input missing min/max" % (ai, si))
            times = [t[0] for t in read_accessor(gltf, binary, s["input"])]
            if any(b <= a for a, b in zip(times, times[1:])):
                err("anim %d sampler %d times not strictly increasing" % (ai, si))
            interp = s.get("interpolation", "LINEAR")
            mult = 3 if interp == "CUBICSPLINE" else 1
            if out["count"] != inp["count"] * mult:
                err("anim %d sampler %d output count %d != input count %d" %
                    (ai, si, out["count"], inp["count"]))
            vals = read_accessor(gltf, binary, s["output"])
            if out["type"] == "VEC4":
                for q in vals:
                    if abs(math.sqrt(sum(c * c for c in q)) - 1.0) > 1e-3:
                        err("anim %d sampler %d non-unit quaternion" % (ai, si))
                        break
            if vals and any(abs(a - b) > 1e-6 for a, b in zip(vals[0], vals[-1])):
                warnings.append("anim %d sampler %d first/last key differ (loop seam)"
                                % (ai, si))
            dur = max(dur, times[-1] if times else 0.0)
        for ch in anim["channels"]:
            if ch["sampler"] >= len(anim["samplers"]):
                err("anim %d bad sampler ref" % ai)
            if ch["target"].get("node", 0) >= len(nodes):
                err("anim %d bad node ref" % ai)
        anim_info.append((anim.get("name", "?"), dur, len(anim["channels"])))

    # World-space bbox from the default (rest) pose.
    bmin, bmax = [1e9] * 3, [-1e9] * 3

    def walk(ni, parent):
        m = mat_mul(parent, node_matrix(nodes[ni]))
        if "mesh" in nodes[ni]:
            for prim in gltf["meshes"][nodes[ni]["mesh"]]["primitives"]:
                for p in read_accessor(gltf, binary, prim["attributes"]["POSITION"]):
                    w = [sum(m[r][k] * p[k] for k in range(3)) + m[r][3] for r in range(3)]
                    for k in range(3):
                        bmin[k] = min(bmin[k], w[k])
                        bmax[k] = max(bmax[k], w[k])
        for c in nodes[ni].get("children", []):
            walk(c, m)

    ident = [[1 if i == j else 0 for j in range(4)] for i in range(4)]
    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(root, ident)

    summary = {
        "triangles": tri_count,
        "nodes": [n.get("name", "?") for n in nodes],
        "materials": [m.get("name", "?") for m in gltf.get("materials", [])],
        "bbox_min": [round(v, 4) for v in bmin],
        "bbox_max": [round(v, 4) for v in bmax],
        "size": [round(bmax[k] - bmin[k], 4) for k in range(3)],
        "animations": anim_info,
    }
    return report(summary, path, data)


def report(summary, path, data):
    print("file: %s (%d bytes, %.1f KB)" % (path, len(data), len(data) / 1024))
    if summary:
        print("triangles: %d" % summary["triangles"])
        print("nodes (%d): %s" % (len(summary["nodes"]), ", ".join(summary["nodes"])))
        print("materials (%d): %s" % (len(summary["materials"]),
                                      ", ".join(summary["materials"])))
        print("bbox min: %s  max: %s" % (summary["bbox_min"], summary["bbox_max"]))
        print("size (x, y, z) m: %s" % summary["size"])
        for name, dur, ch in summary["animations"]:
            print("animation: %s  %.2f s  %d channels" % (name, dur, ch))
    for w in warnings:
        print("WARNING:", w)
    for e in errors:
        print("ERROR:", e)
    print("RESULT:", "FAIL" if errors else "OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "assets/mohan-prueba.glb"))
