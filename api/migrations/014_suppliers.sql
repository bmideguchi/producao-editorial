SET search_path TO editorial;

CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE UNIQUE INDEX suppliers_name_lower_idx ON suppliers (lower(name));

ALTER TABLE projects
  ADD COLUMN supplier_id uuid REFERENCES suppliers (id) ON DELETE RESTRICT;

ALTER TABLE subtasks
  ADD COLUMN supplier_id uuid REFERENCES suppliers (id) ON DELETE RESTRICT;

ALTER TABLE subtasks DROP CONSTRAINT subtasks_allocation_complete;

ALTER TABLE subtasks ADD CONSTRAINT subtasks_allocation_complete CHECK (
  (
    assignee_id IS NULL
    AND supplier_id IS NULL
    AND allocation_start IS NULL
    AND allocation_days IS NULL
  )
  OR (
    assignee_id IS NOT NULL
    AND supplier_id IS NULL
    AND allocation_start IS NOT NULL
    AND allocation_days IS NOT NULL
  )
  OR (
    assignee_id IS NULL
    AND supplier_id IS NOT NULL
    AND allocation_start IS NOT NULL
    AND allocation_days IS NOT NULL
  )
);

CREATE INDEX projects_supplier_idx ON projects (supplier_id);
CREATE INDEX subtasks_supplier_idx ON subtasks (supplier_id);
