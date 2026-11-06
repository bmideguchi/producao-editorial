SET search_path TO editorial;

ALTER TABLE subtasks
  ADD COLUMN manual_start_date date,
  ADD COLUMN start_date date,
  ADD COLUMN end_date date,
  ADD COLUMN predecessor_id uuid;

UPDATE subtasks AS subtask
SET start_date = COALESCE(stage.activated_at, project.start_date),
    end_date = COALESCE(stage.activated_at, project.start_date) + subtask.duration_days
FROM project_stages AS stage
JOIN projects AS project ON project.id = stage.project_id
WHERE subtask.stage_id = stage.id
  AND subtask.start_date IS NULL;

ALTER TABLE subtasks
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL,
  ADD CONSTRAINT subtasks_predecessor_fk
    FOREIGN KEY (predecessor_id) REFERENCES subtasks (id) ON DELETE SET NULL,
  ADD CONSTRAINT subtasks_not_self_predecessor
    CHECK (predecessor_id IS DISTINCT FROM id);

CREATE INDEX subtasks_predecessor_idx ON subtasks (predecessor_id);
