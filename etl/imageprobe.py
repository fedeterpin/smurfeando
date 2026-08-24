"""Measure logo artwork so the site knows whether it can paint it.

The site renders every league mark as a silhouette in its own ink: the wiki's
wordmarks are black artwork drawn for a white page (8 of the 12 leagues in the
slice measure 0.00 saturation and ~1.1:1 against the navy panel) and the wiki has
no dark-mode variant, so painting the shape is the only way they read without a
plate behind them.

That only works when the artwork really is a cut-out. `LPL 2017 logo.png` is an
opaque disc -- as a silhouette it paints a solid slab. The giveaway is not how
much of the canvas is transparent (padding varies wildly) but how densely the
opaque pixels fill THEIR OWN bounding box: a wordmark or an emblem is mostly
holes, a plate is not. Measured over the 12 leagues in the slice plus every LPL
alternative on the wiki, real marks land at 20-49% and solid blocks at 65-94%.

Standard library only. The wiki CDN serves WebP by default but honours
`?format=png`, and a 128px-wide thumbnail of a logo is a couple of KB.
"""

from __future__ import annotations

import zlib

# Opaque pixels filling more than this much of their bounding box = a block.
# The gap between the two populations is wide (49% vs 65%), so the exact value
# is not delicate -- it just has to sit inside it.
CUTOUT_MAX_FILL = 0.55

_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
_HAS_ALPHA = {4, 6}


def _chunks(data: bytes):
    offset = 8                                   # skip the PNG signature
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset:offset + 4], "big")
        kind = data[offset + 4:offset + 8]
        yield kind, data[offset + 8:offset + 8 + length]
        offset += 12 + length                    # length + type + payload + CRC


def alpha_map(data: bytes) -> tuple[int, int, list[int]]:
    """(width, height, alpha per pixel) for an 8-bit, non-interlaced PNG."""
    header, idat, trns = None, bytearray(), None
    for kind, payload in _chunks(data):
        if kind == b"IHDR":
            header = payload
        elif kind == b"IDAT":
            idat += payload
        elif kind == b"tRNS":
            trns = payload
        elif kind == b"IEND":
            break
    if header is None:
        raise ValueError("no IHDR")
    width = int.from_bytes(header[0:4], "big")
    height = int.from_bytes(header[4:8], "big")
    depth, colour, interlace = header[8], header[9], header[12]
    if depth != 8:
        raise ValueError(f"unsupported bit depth {depth}")
    if interlace:
        raise ValueError("interlaced")
    channels = _CHANNELS[colour]

    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(height * stride)
    for y in range(height):                      # undo the per-scanline filter
        filt = raw[y * (stride + 1)]
        line = raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)]
        row, prev = y * stride, (y - 1) * stride
        for x in range(stride):
            left = out[row + x - channels] if x >= channels else 0
            up = out[prev + x] if y else 0
            upleft = out[prev + x - channels] if x >= channels and y else 0
            value = line[x]
            if filt == 1:
                value += left
            elif filt == 2:
                value += up
            elif filt == 3:
                value += (left + up) >> 1
            elif filt == 4:
                pa, pb, pc = abs(up - upleft), abs(left - upleft), abs(left + up - 2 * upleft)
                value += left if pa <= pb and pa <= pc else up if pb <= pc else upleft
            out[row + x] = value & 0xFF

    if colour in _HAS_ALPHA:
        last = channels - 1
        alpha = [out[i * channels + last] for i in range(width * height)]
    elif colour == 3 and trns:                   # palette entries with transparency
        alpha = [trns[out[i]] if out[i] < len(trns) else 255 for i in range(width * height)]
    else:
        alpha = [255] * (width * height)         # no alpha channel: fully opaque
    return width, height, alpha


def bbox_fill(data: bytes) -> float:
    """How densely the opaque pixels fill their own bounding box (0-1).

    1.0 for artwork with no transparency at all, which is the honest answer: a
    logo baked onto a background is a block whichever way you look at it.
    """
    width, height, alpha = alpha_map(data)
    left, right, top, bottom, count = width, -1, height, -1, 0
    for index, value in enumerate(alpha):
        if value <= 200:                          # ignore soft edges, not just clear pixels
            continue
        count += 1
        x, y = index % width, index // width
        left, right = min(left, x), max(right, x)
        top, bottom = min(top, y), max(bottom, y)
    if count == 0:
        return 1.0                                # nothing to paint; treat as unusable
    return count / ((right - left + 1) * (bottom - top + 1))


def is_cutout(data: bytes, max_fill: float = CUTOUT_MAX_FILL) -> bool:
    """True when the artwork can be painted as a silhouette without becoming a slab."""
    return bbox_fill(data) < max_fill
