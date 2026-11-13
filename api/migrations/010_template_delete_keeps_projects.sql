SET search_path TO editorial;

ALTER TABLE projects ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_template_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE SET NULL;

ALTER TABLE project_stages DROP CONSTRAINT IF EXISTS project_stages_template_stage_id_fkey;
ALTER TABLE project_stages
  ADD CONSTRAINT project_stages_template_stage_id_fkey
  FOREIGN KEY (template_stage_id) REFERENCES template_stages (id) ON DELETE SET NULL;
