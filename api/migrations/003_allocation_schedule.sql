SET search_path TO editorial;

ALTER TABLE allocations
  ADD COLUMN start_date date,
  ADD COLUMN duration_days integer;

UPDATE allocations
SET start_date = created_at::date,
    duration_days = 1
WHERE start_date IS NULL OR duration_days IS NULL;

ALTER TABLE allocations
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN duration_days SET NOT NULL,
  ADD CONSTRAINT allocations_duration_positive CHECK (duration_days > 0);
