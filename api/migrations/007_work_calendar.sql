SET search_path TO editorial;

CREATE TABLE work_calendar (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  closed_weekdays smallint[] NOT NULL
);

CREATE TABLE holidays (
  day date PRIMARY KEY
);

INSERT INTO work_calendar (id, closed_weekdays)
SELECT true, ARRAY[0, 6]::smallint[]
WHERE NOT EXISTS (SELECT 1 FROM work_calendar);
