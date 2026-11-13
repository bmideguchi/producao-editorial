SET search_path TO editorial;

CREATE TABLE clients (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE UNIQUE INDEX clients_name_lower_idx ON clients (lower(name));

INSERT INTO clients (id, name)
SELECT gen_random_uuid(), name
FROM (
  SELECT DISTINCT ON (lower(btrim(client_name))) btrim(client_name) AS name
  FROM projects
  WHERE btrim(client_name) <> ''
  ORDER BY lower(btrim(client_name)), btrim(client_name)
) existing;

ALTER TABLE projects
  ADD COLUMN client_id uuid REFERENCES clients (id) ON DELETE RESTRICT;

UPDATE projects AS project
SET client_id = client.id
FROM clients AS client
WHERE lower(client.name) = lower(btrim(project.client_name))
  AND btrim(project.client_name) <> '';

ALTER TABLE projects DROP COLUMN client_name;

ALTER TABLE project_services
  ADD COLUMN allocation_days numeric(6, 2);

UPDATE project_services AS link
SET allocation_days = service.allocation_days
FROM services AS service
WHERE service.id = link.service_id;

ALTER TABLE project_services
  ALTER COLUMN allocation_days SET NOT NULL;

ALTER TABLE project_services
  ADD CONSTRAINT project_services_allocation_days_positive CHECK (allocation_days > 0);
