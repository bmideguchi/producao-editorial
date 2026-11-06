SET search_path TO editorial;

ALTER TABLE template_stages DROP COLUMN duration_days;

ALTER TABLE project_stages
  ADD COLUMN template_stage_id uuid REFERENCES template_stages (id) ON DELETE CASCADE;

UPDATE project_stages AS ps
SET template_stage_id = ts.id
FROM projects AS p, template_stages AS ts
WHERE ps.project_id = p.id
  AND ts.template_id = p.template_id
  AND ts.position = ps.position
  AND ps.name = ts.name
  AND (
    SELECT COUNT(*) FROM project_stages AS child WHERE child.project_id = p.id
  ) = (
    SELECT COUNT(*) FROM template_stages AS sibling WHERE sibling.template_id = p.template_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM project_stages AS mismatch
    JOIN template_stages AS expected
      ON expected.template_id = p.template_id
     AND expected.position = mismatch.position
    WHERE mismatch.project_id = p.id
      AND mismatch.name <> expected.name
  );

ALTER TABLE project_stages DROP COLUMN duration_days;

CREATE TABLE subtasks (
  id uuid PRIMARY KEY,
  stage_id uuid NOT NULL REFERENCES project_stages (id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position > 0),
  UNIQUE (stage_id, position)
);

CREATE INDEX subtasks_stage_idx ON subtasks (stage_id);
CREATE INDEX project_stages_template_stage_idx ON project_stages (template_stage_id);
