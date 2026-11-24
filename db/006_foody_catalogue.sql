CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE FUNCTION food_normalize(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT trim(regexp_replace(lower(public.unaccent(coalesce(value,''))), '[^a-z0-9]+', ' ', 'g'));
$$;
ALTER TABLE restaurants ADD COLUMN food_groups text[] NOT NULL DEFAULT '{}';
ALTER TABLE restaurants ADD COLUMN primary_group text NOT NULL DEFAULT 'chưa phân nhóm';
ALTER TABLE restaurants ADD COLUMN search_text text NOT NULL DEFAULT '';
ALTER TABLE restaurants ADD COLUMN foody_id bigint UNIQUE;
ALTER TABLE restaurants ADD COLUMN external_url text;
ALTER TABLE restaurants ADD COLUMN classification_source text NOT NULL DEFAULT 'document';
CREATE FUNCTION update_food_search() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT coalesce(array_agg(DISTINCT dish->>'group' ORDER BY dish->>'group'),'{}') INTO NEW.food_groups FROM jsonb_array_elements(NEW.dishes) dish WHERE dish->>'group' IS NOT NULL;
 NEW.primary_group=coalesce(NEW.dishes->0->>'group','chưa phân nhóm');
 NEW.search_text=food_normalize(NEW.name||' '||NEW.address||' '||coalesce((SELECT string_agg(d->>'name',' ') FROM jsonb_array_elements(NEW.dishes) d),''));
 RETURN NEW;
END;$$;
CREATE TRIGGER food_search_update BEFORE INSERT OR UPDATE OF name,address,dishes ON restaurants FOR EACH ROW EXECUTE FUNCTION update_food_search();
UPDATE restaurants SET name=name;
CREATE INDEX restaurant_search_trgm ON restaurants USING gin(search_text gin_trgm_ops) WHERE active;
CREATE INDEX restaurant_food_groups ON restaurants USING gin(food_groups) WHERE active;
CREATE INDEX restaurant_catalogue_order ON restaurants(primary_group,name,id) WHERE active AND NOT demo;
CREATE INDEX restaurant_identity ON restaurants(food_normalize(name),food_normalize(address)) WHERE NOT demo;
CREATE TABLE foody_import_records(
 foody_id bigint PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 source_payload jsonb NOT NULL, classification text[] NOT NULL, classification_source text NOT NULL,
 coordinate_status text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foody_restaurant_link ON foody_import_records(restaurant_id);
INSERT INTO schema_migrations(version) VALUES('006');
