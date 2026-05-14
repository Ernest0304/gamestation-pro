#!/usr/bin/env python3
"""
Crop individual product photos from the printed menu PDF pages.

Each page in img/menu-pages/ is 1190 × 1684 px. This script defines bboxes
(x1, y1, x2, y2) for each menu item's photo region and saves crops to
img/menu/{menu_no}.jpg.

Coordinates are hand-tuned per page based on visual inspection of the PDF.
The crops won't be perfect (printed menu photos have heavy styling) but they
beat emoji-only display. Staff can replace via menu admin photo upload later.
"""
from PIL import Image
from pathlib import Path

SRC_DIR = Path(__file__).parent.parent / 'img' / 'menu-pages'
OUT_DIR = Path(__file__).parent.parent / 'img' / 'menu'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Format: { menu_no: (page_num, (x1, y1, x2, y2)) }
# Pages are 1190 × 1684 (2x zoom of original PDF)
CROPS = {
    # ===== Page 1: Dessert items 1-11 (2-column layout) =====
    # Left column (items 1-6): photos at x ~ 90-260
    1:  (1, (75,  180, 290, 405)),
    2:  (1, (75,  365, 290, 555)),
    3:  (1, (75,  555, 290, 745)),
    4:  (1, (75,  745, 290, 925)),
    5:  (1, (75,  920, 290, 1130)),
    6:  (1, (215, 1370, 415, 1580)),  # #6 is centered at bottom
    # Right column (items 7-11): photos at x ~ 580-790
    7:  (1, (445, 180, 660, 405)),
    8:  (1, (425, 380, 645, 580)),
    9:  (1, (450, 580, 660, 770)),
    10: (1, (480, 770, 660, 940)),
    11: (1, (460, 945, 660, 1130)),

    # ===== Page 2: Soybean pudding items 58-62 =====
    # Single arrangement of bowls at top, with text labels below
    58: (2, (35,   130, 305, 380)),    # top-left bowl
    59: (2, (315,  85,  570, 295)),    # top-center bowl
    60: (2, (470,  150, 730, 380)),    # right bowl
    61: (2, (300,  240, 605, 510)),    # middle bowl with red 61
    62: (2, (650,  330, 950, 600)),    # bottom right bowl

    # ===== Page 3: Muak-Muak Ice items 12-17 =====
    # Roughly 2 columns, alternating
    12: (3, (95,   130, 380, 380)),    # left top
    13: (3, (90,   320, 380, 580)),    # left middle-top
    14: (3, (480,  220, 800, 480)),    # right top
    15: (3, (85,   525, 390, 770)),    # left middle
    16: (3, (470,  450, 800, 720)),    # right middle
    17: (3, (110,  750, 390, 990)),    # left bottom
    # actually item 17 photo isn't visible on this page — uses small image
    # (placeholder okay, can replace via upload later)

    # ===== Page 4: Muak-Muak Ice continued items 18-22 =====
    18: (4, (60,   130, 380, 380)),    # mango top
    19: (4, (450,  240, 770, 450)),    # soursop
    20: (4, (60,   430, 380, 690)),    # papaya milk (strawberry photo)
    21: (4, (450,  550, 770, 820)),    # strawberry
    22: (4, (90,   870, 400, 1170)),   # ice cream lemon bottom

    # ===== Page 5: Combo sets 63, 64 (large tray photo at top) =====
    63: (5, (90,   100, 1140, 700)),   # iceberg trio (top wooden board)
    64: (5, (130,  340, 1140, 1280)),  # six treasures bento

    # ===== Page 6: Tea + snack tray 65, 66, 67 =====
    # Page has one big photo. Use partial crops:
    65: (6, (40,   50,  470, 600)),    # teapot for scented tea
    66: (6, (40,   50,  470, 600)),    # same teapot — same tea family
    67: (6, (140,  410, 1140, 1100)),  # crispy snack tray (bowl)

    # ===== Page 7: Pancake items 23-32 (2 cols, photos on left, varying heights) =====
    23: (7, (15,   140, 415, 360)),    # peanut & corn pancake
    24: (7, (15,   140, 415, 360)),    # chocolate (same as 23 visually)
    25: (7, (15,   140, 415, 360)),    # cheese (top photo serves all 3 simple ones)
    26: (7, (15,   140, 415, 360)),
    27: (7, (15,   140, 415, 360)),
    28: (7, (15,   320, 415, 580)),    # ice cream pancake (middle photo)
    29: (7, (15,   540, 415, 800)),    # banana peanut chocolate
    30: (7, (15,   790, 415, 1080)),   # chicken floss cheese
    31: (7, (15,   790, 415, 1080)),   # cheese egg (same family)
    32: (7, (15,  1050, 415, 1330)),   # ham cheese pancake

    # ===== Page 8: Pancake continued 33-36 =====
    33: (8, (270,  180, 770, 460)),    # ham cheese egg
    34: (8, (60,   400, 540, 660)),    # ham cheese salted egg
    35: (8, (380,  580, 870, 850)),    # ham cheese salted egg yolk
    36: (8, (240,  870, 870, 1230)),   # ram-on pancake

    # ===== Page 9: Drinks 41-50 (all in one composite photo) =====
    41: (9, (110,  170, 320, 880)),    # black sugar pearl (leftmost glass)
    42: (9, (220,  150, 430, 950)),    # 2nd glass
    43: (9, (300,  240, 530, 870)),    # 3rd
    44: (9, (430,  180, 660, 880)),    # 4th
    45: (9, (530,  120, 770, 880)),    # 5th
    46: (9, (640,  170, 870, 880)),    # mocha 6th
    47: (9, (470,  300, 700, 990)),    # matcha (green)
    48: (9, (770,  340, 970, 920)),    # chocolate
    49: (9, (860,  180, 1080, 880)),   # peach
    50: (9, (920,  340, 1140, 940)),   # passion fruit lemon (rightmost)

    # ===== Page 10: Cake/coffee 37-40 =====
    37: (10, (90,   150, 580, 510)),    # cheesecake (top photo)
    38: (10, (320,  430, 880, 870)),    # chocolate cake
    39: (10, (160,  870, 660, 1330)),   # cappuccino
    40: (10, (160,  870, 660, 1330)),   # latte (same coffee photo)

    # ===== Page 11: Fries 51, 52 =====
    51: (11, (90,   80,  830, 590)),    # french fries
    52: (11, (90,   600, 830, 1190)),   # cheesy fries

    # ===== Page 12: Prawn roll + mushrooms 53, 530, 54 =====
    53:  (12, (90,   270, 870, 670)),   # prawn roll (small)
    530: (12, (90,   270, 870, 670)),   # prawn roll (large) — same photo
    54:  (12, (40,   570, 820, 1130)),  # crispy mushrooms

    # ===== Page 13: Pork rice set 57 =====
    57: (13, (110, 130, 920, 1090)),    # full set with drink + bok choy + pork rice

    # ===== Page 14: Pork rice (small + large) 55, 56 =====
    55: (14, (160, 100, 740, 580)),     # small pork rice
    56: (14, (160, 600, 760, 1080)),    # large pork rice
}


