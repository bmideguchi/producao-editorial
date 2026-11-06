SET search_path TO editorial;

ALTER TABLE subtasks DROP CONSTRAINT subtasks_duration_days_check;
ALTER TABLE subtasks ADD CONSTRAINT subtasks_duration_days_check CHECK (duration_days >= 0);

ALTER TABLE subtasks
  ADD COLUMN assignee_id uuid REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN allocation_start date,
  ADD COLUMN allocation_days integer,
  ADD CONSTRAINT subtasks_allocation_days_positive CHECK (allocation_days IS NULL OR allocation_days > 0),
  ADD CONSTRAINT subtasks_allocation_complete CHECK (
    (assignee_id IS NULL AND allocation_start IS NULL AND allocation_days IS NULL)
    OR (assignee_id IS NOT NULL AND allocation_start IS NOT NULL AND allocation_days IS NOT NULL)
  );

WITH numbered_tasks AS (
  SELECT id, stage_id, row_number() OVER (PARTITION BY stage_id ORDER BY position, id) AS n
  FROM subtasks
),
numbered_allocs AS (
  SELECT a.stage_id, a.user_id, a.start_date, a.duration_days,
         row_number() OVER (PARTITION BY a.stage_id ORDER BY a.created_at, a.user_id) AS n
  FROM allocations a
)
UPDATE subtasks AS task
SET assignee_id = alloc.user_id,
    allocation_start = alloc.start_date,
    allocation_days = alloc.duration_days
FROM numbered_tasks AS numbered
JOIN numbered_allocs AS alloc ON alloc.stage_id = numbered.stage_id AND alloc.n = numbered.n
WHERE task.id = numbered.id;

INSERT INTO subtasks (
  id, stage_id, name, duration_days, done, position,
  assignee_id, allocation_start, allocation_days, start_date, end_date
)
SELECT gen_random_uuid(),
       alloc.stage_id,
       alloc.user_name,
       alloc.duration_days,
       false,
       100000 + alloc.n,
       alloc.user_id,
       alloc.start_date,
       alloc.duration_days,
       COALESCE(stage.activated_at, project.start_date),
       COALESCE(stage.activated_at, project.start_date) + alloc.duration_days
FROM (
  SELECT a.stage_id, a.user_id, a.start_date, a.duration_days, u.name AS user_name,
         row_number() OVER (PARTITION BY a.stage_id ORDER BY a.created_at, a.user_id) AS n
  FROM allocations a
  JOIN users u ON u.id = a.user_id
) AS alloc
JOIN project_stages AS stage ON stage.id = alloc.stage_id
JOIN projects AS project ON project.id = stage.project_id
WHERE alloc.n > (
  SELECT COUNT(*)::int
  FROM subtasks AS existing
  WHERE existing.stage_id = alloc.stage_id
    AND existing.position < 100000
);

UPDATE subtasks SET position = position + 100000 WHERE position < 100000;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY stage_id ORDER BY position, id) AS n
  FROM subtasks
)
UPDATE subtasks AS task
SET position = ordered.n
FROM ordered
WHERE task.id = ordered.id;

DROP TABLE allocations;

CREATE INDEX subtasks_assignee_idx ON subtasks (assignee_id);
