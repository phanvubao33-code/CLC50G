PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS image_upload_intents (
  upload_id TEXT PRIMARY KEY NOT NULL,
  admin_id TEXT NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES image_slots(slot_id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  max_bytes INTEGER NOT NULL CHECK (max_bytes BETWEEN 1 AND 12582912),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_image_upload_intents_expiry ON image_upload_intents(expires_at);