def main():
    total = 0
    ok = 0
    bad = []
    for menu_no, (page_num, bbox) in CROPS.items():
        total += 1
        src = SRC_DIR / f'page_{page_num:02d}.jpg'
        if not src.exists():
            bad.append((menu_no, 'page image missing'))
            continue
        try:
            with Image.open(src) as im:
                # Clip bbox to image bounds
                w, h = im.size
                x1, y1, x2, y2 = bbox
                x1 = max(0, min(w, x1))
                y1 = max(0, min(h, y1))
                x2 = max(x1 + 1, min(w, x2))
                y2 = max(y1 + 1, min(h, y2))
                crop = im.crop((x1, y1, x2, y2))
                # Resize to max 400x400 to keep file sizes small
                crop.thumbnail((400, 400), Image.LANCZOS)
                out_path = OUT_DIR / f'{menu_no}.jpg'
                crop.save(out_path, 'JPEG', quality=82, optimize=True)
                ok += 1
        except Exception as e:
            bad.append((menu_no, str(e)))

    print(f'\n✓ Cropped {ok}/{total} photos to {OUT_DIR}')
    if bad:
        print(f'⚠ {len(bad)} failures:')
        for no, err in bad:
            print(f'  #{no}: {err}')


if __name__ == '__main__':
    main()
