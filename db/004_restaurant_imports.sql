CREATE TABLE import_documents (
 id text PRIMARY KEY,
 title text NOT NULL,
 url text NOT NULL,
 source_modified_at timestamptz NOT NULL,
 content_sha256 text NOT NULL,
 source_notes jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE restaurant_candidates (
 document_id text NOT NULL REFERENCES import_documents(id),
 record_id text NOT NULL,
 category text NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 20),
 name text NOT NULL,
 address text NOT NULL,
 source_type text NOT NULL,
 source_notes text NOT NULL,
 category_price_reference text NOT NULL,
 verification_status text NOT NULL DEFAULT 'pending_verification' CHECK(verification_status IN ('pending_verification','verified','rejected')),
 payload jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,record_id)
);
COMMENT ON TABLE restaurant_candidates IS 'Danh sách nguồn chờ xác minh; độc lập với restaurants public; không tự gán tọa độ, giá từng quán hoặc điểm.';
INSERT INTO schema_migrations(version) VALUES('004');
