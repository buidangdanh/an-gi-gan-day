ALTER TABLE restaurants ADD COLUMN search_tokens tsvector GENERATED ALWAYS AS (to_tsvector('simple',search_text)) STORED;
CREATE INDEX restaurant_search_tokens ON restaurants USING gin(search_tokens) WHERE active;
INSERT INTO schema_migrations(version) VALUES('007');
