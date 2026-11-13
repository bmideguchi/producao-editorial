SET search_path TO editorial;

ALTER TABLE projects
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN client_name text NOT NULL DEFAULT '';
