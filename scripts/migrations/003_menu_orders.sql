-- Migration 003: F&B POS — menu items, categories, orders, order items
-- Idempotent.

-- ===== Menu categories =====
CREATE TABLE IF NOT EXISTS menu_categories (
  id SERIAL PRIMARY KEY,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  emoji TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Menu items =====
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_no INTEGER UNIQUE NOT NULL,         -- staff memorize by number
  category_id INTEGER REFERENCES menu_categories(id) ON DELETE SET NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  price NUMERIC NOT NULL,
  emoji TEXT,
  photo_url TEXT,                          -- will be filled when photos uploaded
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(active) WHERE active = TRUE;

-- ===== Orders =====
CREATE SEQUENCE IF NOT EXISTS order_no_seq START 1;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT UNIQUE NOT NULL DEFAULT to_char(nextval('order_no_seq'), 'FM0000'),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  guest_name TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'paynow', 'member_balance', 'card', 'mixed', 'pending')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'voided')),
  note TEXT,
  cashier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

-- ===== Order items =====
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_no INTEGER,                         -- snapshot
  name_zh TEXT NOT NULL,                   -- snapshot
  name_en TEXT,
  emoji TEXT,
  unit_price NUMERIC NOT NULL,             -- snapshot
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ===== RLS =====
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_full_menu_categories" ON menu_categories;
DROP POLICY IF EXISTS "auth_full_menu_items" ON menu_items;
DROP POLICY IF EXISTS "auth_full_orders" ON orders;
DROP POLICY IF EXISTS "auth_full_order_items" ON order_items;

CREATE POLICY "auth_full_menu_categories" ON menu_categories FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_full_menu_items" ON menu_items FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_full_orders" ON orders FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_full_order_items" ON order_items FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ===== Realtime =====
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Seed categories =====
INSERT INTO menu_categories (id, name_zh, name_en, emoji, display_order) VALUES
  (1, '甜品系列', 'Dessert', '🍮', 10),
  (2, '绵绵冰', 'Muak-Muak Ice', '🍧', 20),
  (3, '叮咚饼', 'Pancake', '🥞', 30),
  (4, '奶茶冰沙', 'Milk Tea & Ice', '🧋', 40),
  (5, '蛋糕咖啡', 'Cake & Coffee', '🍰', 50),
  (6, '特色小吃', 'Special Snacks', '🍟', 60),
  (7, '套餐', 'Combo Set', '🎁', 70),
  (8, '花茶', 'Tea & Tray', '🌸', 80)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  emoji = EXCLUDED.emoji,
  display_order = EXCLUDED.display_order;

-- Fix sequence after manual id insert
SELECT setval('menu_categories_id_seq', GREATEST(8, (SELECT MAX(id) FROM menu_categories)));

-- ===== Seed menu items =====
-- Numbering matches the printed menu so staff can find items by number.

