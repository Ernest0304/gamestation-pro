-- Migration 005: Fix menu data to exactly match printed PDF menu
-- Previous seed (migration 003) had wrong numbers/names/prices for many items.
-- This migration re-syncs to what the PDF actually shows (read pages 1-14).
-- Staff memorize by number — numbers MUST match printed menu.

-- ===== Strategy: DELETE existing items + INSERT correct ones =====
-- Safe because we're pre-launch with test data only.

DELETE FROM order_items WHERE TRUE;  -- no real orders yet
DELETE FROM orders WHERE TRUE;
DELETE FROM menu_items WHERE TRUE;

-- Reset seq for order_no
ALTER SEQUENCE order_no_seq RESTART WITH 1;

-- Re-insert correct menu, faithful to printed PDF
INSERT INTO menu_items (menu_no, category_id, name_zh, name_en, price, emoji, is_featured, display_order) VALUES
  -- ===== Page 1-2: 甜品系列 / Dessert (category 1) =====
  (1,  1, '杏仁糊',                 'Almond Paste',                                    4.50, '🥣', FALSE, 1),
  (2,  1, '黑芝麻糊',                'Black Sesame Paste',                              4.50, '🥣', FALSE, 2),
  (3,  1, '鸳鸯糊',                  'Mix Paste',                                       4.50, '🥣', FALSE, 3),
  (4,  1, '芋泥',                    'Yam Paste',                                       4.50, '🍠', FALSE, 4),
  (5,  1, '腐竹白果薏米',             'Dried Beancurd with Gingko & Barley',             4.50, '🥣', FALSE, 5),
  (6,  1, '椰糖豆花',                'Coconut Sugar Soybean Pudding',                   4.20, '🍶', FALSE, 6),
  (7,  1, '天然桃胶',                'Peach Protein Beauty Gel',                        8.80, '🍯', TRUE,  7),
  (8,  1, '姜汤汤圆',                'Glutinous Rice Ball (Peanut/Sesame)',             4.50, '🍡', FALSE, 8),
  (9,  1, '芋圆与黑芝麻圆姜汤',        'Taro & Black Sesame Balls Ginger Soup',           4.50, '🍡', FALSE, 9),
  (10, 1, '特制龟苓膏',               'Specialty Chilled Herbal Jelly',                  3.50, '🍮', FALSE, 10),
  (11, 1, '特制芒果布丁',              'Specialty Mango Pudding',                         3.50, '🥭', FALSE, 11),
  (58, 1, '金圆豆花',                'Golden Ball Soybean Pudding',                     6.20, '🍶', FALSE, 12),
  (59, 1, '汤圆豆花',                'Glutinous Rice Ball Soybean Pudding',             5.80, '🍶', FALSE, 13),
  (60, 1, '红豆芋泥豆花',             'Red Bean Yam Soybean Pudding',                    5.80, '🍶', FALSE, 14),
  (61, 1, '仙草红豆豆花',             'Grass Jelly Red Bean Soybean Pudding',            5.80, '🍶', FALSE, 15),
  (62, 1, '水果鲜奶仙草',              'Fruits Fresh Milk Grass Jelly',                   6.80, '🍇', FALSE, 16),

  -- ===== Page 3-4: 绵绵冰 / Muak-Muak Ice (category 2) =====
  (12, 2, '杏仁绵绵冰',                'Almond Muak-Muak Ice',                            9.20, '🍧', FALSE, 1),
  (13, 2, '黑芝麻绵绵冰',              'Black Sesame Muak-Muak Ice',                      9.20, '🍧', FALSE, 2),
  (14, 2, '杏仁与黑芝麻绵绵冰',         'Almond & Black Sesame Muak-Muak Ice',             9.80, '🍧', FALSE, 3),
  (15, 2, '抹茶绵绵冰',                'Green Tea Muak-Muak Ice',                         9.20, '🍵', FALSE, 4),
  (16, 2, '芋泥绵绵冰',                'Yam Muak-Muak Ice',                              10.50, '🍠', TRUE,  5),
  (17, 2, '失露椰子绵绵冰',             'Cendol Coconut Muak-Muak Ice',                    9.20, '🥥', FALSE, 6),
  (18, 2, '芒果绵绵冰',                'Mango Muak-Muak Ice',                            10.50, '🥭', TRUE,  7),
  (19, 2, '红毛榴莲绵绵冰',             'Soursop Muak-Muak Ice',                           9.20, '🍈', FALSE, 8),
  (20, 2, '木瓜牛奶绵绵冰',             'Papaya Milk Muak-Muak Ice',                       9.80, '🥛', FALSE, 9),
  (21, 2, '草莓绵绵冰',                'Strawberry Muak-Muak Ice',                       10.80, '🍓', FALSE, 10),
  (22, 2, '冰淇淋柠檬绵绵冰',           'Ice Cream Lemon Muak-Muak Ice',                   9.80, '🍋', FALSE, 11),

  -- ===== Page 7-8: 叮咚饼 / Ding Dang Pancake (category 3) =====
  (23, 3, '花生玉米煎饼',               'Peanut & Corn Pancake',                          2.80, '🥞', FALSE, 1),
  (24, 3, '巧克力煎饼',                'Chocolate Pancake',                              2.80, '🥞', FALSE, 2),
  (25, 3, '芝士煎饼',                  'Cheese Pancake',                                 2.80, '🥞', FALSE, 3),
  (26, 3, '红豆沙煎饼',                'Red Bean Pancake',                               2.80, '🥞', FALSE, 4),
  (27, 3, '椰丝煎饼',                  'Shredded Coconut Pancake',                       2.80, '🥞', FALSE, 5),
  (28, 3, '冰淇淋煎饼',                'Ice Cream Pancake',                              5.50, '🍦', FALSE, 6),
  (29, 3, '香蕉花生巧克力煎饼',          'Banana Peanut Chocolate Pancake',                3.60, '🍫', FALSE, 7),
  (30, 3, '鸡肉松芝士煎饼',             'Chicken Floss Cheese Pancake',                   4.20, '🐔', FALSE, 8),
  (31, 3, '芝士蛋煎饼',                'Cheese Egg Pancake',                             4.20, '🥚', FALSE, 9),
  (32, 3, '火腿芝士煎饼(鸡肉)',         'Ham Cheese Pancake (Chicken)',                   5.80, '🥪', FALSE, 10),
  (33, 3, '火腿芝士蛋煎饼(鸡肉)',        'Ham Cheese Egg Pancake (Chicken)',               6.40, '🥪', FALSE, 11),
  (34, 3, '火腿芝士咸蛋黄煎饼(鸡肉)',     'Ham Cheese Salted Egg Pancake (Chicken)',        5.80, '🥪', FALSE, 12),
  (35, 3, '火腿芝士蛋加咸蛋黄煎饼(鸡肉)', 'Ham Cheese Egg add Salted Egg Pancake (Chicken)',6.90, '🥪', FALSE, 13),
  (36, 3, '碰撞香鸡煎饼',               'Ram-on Pancake (Chicken)',                       7.80, '🥖', FALSE, 14),

  -- ===== Page 9: 奶茶冰沙 / Milk Tea & Ice Blended (category 4) =====
  (41, 4, '珍珠黑糖奶茶',               'Black Sugar Pearl Milk Tea',                     4.80, '🧋', TRUE,  1),
  (42, 4, '珍珠黑糖鲜奶',               'Black Sugar Pearl Fresh Milk',                   4.80, '🧋', FALSE, 2),
  (43, 4, '仙草芒果鲜奶',               'Grass Jelly Mango Fresh Milk',                   5.80, '🥭', FALSE, 3),
  (44, 4, '仙草木瓜鲜奶',               'Grass Jelly Papaya Fresh Milk',                  5.80, '🥛', FALSE, 4),
  (45, 4, '仙草草莓鲜奶',               'Grass Jelly Strawberry Fresh Milk',              5.80, '🍓', FALSE, 5),
  (46, 4, '摩卡沙冰',                  'Mocha Ice Blended',                              6.50, '🥤', FALSE, 6),
  (47, 4, '抹茶沙冰',                  'Matcha Ice Blended',                             6.50, '🍵', FALSE, 7),
  (48, 4, '巧克力/薄荷沙冰',            'Chocolate/Mint Ice Blended',                     6.50, '🥤', FALSE, 8),
  (49, 4, '桃胶汁',                    'Peach Protein Beauty Gel (Beverage)',            5.80, '🍯', FALSE, 9),
  (50, 4, '百香果柠檬茶',                'Passion Fruit Lemon Tea',                        5.80, '🍋', FALSE, 10),

  -- ===== Page 10: 蛋糕咖啡 / Cake & Coffee (category 5, "Sweet Blessed") =====
  (37, 5, '芝士蛋糕',                  'Cheese Cake',                                    8.80, '🍰', TRUE,  1),
  (38, 5, '巧克力蛋糕',                 'Chocolate Cake',                                 8.80, '🎂', TRUE,  2),
  (39, 5, '卡布奇诺',                  'Cappuccino',                                     4.50, '☕', FALSE, 3),
  (40, 5, '拿铁咖啡',                  'Coffee Latte',                                   4.50, '☕', FALSE, 4),

  -- ===== Page 11-14: 特色小吃 / Special Snacks (category 6) =====
  (51, 6, '炸薯条',                    'French Fries',                                   5.80, '🍟', FALSE, 1),
  (52, 6, '特制炸薯条',                 'Cheesy Fries',                                   7.80, '🍟', FALSE, 2),
  (53, 6, '阿公特制虾枣(小)',           'Ah Gong Specialty Fried Prawn Roll (Small)',     6.80, '🍤', FALSE, 3),
  (530,6, '阿公特制虾枣(大)',           'Ah Gong Specialty Fried Prawn Roll (Large)',    12.00, '🍤', FALSE, 4),
  (54, 6, '炸扇菇',                    'Crispy Fried Mushrooms',                         5.80, '🍄', FALSE, 5),
  (55, 6, '阿公特制卤肉饭(小)',          'Ah Gong Specialty Braised Pork Rice (Small)',    6.80, '🍱', TRUE,  6),
  (56, 6, '阿公特制卤肉饭(大)',          'Ah Gong Specialty Braised Pork Rice (Large)',    8.80, '🍱', FALSE, 7),
  (57, 6, '阿公特制卤肉饭套餐',          'Ah Gong Specialty Braised Pork Rice Set',       13.50, '🍱', TRUE,  8),

  -- ===== Page 5: 套餐 / Combo (category 7) =====
  (63, 7, '小冰山',                    'Small Muak-Muak Iceberg Delight Trio',          16.80, '🎁', TRUE,  1),
  (64, 7, '小六合',                    'Small Six Treasures Treat',                     16.80, '🎁', TRUE,  2),

  -- ===== Page 6: 花茶 / Tea (category 8) =====
  (65, 8, '花茶',                      'Scented Tea',                                    9.80, '🌸', FALSE, 1),
  (66, 8, '水果茶',                    'Fruits Tea',                                     9.80, '🍑', FALSE, 2),
  (67, 8, '香脆拼盘',                  'Crispy Snack Tray',                             12.80, '🍿', FALSE, 3);

-- Audit log this re-sync
INSERT INTO audit_log (action, before_state, after_state, note)
VALUES (
  'menu_resync_from_pdf',
  '{"reason":"original seed had wrong numbers, names, and prices"}'::jsonb,
  '{"items_count":62}'::jsonb,
  'Migration 005: rebuilt menu_items to match PDF menu pages 1-14'
);
