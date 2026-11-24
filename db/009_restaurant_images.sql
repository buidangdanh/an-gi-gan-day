SET LOCAL statement_timeout = 0;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS image_checked_at timestamptz;

ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_image_url_https_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_image_url_https_check
 CHECK (image_url IS NULL OR image_url ~ '^https://[a-zA-Z0-9.-]+/');

INSERT INTO schema_migrations(version) VALUES('009') ON CONFLICT DO NOTHING;