INSERT INTO menu_items (menu_no, category_id, name_zh, name_en, price, emoji, is_featured, display_order) VALUES
  -- Category 1: 甜品系列 Dessert
  (1,  1, '杏仁糊',                    'Almond Paste',                              4.50, '🥣', FALSE, 1),
  (2,  1, '天麻糊糖水',                 'Peach Protein Beauty Gel',                 8.80, '🍯', TRUE,  2),
  (3,  1, '黑芝麻糊',                   'Black Sesame Paste',                       4.50, '🥣', FALSE, 3),
  (4,  1, '混合糊',                    'Mix Paste',                                4.50, '🥣', FALSE, 4),
  (5,  1, '麻汤圆',                    'Glutinous Rice Ball (Peanut/Sesame)',      4.80, '🍡', FALSE, 5),
  (6,  1, '芋头黑芝麻汤圆糖水',          'Tara & Black Sesame Balls Ginger Soup',    4.50, '🍡', FALSE, 6),
  (7,  1, '阿斯特制冻',                'Specialty Chilled Herbal Jelly',           4.50, '🍮', FALSE, 7),
  (8,  1, '特制芒果布丁',               'Specialty Mango Pudding',                  4.50, '🥭', FALSE, 8),
  (9,  1, '椰糖白果豆腐花',             'Coconut Sugar Soybean Pudding',            4.20, '🍶', FALSE, 9),
  (58, 1, '金枣白果豆腐花',             'Golden Ball Soybean Pudding',              6.20, '🍶', FALSE, 10),
  (59, 1, '糯米豆腐花',                'Glutinous Rice Ball Soybean Pudding',      5.80, '🍶', FALSE, 11),
  (60, 1, '红豆芋泥豆腐花',             'Red Bean Yam Soybean Pudding',             5.80, '🍶', FALSE, 12),
  (61, 1, '草莓红豆豆腐花',             'Grass Jelly Red Bean Soybean Pudding',     5.80, '🍶', FALSE, 13),
  (62, 1, '水果鲜奶仙草',               'Fruits Fresh Milk Grass Jelly',            6.80, '🍇', FALSE, 14),

  -- Category 2: 绵绵冰 Muak-Muak Ice
  (12, 2, '杏仁绵绵冰',                'Almond Muak-Muak Ice',                     9.20, '🍧', FALSE, 1),
  (13, 2, '黑芝麻绵绵冰',               'Black Sesame Muak-Muak Ice',               9.20, '🍧', FALSE, 2),
  (14, 2, '杏仁黑芝麻绵绵冰',           'Almond & Black Sesame Muak-Muak Ice',      9.80, '🍧', FALSE, 3),
  (15, 2, '绿茶绵绵冰',                'Green Tea Muak-Muak Ice',                  9.20, '🍵', FALSE, 4),
  (16, 2, '芋泥绵绵冰',                'Yam Muak-Muak Ice',                       10.50, '🍠', TRUE,  5),
  (17, 2, '糖椰子绵绵冰',               'Candy Coconut Muak-Muak Ice',              9.20, '🥥', FALSE, 6),
  (18, 2, '芒果绵绵冰',                'Mango Muak-Muak Ice',                     10.50, '🥭', TRUE,  7),
  (19, 2, '红毛榴莲绵绵冰',             'Soursop Muak-Muak Ice',                    9.80, '🍈', FALSE, 8),
  (20, 2, '木瓜牛奶绵绵冰',             'Papaya Milk Muak-Muak Ice',                9.80, '🥛', FALSE, 9),
  (21, 2, '草莓绵绵冰',                'Strawberry Muak-Muak Ice',                10.80, '🍓', FALSE, 10),
  (22, 2, '冰淇淋柠檬绵绵冰',           'Ice Cream Lemon Muak-Muak Ice',            9.80, '🍋', FALSE, 11),

  -- Category 3: 叮咚饼 Pancake
  (23, 3, '花生玉米煎饼',               'Peanut & Corn Pancake',                    2.80, '🥞', FALSE, 1),
  (24, 3, '红豆煎饼',                  'Red Bean Pancake',                         2.80, '🥞', FALSE, 2),
  (25, 3, '芝士煎饼',                  'Cheese Pancake',                           2.80, '🥞', FALSE, 3),
  (26, 3, '椰丝煎饼',                  'Shredded Coconut Pancake',                 2.80, '🥞', FALSE, 4),
  (27, 3, '玉米煎饼',                  'Corn Pancake',                             2.80, '🥞', FALSE, 5),
  (28, 3, '冰淇淋煎饼',                'Ice Cream Pancake',                        5.50, '🍦', FALSE, 6),
  (29, 3, '香蕉花生巧克力煎饼',          'Banana Peanut Chocolate Pancake',          3.60, '🍫', FALSE, 7),
  (30, 3, '鸡丝芝士煎饼',               'Chicken Floss Cheese Pancake',             4.20, '🐔', FALSE, 8),
  (31, 3, '芝士蛋煎饼',                'Cheese Egg Pancake',                       4.20, '🥚', FALSE, 9),
  (32, 3, '火腿芝士煎饼(鸡肉)',         'Ham Cheese Pancake (Chicken)',             5.80, '🥪', FALSE, 10),
  (33, 3, '火腿芝士蛋煎饼',             'Ham Cheese Egg Pancake',                   6.40, '🥪', FALSE, 11),
  (34, 3, '火腿芝士咸蛋煎饼(鸡肉)',      'Ham Cheese Salted Egg Pancake (Chicken)',  5.80, '🥪', FALSE, 12),
  (35, 3, '火腿芝士咸蛋黄煎饼',          'Ham Cheese Salted Egg Yolk Pancake',       6.50, '🥪', FALSE, 13),
  (36, 3, '火腿煎饼',                  'Ham Pancake',                              7.80, '🥪', FALSE, 14),

  -- Category 4: 奶茶冰沙 Milk Tea & Ice Blended
  (41, 4, '黑糖珍珠奶茶',               'Black Sugar Pearl Milk Tea',               4.80, '🧋', TRUE,  1),
  (42, 4, '黑糖珍珠黑奶茶',             'Black Sugar Pearl Black Milk Tea',         4.80, '🧋', FALSE, 2),
  (43, 4, '绿芒珍珠鲜奶',               'Green Jelly Mango Pearl Milk',             5.30, '🧋', FALSE, 3),
  (44, 4, '百香珍珠鲜奶',               'Green Jelly Passion Fruit Milk',           5.30, '🧋', FALSE, 4),
  (45, 4, '草莓珍珠鲜奶',               'Green Jelly Strawberry Fresh Milk',        5.30, '🧋', FALSE, 5),
  (46, 4, '摩卡冰沙',                  'Mocha Ice Blended',                        6.30, '🥤', FALSE, 6),
  (47, 4, '抹茶冰沙',                  'Matcha Ice Blended',                       6.30, '🍵', FALSE, 7),
  (48, 4, '巧克力/薄荷冰沙',            'Chocolate/Mint Ice Blended',               6.30, '🥤', FALSE, 8),
  (49, 4, '天麻奶冰沙',                'Peach Protein Beauty Beverage',            6.30, '🥤', FALSE, 9),
  (50, 4, '百香果柠檬冰沙',             'Passion Fruit Lemon Tea',                  6.30, '🍋', FALSE, 10),

  -- Category 5: 蛋糕咖啡 Cake & Coffee
  (37, 5, '芝士蛋糕',                  'Cheese Cake',                              8.80, '🍰', TRUE,  1),
  (38, 5, '巧克力蛋糕',                'Chocolate Cake',                           8.80, '🎂', TRUE,  2),
  (39, 5, '卡布奇诺',                  'Cappuccino',                               4.50, '☕', FALSE, 3),
  (40, 5, '拿铁咖啡',                  'Coffee Latte',                             4.50, '☕', FALSE, 4),

  -- Category 6: 特色小吃 Special Snacks
  (51, 6, '炸薯条',                    'French Fries',                             5.80, '🍟', FALSE, 1),
  (52, 6, '特制芝士薯条',               'Cheesy Fries',                             7.80, '🍟', FALSE, 2),
  (53, 6, '阿公特制虾枣(小)',           'Ah Gong Specialty Prawn Roll (Small)',     6.80, '🍤', FALSE, 3),
  (530, 6,'阿公特制虾枣(大)',           'Ah Gong Specialty Prawn Roll (Large)',    12.00, '🍤', FALSE, 4),
  (54, 6, '炸扁菇',                    'Crispy Fried Mushrooms',                   5.80, '🍄', FALSE, 5),
  (55, 6, '阿公特制卤肉饭(小)',         'Ah Gong Specialty Braised Pork Rice (S)',  6.80, '🍱', TRUE,  6),
  (56, 6, '阿公特制卤肉饭(大)',         'Ah Gong Specialty Braised Pork Rice (L)',  8.80, '🍱', FALSE, 7),
  (57, 6, '阿公特制卤肉饭套餐',          'Ah Gong Specialty Pork Rice Set',         15.80, '🍱', TRUE,  8),

  -- Category 7: 套餐 Combo
  (63, 7, '小冰拼盘',                  'Small Muak-Muak Iceberg Delight Trio',    16.80, '🎁', TRUE,  1),
  (64, 7, '小六拼盘',                  'Small Six Treasures Treat',               16.80, '🎁', TRUE,  2),

  -- Category 8: 花茶 Tea
  (65, 8, '花茶',                      'Scented Tea',                              9.80, '🌸', FALSE, 1),
  (66, 8, '水果茶',                    'Fruits Tea',                               9.80, '🍑', FALSE, 2),
  (67, 8, '香脆拼盘',                  'Crispy Snack Tray',                       12.80, '🍿', FALSE, 3)
ON CONFLICT (menu_no) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  price = EXCLUDED.price,
  emoji = EXCLUDED.emoji,
  is_featured = EXCLUDED.is_featured,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
