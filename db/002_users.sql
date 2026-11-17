CREATE TABLE users(id uuid PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE accounts ADD COLUMN user_id uuid REFERENCES users(id);
INSERT INTO users(id,display_name,created_at) SELECT id,display_name,created_at FROM accounts;
UPDATE accounts SET user_id=id;
ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE accounts ADD CONSTRAINT one_account_per_user UNIQUE(user_id);
ALTER TABLE accounts DROP COLUMN display_name;
INSERT INTO schema_migrations(version) VALUES('002');
