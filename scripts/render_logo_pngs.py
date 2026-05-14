#!/usr/bin/env python3
"""
Render PNG variants of the logo for browsers/iOS that don't support SVG well:
- favicon-32.png (32x32)
- favicon-180.png (180x180)  — iOS apple-touch-icon
- favicon-512.png (512x512)  — PWA / maskable

Uses PIL (no cairo needed). Draws shapes + 香 character with system Chinese font.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).parent.parent / 'img'

# macOS Chinese fonts — try in order, use first available
FONT_CANDIDATES = [
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/Library/Fonts/Arial Unicode.ttf',
]


def find_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    print('⚠️  No Chinese font found, using default (will show squares)')
    return ImageFont.load_default()


def render(size, padding=0):
    # Transparent background — favicon and iOS prefer transparent corners
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = cy = size / 2
    outer_r = size / 2 - padding
    red_r = outer_r * 0.94          # red disc
    inner_ring_r = outer_r * 0.87   # white thin ring
    white_center_r = outer_r * 0.54 # 香 circle

    # White outer ring
    draw.ellipse((cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
                 fill=(255, 255, 255, 255))
    # Red disc
    draw.ellipse((cx - red_r, cy - red_r, cx + red_r, cy + red_r),
                 fill=(122, 8, 24, 255))
    # White thin ring (drawn as outline)
    ring_w = max(1, size // 80)
    draw.ellipse((cx - inner_ring_r, cy - inner_ring_r, cx + inner_ring_r, cy + inner_ring_r),
                 outline=(255, 255, 255, 255), width=ring_w)
    # White center circle for 香
    draw.ellipse((cx - white_center_r, cy - white_center_r, cx + white_center_r, cy + white_center_r),
                 fill=(255, 255, 255, 255))

    # 香 character
    font_size = int(size * 0.45)
    font = find_font(font_size)
    text = '香'
    # Compute text bbox to center
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        offset_x = -bbox[0]
        offset_y = -bbox[1]
    except Exception:
        tw, th = font.getsize(text) if hasattr(font, 'getsize') else (font_size, font_size)
        offset_x = offset_y = 0
    text_x = cx - tw / 2 + offset_x
    text_y = cy - th / 2 + offset_y
    draw.text((text_x, text_y), text, font=font, fill=(122, 8, 24, 255))

    return img


def render_maskable(size):
    """Maskable icon: needs ~10% safe-zone padding so Android adaptive icons don't crop the disc."""
    img = Image.new('RGBA', (size, size), (122, 8, 24, 255))  # solid red bg
    # Re-draw simplified disc centered with padding
    inner = render(int(size * 0.8), padding=0)
    pos = (size // 10, size // 10)
    img.paste(inner, pos, inner)
    return img


def main():
    OUT.mkdir(exist_ok=True)
    # Standard variants
    for s in (32, 180, 512):
        out = OUT / f'favicon-{s}.png'
        render(s).save(out, 'PNG', optimize=True)
        print(f'✓ {out.name} ({s}×{s})')
    # Maskable for PWA
    out = OUT / 'favicon-maskable-512.png'
    render_maskable(512).save(out, 'PNG', optimize=True)
    print(f'✓ {out.name} (512×512 maskable)')


if __name__ == '__main__':
    main()
