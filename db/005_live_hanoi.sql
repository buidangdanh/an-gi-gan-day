ALTER TABLE restaurants ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE restaurants ALTER COLUMN lng DROP NOT NULL;
ALTER TABLE restaurants ADD CONSTRAINT coordinates_pair CHECK((lat IS NULL)=(lng IS NULL));
ALTER TABLE restaurants ADD COLUMN import_record_id text UNIQUE;
ALTER TABLE restaurants ADD COLUMN location_source text NOT NULL DEFAULT 'manual';
ALTER TABLE restaurants ADD COLUMN location_checked_at timestamptz;
ALTER TABLE restaurants ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified';
INSERT INTO schema_migrations(version) VALUES('005');
