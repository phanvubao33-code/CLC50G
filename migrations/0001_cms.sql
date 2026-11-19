PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  admin_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  admin_id TEXT NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS image_slots (
  slot_id TEXT PRIMARY KEY NOT NULL,
  section TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  object_key TEXT UNIQUE,
  focal_x INTEGER NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
  focal_y INTEGER NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_image_slots_section_order ON image_slots(section, display_order);

CREATE TABLE IF NOT EXISTS content_items (
  item_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('memory', 'timeline', 'member', 'message')),
  slot_id TEXT REFERENCES image_slots(slot_id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  nickname TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_content_items_kind_order ON content_items(kind, display_order);
CREATE INDEX IF NOT EXISTS idx_content_items_slot ON content_items(slot_id);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO image_slots (slot_id, section, aspect_ratio, caption, event_date, display_order) VALUES
  ('hero-main', 'opening', '16:9', 'Ảnh tập thể lớp', NULL, 0),
  ('beginning-01', 'beginning', '4:5', 'Ngày đầu tiên', 'Tháng 9, 2021', 1),
  ('beginning-02', 'beginning', '4:3', 'Phòng học 204', NULL, 2),
  ('beginning-03', 'beginning', '4:3', 'Những người bạn đầu tiên', NULL, 3),
  ('memory-01', 'moments', '4:3', 'Ngày cả lớp cùng ra biển', 'Tháng 6, 2022', 1),
  ('memory-02', 'moments', '3:4', 'Một chiều yên ả ở thư viện', 'Tháng 10, 2022', 2),
  ('memory-03', 'moments', '4:5', 'Hậu trường văn nghệ và bao chuyện vui', 'Tháng 2, 2023', 3),
  ('memory-04', 'moments', '6:5', 'Khoảng sân giữa hai tiết học', 'Tháng 4, 2023', 4),
  ('memory-05', 'moments', '4:5', 'Dự án khoa học đầy tâm huyết', 'Tháng 8, 2024', 5),
  ('memory-06', 'moments', '5:3', 'Lần cuối dạo quanh sân trường', 'Tháng 3, 2025', 6),
  ('journey-01', 'journey', '4:3', 'Ngày đầu tiên', 'THÁNG 9 · 2021', 1),
  ('journey-02', 'journey', '4:3', 'Chuyến đi đầu tiên', 'THÁNG 6 · 2022', 2),
  ('journey-03', 'journey', '4:3', 'Đêm diễn của chúng ta', 'THÁNG 2 · 2023', 3),
  ('journey-04', 'journey', '4:3', 'Tiếng trống cuối cùng', 'THÁNG 3 · 2025', 4),
  ('member-01', 'people', '3:4', 'An', NULL, 1),
  ('member-02', 'people', '3:4', 'Bình', NULL, 2),
  ('member-03', 'people', '3:4', 'Chi', NULL, 3),
  ('member-04', 'people', '3:4', 'Dũng', NULL, 4),
  ('member-05', 'people', '3:4', 'Hà', NULL, 5),
  ('member-06', 'people', '3:4', 'Khánh', NULL, 6),
  ('member-07', 'people', '3:4', 'Linh', NULL, 7),
  ('member-08', 'people', '3:4', 'Minh', NULL, 8),
  ('final-class-photo', 'closing', '16:9', 'Ảnh tập thể cuối năm', NULL, 0);

INSERT OR IGNORE INTO content_items (item_id, kind, slot_id, title, body, event_date, display_order) VALUES
  ('memory-01', 'memory', 'memory-01', 'Ngày cả lớp cùng ra biển', '', 'Tháng 6, 2022', 1),
  ('memory-02', 'memory', 'memory-02', 'Một chiều yên ả ở thư viện', '', 'Tháng 10, 2022', 2),
  ('memory-03', 'memory', 'memory-03', 'Hậu trường văn nghệ và bao chuyện vui', '', 'Tháng 2, 2023', 3),
  ('memory-04', 'memory', 'memory-04', 'Khoảng sân giữa hai tiết học', '', 'Tháng 4, 2023', 4),
  ('memory-05', 'memory', 'memory-05', 'Dự án khoa học đầy tâm huyết', '', 'Tháng 8, 2024', 5),
  ('memory-06', 'memory', 'memory-06', 'Lần cuối dạo quanh sân trường', '', 'Tháng 3, 2025', 6),
  ('journey-01', 'timeline', 'journey-01', 'Ngày đầu tiên', 'Thời khóa biểu mới, những nụ cười bẽn lẽn và một căn phòng đầy những người rồi sẽ trở nên thân thuộc.', 'THÁNG 9 · 2021', 1),
  ('journey-02', 'timeline', 'journey-02', 'Chuyến đi đầu tiên', 'Chuyến xe dài, danh sách nhạc chuyền tay và những câu chuyện đến giờ vẫn còn nhắc.', 'THÁNG 6 · 2022', 2),
  ('journey-03', 'timeline', 'journey-03', 'Đêm diễn của chúng ta', 'Sau nhiều tuần tập luyện là một đêm rộn ràng mà cả lớp đã cùng nhau làm nên.', 'THÁNG 2 · 2023', 3),
  ('journey-04', 'timeline', 'journey-04', 'Tiếng trống cuối cùng', 'Ta rời lớp học, mang theo bao điều mới mẻ so với ngày đầu tiên.', 'THÁNG 3 · 2025', 4),
  ('member-01', 'member', 'member-01', 'An', 'Lúc nào cũng đến sớm năm phút.', NULL, 1),
  ('member-02', 'member', 'member-02', 'Bình', 'Người luôn cầm máy ảnh.', NULL, 2),
  ('member-03', 'member', 'member-03', 'Chi', 'Chuyên gia chọc cả lớp cười.', NULL, 3),
  ('member-04', 'member', 'member-04', 'Dũng', 'DJ không chính thức của lớp.', NULL, 4),
  ('member-05', 'member', 'member-05', 'Hà', 'Chẳng bao giờ bỏ sót chi tiết.', NULL, 5),
  ('member-06', 'member', 'member-06', 'Khánh', 'Luôn sẵn lòng chia đồ ăn.', NULL, 6),
  ('member-07', 'member', 'member-07', 'Linh', 'Người biến ý tưởng thành hiện thực.', NULL, 7),
  ('member-08', 'member', 'member-08', 'Minh', 'Lúc nào cũng để dành chỗ cho bạn.', NULL, 8),
  ('message-01', 'message', NULL, 'Nhắn gửi chúng ta sau này', 'Mong chúng ta luôn dành thời gian cho những điều khiến mình cười thật lâu.', NULL, 1),
  ('message-02', 'message', NULL, 'Từ ban kỷ yếu', 'Tưởng chỉ là những ngày tháng trôi qua. Hóa ra, chúng ta đã cùng nhau tạo nên một mái nhà.', NULL, 2),
  ('message-03', 'message', NULL, 'Gửi tất cả chúng ta', 'Khi nhìn lại, mong bạn nhớ rằng nơi đây luôn có rất nhiều người thương bạn.', NULL, 3);

INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES
  ('hero_lead', 'Có những khoảnh khắc'),
  ('hero_line', 'xứng đáng'),
  ('hero_accent', 'còn mãi.'),
  ('hero_intro', 'Bốn năm, nghìn câu chuyện nhỏ, cùng những người đã biến tất cả thành kỷ niệm của riêng chúng ta. Đây là nơi lưu giữ những điều ấy.'),
  ('closing_title', 'Ta đã ở đây.\nĐã cười, đã lớn lên.\nVà sẽ luôn nhớ.'),
  ('closing_body', 'Dù mai này mỗi người một ngả, một phần ký ức này sẽ mãi thuộc về chúng ta.');
