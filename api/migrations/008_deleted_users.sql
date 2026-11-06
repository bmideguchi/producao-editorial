SET search_path TO editorial;

ALTER TABLE users
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX users_not_deleted_idx ON users (id) WHERE deleted_at IS NULL;
