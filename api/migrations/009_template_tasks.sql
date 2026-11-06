SET search_path TO editorial;

CREATE TABLE template_tasks (
  id uuid PRIMARY KEY,
  stage_id uuid NOT NULL REFERENCES template_stages (id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  position integer NOT NULL CHECK (position > 0),
  predecessor_id uuid,
  UNIQUE (stage_id, position)
);

ALTER TABLE template_tasks
  ADD CONSTRAINT template_tasks_predecessor_fk
    FOREIGN KEY (predecessor_id) REFERENCES template_tasks (id) ON DELETE SET NULL,
  ADD CONSTRAINT template_tasks_not_self_predecessor
    CHECK (predecessor_id IS DISTINCT FROM id);

CREATE INDEX template_tasks_stage_idx ON template_tasks (stage_id);
CREATE INDEX template_tasks_predecessor_idx ON template_tasks (predecessor_id);

ALTER TABLE subtasks
  ADD COLUMN template_task_id uuid REFERENCES template_tasks (id) ON DELETE SET NULL;

CREATE INDEX subtasks_template_task_idx ON subtasks (template_task_id);

ALTER TABLE subtasks ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE subtasks ALTER COLUMN end_date DROP NOT NULL;
