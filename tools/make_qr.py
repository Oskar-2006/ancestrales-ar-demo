# Minimal QR Code encoder (byte mode, version 5, ECC level M), standard library + Pillow for PNG.
import sys
from PIL import Image

URL = sys.argv[1]
OUT = sys.argv[2]
VERSION, SIZE = 5, 37
DATA_CW, ECC_PER_BLOCK, BLOCKS = 86, 24, 2   # 5-M: 2 blocks x (43 data + 24 ecc)

# --- GF(256) arithmetic, primitive polynomial 0x11d ---
EXP, LOG = [0] * 512, [0] * 256
x = 1
for i in range(255):
    EXP[i] = x; LOG[x] = i
    x <<= 1
    if x & 0x100: x ^= 0x11d
for i in range(255, 512): EXP[i] = EXP[i - 255]
def gmul(a, b): return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]

def rs_generator(n):
    g = [1]
    for i in range(n):
        g = [a ^ b for a, b in zip(g + [0], [0] + [gmul(c, EXP[i]) for c in g])]
    return g
def rs_ecc(data, n):
    gen = rs_generator(n)
    msg = list(data) + [0] * n
    for i in range(len(data)):
        coef = msg[i]
        if coef:
            for j in range(1, len(gen)):
                msg[i + j] ^= gmul(gen[j], coef)
    return msg[len(data):]

