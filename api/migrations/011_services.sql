SET search_path TO editorial;

CREATE TABLE services (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  allocation_days numeric(6, 2) NOT NULL CHECK (allocation_days > 0)
);

CREATE TABLE project_services (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services (id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (project_id, service_id)
);
