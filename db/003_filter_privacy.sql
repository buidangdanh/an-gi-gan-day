UPDATE saved_filters SET filters=filters-'lat'-'lng'-'exclude';
ALTER TABLE saved_filters ADD CONSTRAINT filters_no_coordinates CHECK(NOT (filters ?| ARRAY['lat','lng','exclude']));
INSERT INTO schema_migrations(version) VALUES('003');
