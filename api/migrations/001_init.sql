SET search_path TO editorial;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE templates (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX templates_name_lower_idx ON templates (lower(name));

CREATE TABLE template_stages (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  position integer NOT NULL CHECK (position > 0),
  UNIQUE (template_id, position)
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  template_id uuid NOT NULL REFERENCES templates (id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_stages (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  position integer NOT NULL CHECK (position > 0),
  activated_at date,
  UNIQUE (project_id, position)
);

CREATE TABLE allocations (
  stage_id uuid NOT NULL REFERENCES project_stages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stage_id, user_id)
);

CREATE TABLE completions (
  stage_id uuid NOT NULL REFERENCES project_stages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stage_id, user_id)
);

CREATE INDEX allocations_user_idx ON allocations (user_id);
CREATE INDEX project_stages_project_idx ON project_stages (project_id);
CREATE INDEX sessions_user_idx ON sessions (user_id);
