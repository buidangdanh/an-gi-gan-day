CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE accounts(id uuid PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_identities(provider text NOT NULL, subject text NOT NULL, account_id uuid NOT NULL REFERENCES accounts(id), PRIMARY KEY(provider,subject));
CREATE TABLE subscriptions(account_id uuid PRIMARY KEY REFERENCES accounts(id), expires_at timestamptz NOT NULL, source text NOT NULL);
CREATE TABLE restaurants(
 id uuid PRIMARY KEY, name text NOT NULL, address text NOT NULL,
 lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90), lng double precision NOT NULL CHECK(lng BETWEEN -180 AND 180),
 location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED,
 dishes jsonb NOT NULL, hours jsonb, price_min integer, price_max integer,
 source text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), demo boolean NOT NULL DEFAULT true,
 active boolean NOT NULL DEFAULT true, branch_of uuid REFERENCES restaurants(id),
 CHECK(price_min IS NULL OR price_min>=0), CHECK(price_max IS NULL OR price_max>=price_min)
);
CREATE INDEX restaurant_geo ON restaurants USING gist(location);
CREATE TABLE sessions(
 id text PRIMARY KEY, account_id uuid REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL DEFAULT now(), pending_restaurant uuid REFERENCES restaurants(id), pending_at timestamptz
);
CREATE TABLE visits(session_id text NOT NULL REFERENCES sessions(id), restaurant_id uuid NOT NULL REFERENCES restaurants(id), account_id uuid REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,restaurant_id));
CREATE INDEX visit_account ON visits(account_id,restaurant_id,created_at);
CREATE TABLE favorites(account_id uuid REFERENCES accounts(id), restaurant_id uuid REFERENCES restaurants(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,restaurant_id));
CREATE TABLE saved_filters(id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), name text NOT NULL, filters jsonb NOT NULL);
CREATE TABLE reviews(
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 taste integer NOT NULL CHECK(taste BETWEEN 1 AND 5), value integer NOT NULL CHECK(value BETWEEN 1 AND 5),
 service integer NOT NULL CHECK(service BETWEEN 1 AND 5), space integer NOT NULL CHECK(space BETWEEN 1 AND 5),
 score numeric GENERATED ALWAYS AS (taste*0.5+value*0.25+service*0.15+space*0.1) STORED,
 body text NOT NULL, self_confirmed boolean NOT NULL CHECK(self_confirmed), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,restaurant_id)
);
CREATE TABLE review_history(id bigserial PRIMARY KEY, review_id uuid NOT NULL REFERENCES reviews(id), snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE VIEW review_aggregates AS SELECT restaurant_id, count(*)::int AS count, avg(score)::float AS average FROM reviews WHERE status='approved' GROUP BY restaurant_id;
CREATE TABLE reports(id uuid PRIMARY KEY, session_id text NOT NULL REFERENCES sessions(id), restaurant_id uuid NOT NULL REFERENCES restaurants(id), review_id uuid REFERENCES reviews(id), body text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit(id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rate_limits(key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE payment_events(id text PRIMARY KEY, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES ('001');
