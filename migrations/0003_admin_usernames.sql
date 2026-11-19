ALTER TABLE admins ADD COLUMN username TEXT;
ALTER TABLE admins ADD COLUMN password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins(username) WHERE username IS NOT NULL;
