#!/usr/bin/env python3
"""Generate SpaceX IPO tracker PWA icons as PNG data URIs (pure stdlib).

Draws a maskable, full-bleed dark icon with a stylized white "X" and a blue
accent bar. Outputs base64 data URIs for 192 and 512 sizes to icons.txt so they
can be embedded directly in manifest.webmanifest (keeping the app to 3 files).
"""
import zlib
import struct
import base64
import math

BG = (10, 12, 20)        # near-black
WHITE = (245, 247, 255)
BLUE = (0, 122, 255)      # accent


def _png_chunk(tag, data):
    chunk = tag + data
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)


def make_png(size):
    px = bytearray()
    cx = cy = size / 2.0
    # X geometry
    half = size * 0.30          # arm half-length
    thick = size * 0.085        # stroke half-width
    # blue accent bar near bottom
    bar_y0 = int(size * 0.80)
    bar_y1 = int(size * 0.855)
    bar_x0 = int(size * 0.30)
    bar_x1 = int(size * 0.70)

    for y in range(size):
        px.append(0)  # filter byte: none
        for x in range(size):
            dx = x - cx
            dy = y - cy
            r, g, b = BG
            # Two diagonals of the X: distance from lines y=x and y=-x (rotated coords)
            u = (dx + dy) / math.sqrt(2)   # along one diagonal
            v = (dx - dy) / math.sqrt(2)   # along the other
            on_x = (abs(v) <= thick and abs(u) <= half) or (abs(u) <= thick and abs(v) <= half)
            if on_x:
                r, g, b = WHITE
            # blue accent bar
            if bar_y0 <= y <= bar_y1 and bar_x0 <= x <= bar_x1:
                r, g, b = BLUE
            px.extend((r, g, b))

    raw = bytes(px)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n"
    png += _png_chunk(b"IHDR", ihdr)
    png += _png_chunk(b"IDAT", zlib.compress(raw, 9))
    png += _png_chunk(b"IEND", b"")
    return png


def data_uri(size):
    return "data:image/png;base64," + base64.b64encode(make_png(size)).decode("ascii")


if __name__ == "__main__":
    out = {s: data_uri(s) for s in (192, 512)}
    with open("icons.txt", "w") as f:
        for s, uri in out.items():
            f.write(f"{s}\n{uri}\n")
    for s, uri in out.items():
        print(f"icon {s}: {len(uri)} bytes")
