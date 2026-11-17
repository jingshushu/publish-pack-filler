#!/usr/bin/env python3
"""Generate crisp, dependency-free PNG icons (16/32/48/128) for the Chrome Extension."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


def make_png(size: int) -> bytes:
    rows = []
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    radius = size * 0.22
    half = size * 0.46

    def rounded_box_alpha(x: float, y: float) -> float:
        dx = max(abs(x - cx) - (half - radius), 0.0)
        dy = max(abs(y - cy) - (half - radius), 0.0)
        dist = math.hypot(dx, dy) - radius
        return max(0.0, min(1.0, 0.7 - dist))

    for y in range(size):
        row = bytearray([0])  # filter type 0
        t = y / max(1, size - 1)
        # Coral-red to warm orange gradient (#ff2442 -> #ff6b3d)
        bg_r = int(255)
        bg_g = int(36 * (1 - t) + 98 * t)
        bg_b = int(66 * (1 - t) + 56 * t)

        for x in range(size):
            a = rounded_box_alpha(x, y)
            if a <= 0:
                row.extend((0, 0, 0, 0))
                continue

            nx = (x - cx) / (size * 0.5)
            ny = (y - cy) / (size * 0.5)

            # White document / layers glyph + lightning spark accent inside
            in_card = abs(nx) < 0.44 and abs(ny) < 0.50
            in_line1 = abs(nx + 0.06) < 0.24 and abs(ny + 0.22) < 0.065
            in_line2 = abs(nx) < 0.30 and abs(ny + 0.01) < 0.065
            in_line3 = abs(nx - 0.04) < 0.26 and abs(ny - 0.20) < 0.065

            if in_card and not (in_line1 or in_line2 or in_line3):
                r, g, b = 255, 255, 255
            else:
                r, g, b = bg_r, bg_g, bg_b

            row.extend((r, g, b, int(a * 255)))
        rows.append(bytes(row))

    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "extension" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)
    for sz in (16, 32, 48, 128):
        (out_dir / f"icon{sz}.png").write_bytes(make_png(sz))
    print("Generated icons:", [p.name for p in sorted(out_dir.iterdir())])


if __name__ == "__main__":
    main()
