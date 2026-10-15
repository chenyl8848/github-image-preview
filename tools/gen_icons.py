"""生成 GitHub Image Preview 的 logo 图标（16/48/128）。仅依赖 Python 标准库。

Logo 设计：GitHub 亮蓝圆角徽章 + 白色 GitHub 猫头（Octocat 宽扁脸 + 双耳），
右下角叠加带「+」的放大镜，表达「GitHub 图片 → 点击放大预览」。
小尺寸（16px）自动使用简化版（去掉加号等细节）。

用法：python tools/gen_icons.py
产物：icons/icon16.png、icons/icon48.png、icons/icon128.png
"""
import math
import os
import struct
import zlib


def write_png(path, size, pixels):
    raw = b""
    for row in pixels:
        raw += b"\x00"  # filter type 0
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(typ, data):
        out = struct.pack(">I", len(data)) + typ + data
        out += struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        return out

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def sd_round_rect(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax = max(qx, 0.0)
    ay = max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def sd_circle(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r


def sd_segment(px, py, ax, ay, bx, by):
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    t = (apx * abx + apy * aby) / (abx * abx + aby * aby)
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return math.hypot(px - (ax + abx * t), py - (ay + aby * t))


def point_in_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def clamp(v):
    return 1.0 if v > 1.0 else (0.0 if v < 0.0 else v)


def quantize(v):
    return int(v + 0.5)


def white_alpha(px, py, s, detail):
    """前景白色图形的 alpha（0~1），带抗锯齿。"""
    a = 0.0
    # GitHub 猫头：脸用宽扁圆角矩形（squircle），底部更平、更接近官方 Octocat
    a = max(a, clamp(0.5 - sd_round_rect(px, py, 0.42 * s, 0.50 * s, 0.18 * s, 0.14 * s, 0.12 * s)))
    # 两只较明显的三角耳
    if point_in_triangle(px, py, (0.25 * s, 0.37 * s), (0.335 * s, 0.12 * s), (0.415 * s, 0.37 * s)):
        a = 1.0
    if point_in_triangle(px, py, (0.425 * s, 0.37 * s), (0.505 * s, 0.12 * s), (0.585 * s, 0.37 * s)):
        a = 1.0
    # 放大镜镜片（描边圆）
    d = abs(sd_circle(px, py, 0.71 * s, 0.73 * s, 0.13 * s)) - 0.5 * 0.045 * s
    a = max(a, clamp(0.5 - d))
    # 放大镜手柄
    d = sd_segment(px, py, 0.80 * s, 0.82 * s, 0.87 * s, 0.89 * s) - 0.5 * 0.045 * s
    a = max(a, clamp(0.5 - d))
    if detail:
        # 加号
        d = sd_segment(px, py, 0.655 * s, 0.73 * s, 0.765 * s, 0.73 * s) - 0.5 * 0.040 * s
        a = max(a, clamp(0.5 - d))
        d = sd_segment(px, py, 0.71 * s, 0.675 * s, 0.71 * s, 0.785 * s) - 0.5 * 0.040 * s
        a = max(a, clamp(0.5 - d))
    return clamp(a)


def make_icon(size, path, detail):
    C1 = (88, 166, 255)  # 左上亮蓝 #58A6FF
    C2 = (9, 105, 218)   # 右下 GitHub 蓝 #0969DA
    WHITE = (255, 255, 255)
    SS = 4  # 4x 超采样抗锯齿
    margin = size * 0.05
    radius = size * 0.22
    cx = cy = size / 2
    half = size / 2 - margin

    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            ar = ag = ab = aa = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x + (sx + 0.5) / SS
                    py = y + (sy + 0.5) / SS
                    d_bg = sd_round_rect(px, py, cx, cy, half, half, radius)
                    a_bg = clamp(0.5 - d_bg)

                    t = clamp((px + py) / (2 * size))
                    r = C1[0] + (C2[0] - C1[0]) * t
                    g = C1[1] + (C2[1] - C1[1]) * t
                    b = C1[2] + (C2[2] - C1[2]) * t
                    # 左上角轻微高光
                    hl = 0.16 * (1 - t)
                    r += (WHITE[0] - r) * hl
                    g += (WHITE[1] - g) * hl
                    b += (WHITE[2] - b) * hl

                    w = white_alpha(px, py, size, detail)
                    r = r * (1 - w) + WHITE[0] * w
                    g = g * (1 - w) + WHITE[1] * w
                    b = b * (1 - w) + WHITE[2] * w

                    ar += r
                    ag += g
                    ab += b
                    aa += a_bg
            n = SS * SS
            row.append((quantize(ar / n), quantize(ag / n), quantize(ab / n), quantize(aa / n * 255)))
        pixels.append(row)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_png(path, size, pixels)
    print(f"generated {path}")


def ascii_preview(cols=26):
    """在终端打印一个 ASCII 预览，便于核对 logo 形状。"""
    size = 48
    margin = size * 0.05
    half = size / 2 - margin
    lines = []
    for j in range(cols):
        line = ""
        for i in range(cols):
            px = (i + 0.5) * size / cols
            py = (j + 0.5) * size / cols
            a_bg = clamp(0.5 - sd_round_rect(px, py, size / 2, size / 2, half, half, 0.22 * size))
            w = white_alpha(px, py, size, True)
            if a_bg < 0.25:
                line += " "
            elif w > 0.5:
                line += "#"
            else:
                line += "."
        lines.append(line)
    print("\n".join(lines))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(root, "icons")
    for size in (16, 48, 128):
        make_icon(size, os.path.join(icons_dir, f"icon{size}.png"), detail=(size >= 48))
    print("\n[preview]")
    ascii_preview()


if __name__ == "__main__":
    main()