# --- data codewords ---
payload = URL.encode('utf-8')
bits = '0100' + format(len(payload), '08b') + ''.join(format(b, '08b') for b in payload)
cap = DATA_CW * 8
assert len(bits) <= cap, 'URL too long for version 5-M'
bits += '0' * min(4, cap - len(bits))
bits += '0' * (-len(bits) % 8)
cws = [int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)]
pad = [0xEC, 0x11]
while len(cws) < DATA_CW: cws.append(pad[(len(cws) - len(bits) // 8) % 2])

blocks = [cws[i * 43:(i + 1) * 43] for i in range(BLOCKS)]
eccs = [rs_ecc(b, ECC_PER_BLOCK) for b in blocks]
final = [b[i] for i in range(43) for b in blocks] + [e[i] for i in range(ECC_PER_BLOCK) for e in eccs]
stream = ''.join(format(c, '08b') for c in final) + '0' * 7   # 7 remainder bits for v5

# --- function patterns ---
M = [[None] * SIZE for _ in range(SIZE)]   # None = free, else 0/1
def setf(r, c, v): M[r][c] = v
def finder(r0, c0):
    for r in range(-1, 8):
        for c in range(-1, 8):
            rr, cc = r0 + r, c0 + c
            if 0 <= rr < SIZE and 0 <= cc < SIZE:
                dark = (0 <= r <= 6 and 0 <= c <= 6 and (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4)))
                setf(rr, cc, 1 if dark else 0)
finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0)
for i in range(8, SIZE - 8):
    setf(6, i, 1 if i % 2 == 0 else 0); setf(i, 6, 1 if i % 2 == 0 else 0)
for r in range(-2, 3):          # alignment pattern centred at (30, 30)
    for c in range(-2, 3):
        setf(30 + r, 30 + c, 1 if max(abs(r), abs(c)) != 1 else 0)
setf(4 * VERSION + 9, 8, 1)     # dark module
# reserve format areas
FMT_A = [(8, i) for i in (0, 1, 2, 3, 4, 5, 7, 8)] + [(i, 8) for i in (7, 5, 4, 3, 2, 1, 0)]
FMT_B = [(SIZE - 1 - i, 8) for i in range(7)] + [(8, SIZE - 8 + i) for i in range(8)]
for r, c in FMT_A + FMT_B:
    if M[r][c] is None: M[r][c] = 0
reserved = [[M[r][c] is not None for c in range(SIZE)] for r in range(SIZE)]

# --- place data in zigzag ---
idx = 0
col = SIZE - 1
upward = True
while col > 0:
    if col == 6: col -= 1
    rows = range(SIZE - 1, -1, -1) if upward else range(SIZE)
    for r in rows:
        for c in (col, col - 1):
            if not reserved[r][c]:
                M[r][c] = int(stream[idx]) if idx < len(stream) else 0
                idx += 1
    upward = not upward
    col -= 2
assert idx == len(stream), (idx, len(stream))

MASKS = [lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0,
         lambda r, c: (r + c) % 3 == 0, lambda r, c: (r // 2 + c // 3) % 2 == 0,
         lambda r, c: (r * c) % 2 + (r * c) % 3 == 0, lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
         lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0]

def format_bits(mask):
    data = (0b00 << 3) | mask          # ECC level M = 00
    v = data << 10
    g = 0b10100110111
    for i in range(14, 9, -1):
        if v & (1 << i): v ^= g << (i - 10)
    return ((data << 10) | v) ^ 0b101010000010010

def build(mask):
    G = [row[:] for row in M]
    for r in range(SIZE):
        for c in range(SIZE):
            if not reserved[r][c] and MASKS[mask](r, c): G[r][c] ^= 1
    f = format_bits(mask)
    fb = [(f >> i) & 1 for i in range(15)]      # bit 0 = LSB
    # copy A: bits 0..7 along column 8 bottom->top? use standard layout
    posA = [(8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5), (8, 7), (8, 8), (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8)]
    posB = [(SIZE - 1, 8), (SIZE - 2, 8), (SIZE - 3, 8), (SIZE - 4, 8), (SIZE - 5, 8), (SIZE - 6, 8), (SIZE - 7, 8),
            (8, SIZE - 8), (8, SIZE - 7), (8, SIZE - 6), (8, SIZE - 5), (8, SIZE - 4), (8, SIZE - 3), (8, SIZE - 2), (8, SIZE - 1)]
    for i in range(15):
        bit = fb[14 - i]                          # most significant bit first
        G[posA[i][0]][posA[i][1]] = bit
        G[posB[i][0]][posB[i][1]] = bit
    G[4 * VERSION + 9][8] = 1
    return G

def penalty(G):
    p = 0
    for lines in (G, list(zip(*G))):
        for line in lines:
            run = 1
            for i in range(1, SIZE):
                if line[i] == line[i - 1]:
                    run += 1
                else:
                    if run >= 5: p += run - 2
                    run = 1
            if run >= 5: p += run - 2
            s = ''.join(map(str, line))
            p += 40 * (s.count('10111010000') + s.count('00001011101'))
    for r in range(SIZE - 1):
        for c in range(SIZE - 1):
            if G[r][c] == G[r][c + 1] == G[r + 1][c] == G[r + 1][c + 1]: p += 3
    dark = sum(map(sum, G)) * 100 // (SIZE * SIZE)
    p += 10 * (abs(dark - 50) // 5)
    return p

best = min(range(8), key=lambda m: penalty(build(m)))
G = build(best)

SCALE, QUIET = 20, 4
img = Image.new('1', ((SIZE + 2 * QUIET) * SCALE,) * 2, 1)
px = img.load()
for r in range(SIZE):
    for c in range(SIZE):
        if G[r][c]:
            for y in range(SCALE):
                for x2 in range(SCALE):
                    px[(c + QUIET) * SCALE + x2, (r + QUIET) * SCALE + y] = 0
img.save(OUT)
print('mask', best, 'size', img.size)

# self-check: unmask, read back codewords and verify RS syndromes and payload
read, col, upward = [], SIZE - 1, True
while col > 0:
    if col == 6: col -= 1
    rows = range(SIZE - 1, -1, -1) if upward else range(SIZE)
    for r in rows:
        for c in (col, col - 1):
            if not reserved[r][c]:
                read.append(G[r][c] ^ (1 if MASKS[best](r, c) else 0))
    upward = not upward; col -= 2
cw = [int(''.join(map(str, read[i:i + 8])), 2) for i in range(0, 134 * 8, 8)]
d = [[cw[i * 2 + b] for i in range(43)] for b in range(2)]
e = [[cw[86 + i * 2 + b] for i in range(24)] for b in range(2)]
for b in range(2):
    full = d[b] + e[b]
    for k in range(24):
        s = 0
        for v in full: s = gmul(s, EXP[k]) ^ v
        assert s == 0, 'syndrome fail'
data = d[0] + d[1]
bs = ''.join(format(v, '08b') for v in data)
n = int(bs[4:12], 2)
txt = bytes(int(bs[12 + 8 * i:20 + 8 * i], 2) for i in range(n)).decode()
assert bs[:4] == '0100' and txt == URL, txt
print('self-check OK:', txt)
