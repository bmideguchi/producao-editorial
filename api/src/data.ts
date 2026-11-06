import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import {
  addWorkingDays,
  forecastStages,
  overallStatus,
  predecessorViolation,
  scheduleTasks,
  stageAnchor,
  stageAppearance,
  stageDurationDays,
  stagesToActivate,
  statusPercent,
  type OverallStatus,
  type PredecessorScope,
  type StageColor,
  type WorkCalendar,
  DEFAULT_WORK_CALENDAR,
} from './domain.js'
import { badRequest, conflict, forbidden, notFound } from './http.js'

type Db = Pool | PoolClient

export const removedUserName = 'Usuário excluído'

export type Role = 'admin' | 'operator'

export type PublicUser = {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
}

export type OperatorOnStage = {
  id: string
  name: string
  active: boolean
  deleted: boolean
  completed: boolean
  startDate: string
  durationDays: number
}

export type TaskAssignee = {
  id: string
  name: string
  active: boolean
  deleted: boolean
  startDate: string
  durationDays: number
}

export type SubtaskDetail = {
  id: string
  name: string
  durationDays: number
  done: boolean
  position: number
  startDate: string | null
  endDate: string | null
  predecessorId: string | null
  assignee: TaskAssignee | null
}

export type StageDetail = {
  id: string
  name: string
  position: number
  durationDays: number
  activatedAt: string | null
  color: StageColor
  unassigned: boolean
  forecastStart: string
  forecastEnd: string
  operators: OperatorOnStage[]
  subtasks: SubtaskDetail[]
}

export type ProjectDetail = {
  id: string
  name: string
  templateId: string
  templateName: string
  startDate: string
  archived: boolean
  subtasksDone: number
  subtasksTotal: number
  stages: StageDetail[]
}

export type ProjectListFields = {
  id: string
  name: string
  startDate: string
  stages: {
    id: string
    name: string
    position: number
    color: StageColor
    unassigned: boolean
  }[]
  subtasksDone: number
  subtasksTotal: number
  statusPercent: number
  overall: OverallStatus
}

export type TemplateTaskRecord = {
  id: string
  name: string
  durationDays: number
  position: number
  predecessorId: string | null
}

export type TemplateRecord = {
  id: string
  name: string
  archived: boolean
  stages: {
    id: string
    name: string
    position: number
    tasks: TemplateTaskRecord[]
  }[]
}

type TemplateTaskDraft = {
  id?: string
  name: string
  durationDays: number
  predecessorId?: string | null
}

type TemplateStageDraft = {
  id?: string
  name: string
  tasks?: TemplateTaskDraft[]
}

type ResolvedTemplateTask = {
  id: string
  name: string
  durationDays: number
  position: number
  predecessorId: string | null
}

type ResolvedTemplateStage = {
  id: string
  name: string
  tasksProvided: boolean
  tasks: ResolvedTemplateTask[]
}

type StageRow = {
  id: string
  project_id: string
  name: string
  position: number
  activated_at: string | null
}

type OperatorRow = {
  stage_id: string
  id: string
  name: string
  active: boolean
  deleted: boolean
  completed: boolean
  start_date: string
  duration_days: number
}

type SubtaskRow = {
  id: string
  stage_id: string
  name: string
  duration_days: number
  done: boolean
  position: number
  assignee_id: string | null
  assignee_name: string | null
  assignee_active: boolean | null
  assignee_deleted: boolean | null
  allocation_start: string | null
  allocation_days: number | null
  start_date: string | null
  end_date: string | null
  predecessor_id: string | null
}

function appearanceOf(stage: StageRow, operators: OperatorRow[]) {
  return stageAppearance({
    activated: stage.activated_at !== null,
    operatorIds: operators.map((operator) => operator.id),
    completedOperatorIds: operators.filter((operator) => operator.completed).map((operator) => operator.id),
  })
}

async function loadStageRows(db: Db, projectIds: string[]): Promise<StageRow[]> {
  if (projectIds.length === 0) return []
  const result = await db.query<StageRow>(
    `SELECT id, project_id, name, position, activated_at
     FROM project_stages
     WHERE project_id = ANY($1::uuid[])
     ORDER BY position`,
    [projectIds],
  )
  return result.rows
}

async function loadSubtasks(db: Db, stageIds: string[]): Promise<SubtaskRow[]> {
  if (stageIds.length === 0) return []
  const result = await db.query<SubtaskRow>(
    `SELECT t.id, t.stage_id, t.name, t.duration_days, t.done, t.position,
            t.assignee_id, u.name AS assignee_name, u.active AS assignee_active,
            (u.deleted_at IS NOT NULL) AS assignee_deleted,
            t.allocation_start, t.allocation_days,
            t.start_date, t.end_date, t.predecessor_id
     FROM subtasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.stage_id = ANY($1::uuid[])
     ORDER BY t.position`,
    [stageIds],
  )
  return result.rows
}

function operatorsOnStage(tasks: readonly SubtaskRow[]): OperatorRow[] {
  const people: OperatorRow[] = []
  const seen = new Set<string>()
  for (const task of tasks) {
    if (!task.assignee_id) continue
    const key = `${task.stage_id}:${task.assignee_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const assigned = tasks.filter((item) => item.stage_id === task.stage_id && item.assignee_id === task.assignee_id)
    const missing = task.assignee_deleted === true || !task.assignee_name
    people.push({
      stage_id: task.stage_id,
      id: task.assignee_id,
      name: missing || !task.assignee_name ? removedUserName : task.assignee_name,
      active: Boolean(task.assignee_active),
      deleted: missing,
      completed: assigned.every((item) => item.done),
      start_date: task.allocation_start ?? '',
      duration_days: task.allocation_days ?? 0,
    })
  }
  return people
}

function assigneeOf(task: SubtaskRow): TaskAssignee | null {
  if (!task.assignee_id || !task.allocation_start || task.allocation_days === null) return null
  const missing = task.assignee_deleted === true || !task.assignee_name
  return {
    id: task.assignee_id,
    name: missing || !task.assignee_name ? removedUserName : task.assignee_name,
    active: Boolean(task.assignee_active),
    deleted: missing,
    startDate: task.allocation_start,
    durationDays: task.allocation_days,
  }
}

function assembleProject(
  project: {
    id: string
    name: string
    template_id: string
    template_name: string
    start_date: string
    archived: boolean
  },
  stages: StageRow[],
  operators: OperatorRow[],
  subtasks: SubtaskRow[],
  calendar: WorkCalendar,
): ProjectDetail {
  const stageSubtasks = stages.map((stage) => subtasks.filter((subtask) => subtask.stage_id === stage.id))
  const spans = stageSubtasks.map((items) => stageDurationDays(items.map((subtask) => ({
    startDate: subtask.start_date,
    endDate: subtask.end_date,
  })), calendar))
  const forecasts = forecastStages(
    project.start_date,
    stages.map((stage, index) => ({
      id: stage.id,
      position: stage.position,
      durationDays: spans[index],
      activatedAt: stage.activated_at,
    })),
    calendar,
  )
  const forecastById = new Map(forecasts.map((forecast) => [forecast.id, forecast]))
  const assembledStages = stages.map((stage, index) => {
    const people = operators.filter((operator) => operator.stage_id === stage.id)
    const appearance = appearanceOf(stage, people)
    const forecast = forecastById.get(stage.id)
    const items = stageSubtasks[index]
    return {
      id: stage.id,
      name: stage.name,
      position: stage.position,
      durationDays: spans[index],
      activatedAt: stage.activated_at,
      color: appearance.color,
      unassigned: appearance.unassigned,
      forecastStart: forecast?.forecastStart ?? project.start_date,
      forecastEnd: forecast?.forecastEnd ?? project.start_date,
      operators: people.map((person) => ({
          id: person.id,
          name: person.name,
          active: person.active,
          deleted: person.deleted,
          completed: person.completed,
          startDate: person.start_date,
          durationDays: person.duration_days,
        })),
      subtasks: items.map((subtask) => ({
        id: subtask.id,
        name: subtask.name,
        durationDays: subtask.duration_days,
        done: subtask.done,
        position: subtask.position,
        startDate: subtask.start_date,
        endDate: subtask.end_date,
        predecessorId: subtask.predecessor_id,
        assignee: assigneeOf(subtask),
      })),
    }
  })
  const subtasksTotal = assembledStages.reduce((total, stage) => total + stage.subtasks.length, 0)
  const subtasksDone = assembledStages.reduce(
    (total, stage) => total + stage.subtasks.filter((subtask) => subtask.done).length,
    0,
  )
  return {
    id: project.id,
    name: project.name,
    templateId: project.template_id,
    templateName: project.template_name,
    startDate: project.start_date,
    archived: project.archived,
    subtasksDone,
    subtasksTotal,
    stages: assembledStages,
  }
}

export function projectListFields(project: ProjectDetail, admin: boolean): ProjectListFields {
  return {
    id: project.id,
    name: project.name,
    startDate: project.startDate,
    stages: project.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
      color: stage.color,
      unassigned: admin ? stage.unassigned : false,
    })),
    subtasksDone: project.subtasksDone,
    subtasksTotal: project.subtasksTotal,
    statusPercent: statusPercent(project.subtasksDone, project.subtasksTotal),
    overall: overallStatus(project.stages.map((stage) => stage.color)),
  }
}

export async function getProject(db: Db, projectId: string): Promise<ProjectDetail | null> {
  const result = await db.query<{
    id: string
    name: string
    template_id: string
    template_name: string
    start_date: string
    archived: boolean
  }>(
    `SELECT p.id, p.name, p.template_id, t.name AS template_name, p.start_date, p.archived
     FROM projects p
     JOIN templates t ON t.id = p.template_id
     WHERE p.id = $1`,
    [projectId],
  )
  const project = result.rows[0]
  if (!project) return null
  const stages = await loadStageRows(db, [projectId])
  const stageIds = stages.map((stage) => stage.id)
  const subtasks = await loadSubtasks(db, stageIds)
  const calendar = await loadCalendar(db)
  return assembleProject(project, stages, operatorsOnStage(subtasks), subtasks, calendar)
}

export async function listProjects(db: Db, filter: { userId?: string }): Promise<ProjectDetail[]> {
  const result = filter.userId
    ? await db.query<{
        id: string
        name: string
        template_id: string
        template_name: string
        start_date: string
        archived: boolean
      }>(
        `SELECT DISTINCT p.id, p.name, p.template_id, t.name AS template_name, p.start_date, p.archived
         FROM projects p
         JOIN templates t ON t.id = p.template_id
         JOIN project_stages s ON s.project_id = p.id
         JOIN subtasks task ON task.stage_id = s.id
         WHERE p.archived = false AND task.assignee_id = $1
         ORDER BY p.name`,
        [filter.userId],
      )
    : await db.query<{
        id: string
        name: string
        template_id: string
        template_name: string
        start_date: string
        archived: boolean
      }>(
        `SELECT p.id, p.name, p.template_id, t.name AS template_name, p.start_date, p.archived
         FROM projects p
         JOIN templates t ON t.id = p.template_id
         WHERE p.archived = false
         ORDER BY p.name`,
      )
  const projects = result.rows
  const stages = await loadStageRows(db, projects.map((project) => project.id))
  const stageIds = stages.map((stage) => stage.id)
  const subtasks = await loadSubtasks(db, stageIds)
  const calendar = await loadCalendar(db)
  return projects.map((project) => {
    const projectStages = stages.filter((stage) => stage.project_id === project.id)
    const projectTasks = subtasks.filter((task) => projectStages.some((stage) => stage.id === task.stage_id))
    return assembleProject(project, projectStages, operatorsOnStage(projectTasks), subtasks, calendar)
  })
}

async function requireProject(db: Db, projectId: string): Promise<ProjectDetail> {
  const project = await getProject(db, projectId)
  if (!project) throw notFound('Projeto não encontrado.')
  return project
}

async function requireOpenStage(client: PoolClient, projectId: string, stageId: string): Promise<ProjectDetail> {
  const project = await requireProject(client, projectId)
  if (project.archived) throw conflict('Projeto arquivado não pode ser editado.')
  if (!project.stages.some((stage) => stage.id === stageId)) throw notFound('Etapa não encontrada.')
  return project
}

export async function loadCalendar(db: Db): Promise<WorkCalendar> {
  const settings = await db.query<{ closed_weekdays: number[] | null }>(
    'SELECT closed_weekdays FROM work_calendar WHERE id = true',
  )
  const stored = settings.rows[0]
  const holidays = await db.query<{ day: string }>('SELECT day FROM holidays ORDER BY day')
  return {
    closedWeekdays: stored
      ? (stored.closed_weekdays ?? []).map(Number)
      : [...DEFAULT_WORK_CALENDAR.closedWeekdays],
    holidays: holidays.rows.map((row) => row.day),
  }
}

export async function saveCalendar(client: PoolClient, input: WorkCalendar): Promise<WorkCalendar> {
  const closedWeekdays = [...new Set(input.closedWeekdays.map(Number))].sort((a, b) => a - b)
  if (closedWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw badRequest('Informe os dias da semana sem expediente.')
  }
  const holidays = [...new Set(input.holidays)].sort()
  await client.query(
    `INSERT INTO work_calendar (id, closed_weekdays)
     VALUES (true, $1::smallint[])
     ON CONFLICT (id) DO UPDATE SET closed_weekdays = EXCLUDED.closed_weekdays`,
    [closedWeekdays],
  )
  await client.query('DELETE FROM holidays')
  for (const day of holidays) {
    await client.query('INSERT INTO holidays (day) VALUES ($1)', [day])
  }
  const projects = await client.query<{ id: string }>('SELECT id FROM projects')
  for (const project of projects.rows) await rescheduleProject(client, project.id)
  return loadCalendar(client)
}

async function rescheduleProject(client: PoolClient, projectId: string, fromStageId?: string): Promise<void> {
  const stages = await client.query<{
    id: string
    position: number
    activated_at: string | null
    start_date: string
  }>(
    `SELECT stage.id, stage.position, stage.activated_at, project.start_date
     FROM project_stages AS stage
     JOIN projects AS project ON project.id = stage.project_id
     WHERE stage.project_id = $1
     ORDER BY stage.position`,
    [projectId],
  )
  const tasks = await client.query<{
    id: string
    stage_id: string
    duration_days: number
    predecessor_id: string | null
    manual_start_date: string | null
    end_date: string | null
  }>(
    `SELECT task.id, task.stage_id, task.duration_days, task.predecessor_id,
            task.manual_start_date, task.end_date
     FROM subtasks AS task
     JOIN project_stages AS stage ON stage.id = task.stage_id
     WHERE stage.project_id = $1`,
    [projectId],
  )
  let startAt = fromStageId
    ? stages.rows.find((stage) => stage.id === fromStageId)?.position ?? 1
    : 1
  for (const stage of stages.rows) {
    if (stage.position >= startAt) break
    if (tasks.rows.some((task) => task.stage_id === stage.id && !task.end_date)) {
      startAt = stage.position
      break
    }
  }
  const calendar = await loadCalendar(client)
  const ends = new Map<string, string>()
  for (const task of tasks.rows) {
    if (task.end_date) ends.set(task.id, task.end_date)
  }
  for (const stage of stages.rows) {
    if (stage.position < startAt) continue
    const stageTasks = tasks.rows.filter((task) => task.stage_id === stage.id)
    if (stageTasks.length === 0) continue
    const scheduled = scheduleTasks(
      stageAnchor(stage.activated_at, stage.start_date),
      stageTasks.map((task) => ({
        id: task.id,
        durationDays: Number(task.duration_days),
        predecessorId: task.predecessor_id,
        manualStart: task.manual_start_date,
      })),
      ends,
      calendar,
    )
    for (const task of stageTasks) {
      const dates = scheduled.get(task.id)
      if (!dates) continue
      ends.set(task.id, dates.endDate)
      task.end_date = dates.endDate
      await client.query('UPDATE subtasks SET start_date = $1, end_date = $2 WHERE id = $3', [
        dates.startDate,
        dates.endDate,
        task.id,
      ])
    }
  }
}

async function sweep(client: PoolClient, projectId: string, today: string): Promise<void> {
  const project = await requireProject(client, projectId)
  const pending = stagesToActivate(
    project.stages.map((stage) => ({
      id: stage.id,
      position: stage.position,
      activatedAt: stage.activatedAt,
      color: stage.color,
    })),
  )
  for (const stageId of pending) {
    const updated = await client.query(
      'UPDATE project_stages SET activated_at = $1 WHERE id = $2 AND activated_at IS NULL',
      [today, stageId],
    )
    if (updated.rowCount) await rescheduleProject(client, projectId, stageId)
  }
}

function resolveTemplateStages(
  input: readonly TemplateStageDraft[],
  existingByStage: ReadonlyMap<string, readonly TemplateTaskRecord[]>,
): ResolvedTemplateStage[] {
  const stages: ResolvedTemplateStage[] = input.map((stage) => {
    const id = stage.id ?? randomUUID()
    if (!stage.tasks) {
      const existing = stage.id ? existingByStage.get(stage.id) ?? [] : []
      return {
        id,
        name: stage.name,
        tasksProvided: false,
        tasks: existing.map((task) => ({
          id: task.id,
          name: task.name,
          durationDays: task.durationDays,
          position: task.position,
          predecessorId: task.predecessorId,
        })),
      }
    }
    return {
      id,
      name: stage.name,
      tasksProvided: true,
      tasks: stage.tasks.map((task, index) => {
        if (!Number.isInteger(task.durationDays) || task.durationDays <= 0) {
          throw badRequest('A duração precisa ser um número inteiro de dias maior que zero.')
        }
        return {
          id: task.id ?? randomUUID(),
          name: task.name,
          durationDays: task.durationDays,
          position: index + 1,
          predecessorId: task.predecessorId ?? null,
        }
      }),
    }
  })
  const seen = new Set<string>()
  for (const stage of stages) {
    for (const task of stage.tasks) {
      if (seen.has(task.id)) throw badRequest('Tarefa repetida no template.')
      seen.add(task.id)
    }
  }
  const flat = stages.flatMap((stage, stageIndex) => stage.tasks.map((task) => ({ ...task, stageIndex })))
  const predecessorOf = new Map(flat.map((task) => [task.id, task.predecessorId]))
  for (const task of flat) {
    if (!task.predecessorId) continue
    const idsAt = (matches: (index: number) => boolean) => new Set(
      flat.filter((item) => matches(item.stageIndex)).map((item) => item.id),
    )
    const violation = predecessorViolation(task.id, task.predecessorId, {
      sameStageIds: idsAt((index) => index === task.stageIndex),
      previousStageIds: idsAt((index) => index === task.stageIndex - 1),
      laterStageIds: idsAt((index) => index > task.stageIndex),
      earlierStageIds: idsAt((index) => index < task.stageIndex - 1),
    }, predecessorOf)
    if (violation) throw badRequest(violation)
  }
  return stages
}

async function assertTemplateTaskOwnership(
  client: PoolClient,
  templateId: string,
  stages: readonly ResolvedTemplateStage[],
): Promise<void> {
  const ids = stages.flatMap((stage) => stage.tasks.map((task) => task.id))
  if (ids.length === 0) return
  const foreign = await client.query(
    `SELECT 1
     FROM template_tasks AS task
     JOIN template_stages AS stage ON stage.id = task.stage_id
     WHERE task.id = ANY($1::uuid[]) AND stage.template_id <> $2
     LIMIT 1`,
    [ids, templateId],
  )
  if (foreign.rowCount) throw badRequest('Uma das tarefas não pertence a este template.')
}

async function writeTemplateTasks(client: PoolClient, stages: readonly ResolvedTemplateStage[]): Promise<void> {
  const provided = stages.filter((stage) => stage.tasksProvided)
  if (provided.length === 0) return
  const stageIds = provided.map((stage) => stage.id)
  const keepIds = stages.flatMap((stage) => stage.tasks.map((task) => task.id))
  if (keepIds.length === 0) {
    await client.query('DELETE FROM template_tasks WHERE stage_id = ANY($1::uuid[])', [stageIds])
  } else {
    await client.query(
      `DELETE FROM template_tasks
       WHERE stage_id = ANY($1::uuid[])
         AND NOT (id = ANY($2::uuid[]))`,
      [stageIds, keepIds],
    )
  }
  await client.query(
    'UPDATE template_tasks SET position = position + 100000 WHERE stage_id = ANY($1::uuid[])',
    [stageIds],
  )
  for (const stage of provided) {
    for (const task of stage.tasks) {
      const updated = await client.query(
        `UPDATE template_tasks
         SET stage_id = $1, name = $2, duration_days = $3, position = $4, predecessor_id = NULL
         WHERE id = $5`,
        [stage.id, task.name, task.durationDays, task.position, task.id],
      )
      if (!updated.rowCount) {
        await client.query(
          `INSERT INTO template_tasks (id, stage_id, name, duration_days, position, predecessor_id)
           VALUES ($1, $2, $3, $4, $5, NULL)`,
          [task.id, stage.id, task.name, task.durationDays, task.position],
        )
      }
    }
  }
  for (const stage of provided) {
    for (const task of stage.tasks) {
      if (!task.predecessorId) continue
      await client.query('UPDATE template_tasks SET predecessor_id = $1 WHERE id = $2', [
        task.predecessorId,
        task.id,
      ])
    }
  }
}

async function copyTemplateTasks(
  client: PoolClient,
  projectId: string,
  templateStageId: string,
  projectStageId: string,
): Promise<void> {
  const tasks = await client.query<{
    id: string
    name: string
    duration_days: number
    position: number
    predecessor_id: string | null
  }>(
    `SELECT id, name, duration_days, position, predecessor_id
     FROM template_tasks
     WHERE stage_id = $1
     ORDER BY position`,
    [templateStageId],
  )
  const copied = new Map<string, string>()
  for (const task of tasks.rows) {
    const id = randomUUID()
    copied.set(task.id, id)
    await client.query(
      `INSERT INTO subtasks (
         id, stage_id, name, duration_days, done, position,
         start_date, end_date, predecessor_id, template_task_id
       ) VALUES ($1, $2, $3, $4, false, $5, NULL, NULL, NULL, $6)`,
      [id, projectStageId, task.name, task.duration_days, task.position, task.id],
    )
  }
  for (const task of tasks.rows) {
    if (!task.predecessor_id) continue
    const projectTaskId = copied.get(task.id)
    let predecessorId = copied.get(task.predecessor_id) ?? null
    if (!predecessorId) {
      const found = await client.query<{ id: string }>(
        `SELECT task.id
         FROM subtasks AS task
         JOIN project_stages AS stage ON stage.id = task.stage_id
         WHERE stage.project_id = $1 AND task.template_task_id = $2
         LIMIT 1`,
        [projectId, task.predecessor_id],
      )
      predecessorId = found.rows[0]?.id ?? null
    }
    if (projectTaskId && predecessorId) {
      await client.query('UPDATE subtasks SET predecessor_id = $1 WHERE id = $2', [predecessorId, projectTaskId])
    }
  }
}

export async function loadTemplate(db: Db, id: string): Promise<TemplateRecord | null> {
  const result = await db.query<{ id: string; name: string; archived: boolean }>(
    'SELECT id, name, archived FROM templates WHERE id = $1',
    [id],
  )
  const template = result.rows[0]
  if (!template) return null
  const stages = await db.query<{ id: string; name: string; position: number }>(
    `SELECT id, name, position
     FROM template_stages
     WHERE template_id = $1
     ORDER BY position`,
    [id],
  )
  const tasks = await db.query<{
    id: string
    stage_id: string
    name: string
    duration_days: number
    position: number
    predecessor_id: string | null
  }>(
    `SELECT task.id, task.stage_id, task.name, task.duration_days, task.position, task.predecessor_id
     FROM template_tasks AS task
     JOIN template_stages AS stage ON stage.id = task.stage_id
     WHERE stage.template_id = $1
     ORDER BY task.position, task.id`,
    [id],
  )
  return {
    id: template.id,
    name: template.name,
    archived: template.archived,
    stages: stages.rows.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
      tasks: tasks.rows
        .filter((task) => task.stage_id === stage.id)
        .map((task) => ({
          id: task.id,
          name: task.name,
          durationDays: Number(task.duration_days),
          position: task.position,
          predecessorId: task.predecessor_id,
        })),
    })),
  }
}

export async function createTemplate(
  client: PoolClient,
  input: { name: string; stages: TemplateStageDraft[] },
): Promise<TemplateRecord> {
  const id = randomUUID()
  const resolved = resolveTemplateStages(input.stages, new Map())
  await assertTemplateTaskOwnership(client, id, resolved)
  await client.query('INSERT INTO templates (id, name) VALUES ($1, $2)', [id, input.name])
  for (let index = 0; index < resolved.length; index += 1) {
    const stage = resolved[index]
    await client.query(
      `INSERT INTO template_stages (id, template_id, name, position)
       VALUES ($1, $2, $3, $4)`,
      [stage.id, id, stage.name, index + 1],
    )
  }
  await writeTemplateTasks(client, resolved)
  const template = await loadTemplate(client, id)
  if (!template) throw new Error('Template não foi gravado.')
  return template
}

export async function saveTemplate(
  client: PoolClient,
  templateId: string,
  input: { name: string; stages: TemplateStageDraft[] },
): Promise<TemplateRecord> {
  const current = await loadTemplate(client, templateId)
  if (!current) throw notFound('Template não encontrado.')
  const seen = new Set<string>()
  for (const stage of input.stages) {
    if (!stage.id) continue
    if (seen.has(stage.id)) throw badRequest('Etapa repetida no template.')
    seen.add(stage.id)
  }
  const existingIds = new Set(current.stages.map((stage) => stage.id))
  for (const id of seen) {
    if (!existingIds.has(id)) throw badRequest('Uma das etapas não pertence a este template.')
  }
  const removedIds = current.stages.map((stage) => stage.id).filter((id) => !seen.has(id))
  const resolved = resolveTemplateStages(
    input.stages,
    new Map(current.stages.map((stage) => [stage.id, stage.tasks])),
  )
  await assertTemplateTaskOwnership(client, templateId, resolved)
  const newTemplateStageIds = new Set(
    resolved.filter((stage) => !existingIds.has(stage.id)).map((stage) => stage.id),
  )

  await client.query('UPDATE templates SET name = $1 WHERE id = $2', [input.name, templateId])
  await client.query(
    'UPDATE template_stages SET position = position + 100000 WHERE template_id = $1',
    [templateId],
  )
  await client.query(
    `UPDATE project_stages
     SET position = position + 100000
     WHERE project_id IN (SELECT id FROM projects WHERE template_id = $1)`,
    [templateId],
  )
  if (removedIds.length > 0) {
    await client.query('DELETE FROM template_stages WHERE id = ANY($1::uuid[])', [removedIds])
  }

  for (let index = 0; index < resolved.length; index += 1) {
    const stage = resolved[index]
    const position = index + 1
    if (existingIds.has(stage.id)) {
      await client.query(
        'UPDATE template_stages SET name = $1, position = $2 WHERE id = $3 AND template_id = $4',
        [stage.name, position, stage.id, templateId],
      )
    } else {
      await client.query(
        `INSERT INTO template_stages (id, template_id, name, position)
         VALUES ($1, $2, $3, $4)`,
        [stage.id, templateId, stage.name, position],
      )
    }
  }

  await writeTemplateTasks(client, resolved)

  await client.query(
    `UPDATE project_stages AS stage
     SET name = template_stage.name, position = template_stage.position
     FROM template_stages AS template_stage
     WHERE stage.template_stage_id = template_stage.id
       AND template_stage.template_id = $1`,
    [templateId],
  )

  const projects = await client.query<{ id: string }>(
    'SELECT id FROM projects WHERE template_id = $1',
    [templateId],
  )
  const templateStages = await client.query<{ id: string; name: string; position: number }>(
    'SELECT id, name, position FROM template_stages WHERE template_id = $1 ORDER BY position',
    [templateId],
  )
  for (const project of projects.rows) {
    const linked = await client.query<{ template_stage_id: string }>(
      `SELECT template_stage_id
       FROM project_stages
       WHERE project_id = $1 AND template_stage_id IS NOT NULL`,
      [project.id],
    )
    const linkedIds = new Set(linked.rows.map((row) => row.template_stage_id))
    for (const stage of templateStages.rows) {
      if (linkedIds.has(stage.id)) continue
      const projectStageId = randomUUID()
      await client.query(
        `INSERT INTO project_stages (id, project_id, template_stage_id, name, position, activated_at)
         VALUES ($1, $2, $3, $4, $5, NULL)`,
        [projectStageId, project.id, stage.id, stage.name, stage.position],
      )
      await copyTemplateTasks(client, project.id, stage.id, projectStageId)
    }
    const unlinked = await client.query<{ id: string }>(
      `SELECT id FROM project_stages
       WHERE project_id = $1 AND template_stage_id IS NULL
       ORDER BY position`,
      [project.id],
    )
    for (let index = 0; index < unlinked.rows.length; index += 1) {
      await client.query('UPDATE project_stages SET position = $1 WHERE id = $2', [
        templateStages.rows.length + index + 1,
        unlinked.rows[index].id,
      ])
    }
    await activateNewFirstIfDormant(client, project.id, newTemplateStageIds)
  }

  const template = await loadTemplate(client, templateId)
  if (!template) throw new Error('Template não foi gravado.')
  return template
}

async function activateNewFirstIfDormant(
  client: PoolClient,
  projectId: string,
  newTemplateStageIds: ReadonlySet<string>,
): Promise<void> {
  if (newTemplateStageIds.size === 0) return
  const first = await client.query<{ id: string; template_stage_id: string | null; start_date: string }>(
    `SELECT stage.id, stage.template_stage_id, project.start_date
     FROM project_stages AS stage
     JOIN projects AS project ON project.id = stage.project_id
     WHERE stage.project_id = $1 AND stage.position = 1`,
    [projectId],
  )
  const stage = first.rows[0]
  if (!stage?.template_stage_id || !newTemplateStageIds.has(stage.template_stage_id)) return
  const active = await client.query(
    'SELECT 1 FROM project_stages WHERE project_id = $1 AND activated_at IS NOT NULL LIMIT 1',
    [projectId],
  )
  if (active.rowCount) return
  await client.query('UPDATE project_stages SET activated_at = $1 WHERE id = $2', [stage.start_date, stage.id])
}

export async function createProject(
  client: PoolClient,
  input: { name: string; startDate: string; templateId: string },
): Promise<ProjectDetail> {
  const template = await client.query<{ id: string; archived: boolean }>(
    'SELECT id, archived FROM templates WHERE id = $1',
    [input.templateId],
  )
  const found = template.rows[0]
  if (!found || found.archived) throw badRequest('Escolha um template ativo.')
  const stages = await client.query<{ id: string; name: string; position: number }>(
    `SELECT id, name, position
     FROM template_stages
     WHERE template_id = $1
     ORDER BY position`,
    [input.templateId],
  )
  if (stages.rows.length === 0) throw badRequest('O template precisa de ao menos uma etapa.')
  const projectId = randomUUID()
  await client.query(
    'INSERT INTO projects (id, name, template_id, start_date) VALUES ($1, $2, $3, $4)',
    [projectId, input.name, input.templateId, input.startDate],
  )
  for (const stage of stages.rows) {
    const projectStageId = randomUUID()
    await client.query(
      `INSERT INTO project_stages (id, project_id, template_stage_id, name, position, activated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        projectStageId,
        projectId,
        stage.id,
        stage.name,
        stage.position,
        stage.position === 1 ? input.startDate : null,
      ],
    )
    await copyTemplateTasks(client, projectId, stage.id, projectStageId)
  }
  return requireProject(client, projectId)
}

export async function updateProject(
  client: PoolClient,
  projectId: string,
  input: { name?: string; startDate?: string },
): Promise<ProjectDetail> {
  const current = await requireProject(client, projectId)
  if (current.archived) throw conflict('Projeto arquivado não pode ser editado.')
  if (input.name !== undefined) {
    await client.query('UPDATE projects SET name = $1 WHERE id = $2', [input.name, projectId])
  }
  if (input.startDate !== undefined) {
    await client.query('UPDATE projects SET start_date = $1 WHERE id = $2', [input.startDate, projectId])
    await client.query(
      'UPDATE project_stages SET activated_at = $1 WHERE project_id = $2 AND position = 1',
      [input.startDate, projectId],
    )
    await rescheduleProject(client, projectId)
  }
  return requireProject(client, projectId)
}

export async function listUsers(db: Db): Promise<PublicUser[]> {
  const result = await db.query<PublicUser>(
    'SELECT id, name, email, role, active FROM users WHERE deleted_at IS NULL ORDER BY name',
  )
  return result.rows
}

export async function deleteUser(db: Db, userId: string): Promise<void> {
  const found = await db.query<{ role: Role; active: boolean }>(
    'SELECT role, active FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  )
  const current = found.rows[0]
  if (!current) throw notFound('Usuário não encontrado.')
  if (current.role === 'admin' && current.active) {
    const others = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE role = 'admin' AND active AND deleted_at IS NULL AND id <> $1`,
      [userId],
    )
    if (others.rows[0].n === 0) throw conflict('Não é possível excluir o único administrador ativo.')
  }
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  await db.query(
    'UPDATE users SET active = false, deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  )
}

export async function listArchivedProjects(db: Db): Promise<{ id: string; name: string; startDate: string }[]> {
  const result = await db.query<{ id: string; name: string; start_date: string }>(
    'SELECT id, name, start_date FROM projects WHERE archived = true ORDER BY name, id',
  )
  return result.rows.map((project) => ({
    id: project.id,
    name: project.name,
    startDate: project.start_date,
  }))
}

export async function deleteArchivedProject(client: PoolClient, projectId: string): Promise<void> {
  const found = await client.query<{ archived: boolean }>(
    'SELECT archived FROM projects WHERE id = $1',
    [projectId],
  )
  const project = found.rows[0]
  if (!project) throw notFound('Projeto não encontrado.')
  if (!project.archived) throw conflict('Arquive o projeto antes de excluí-lo.')
  await client.query('DELETE FROM projects WHERE id = $1', [projectId])
}

export async function archiveProject(client: PoolClient, projectId: string): Promise<void> {
  const updated = await client.query(
    'UPDATE projects SET archived = true WHERE id = $1 AND archived = false',
    [projectId],
  )
  if (!updated.rowCount) {
    const exists = await client.query('SELECT 1 FROM projects WHERE id = $1', [projectId])
    if (!exists.rowCount) throw notFound('Projeto não encontrado.')
  }
}

export async function activateStage(
  client: PoolClient,
  projectId: string,
  stageId: string,
  today: string,
): Promise<ProjectDetail> {
  const project = await requireProject(client, projectId)
  if (project.archived) throw conflict('Projeto arquivado não pode ser editado.')
  const stage = project.stages.find((item) => item.id === stageId)
  if (!stage) throw notFound('Etapa não encontrada.')
  if (stage.activatedAt) throw conflict('Esta etapa já está ativada.')
  await client.query('UPDATE project_stages SET activated_at = $1 WHERE id = $2', [today, stageId])
  await rescheduleProject(client, projectId, stageId)
  return requireProject(client, projectId)
}

async function assertActiveOperator(client: PoolClient, userId: string): Promise<void> {
  const user = await client.query<{ role: Role; active: boolean; deleted_at: Date | null }>(
    'SELECT role, active, deleted_at FROM users WHERE id = $1',
    [userId],
  )
  const person = user.rows[0]
  if (!person || person.deleted_at || person.role !== 'operator' || !person.active) {
    throw badRequest('Escolha um operador ativo.')
  }
}

async function releaseOperator(client: PoolClient, stageId: string, userId: string): Promise<void> {
  const still = await client.query(
    'SELECT 1 FROM subtasks WHERE stage_id = $1 AND assignee_id = $2 LIMIT 1',
    [stageId, userId],
  )
  if (still.rowCount) return
  await client.query('DELETE FROM completions WHERE stage_id = $1 AND user_id = $2', [stageId, userId])
}

export async function setCompletion(
  client: PoolClient,
  projectId: string,
  stageId: string,
  userId: string,
  completed: boolean,
  today: string,
): Promise<ProjectDetail> {
  const project = await requireProject(client, projectId)
  if (project.archived) throw notFound('Projeto não encontrado.')
  const stage = project.stages.find((item) => item.id === stageId)
  if (!stage) throw notFound('Etapa não encontrada.')
  const allocated = stage.operators.some((operator) => operator.id === userId)
  if (!allocated) throw notFound('Etapa não encontrada.')
  if (!stage.activatedAt) throw conflict('Esta etapa ainda não foi ativada.')
  if (completed) {
    await client.query(
      `INSERT INTO completions (stage_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [stageId, userId],
    )
    await sweep(client, projectId, today)
  } else {
    await client.query('DELETE FROM completions WHERE stage_id = $1 AND user_id = $2', [stageId, userId])
  }
  return requireProject(client, projectId)
}

async function writeSubtaskOrder(client: PoolClient, stageId: string, ids: string[]): Promise<void> {
  await client.query('UPDATE subtasks SET position = position + 100000 WHERE stage_id = $1', [stageId])
  for (let index = 0; index < ids.length; index += 1) {
    const updated = await client.query(
      'UPDATE subtasks SET position = $1 WHERE id = $2 AND stage_id = $3',
      [index + 1, ids[index], stageId],
    )
    if (!updated.rowCount) throw badRequest('Uma das tarefas não pertence a esta etapa.')
  }
}

export async function createSubtask(
  client: PoolClient,
  projectId: string,
  stageId: string,
  input: { name: string; durationDays?: number },
): Promise<ProjectDetail> {
  const project = await requireOpenStage(client, projectId, stageId)
  const stage = project.stages.find((item) => item.id === stageId)
  if (!stage) throw notFound('Etapa não encontrada.')
  const duration = input.durationDays ?? 0
  const anchor = stageAnchor(stage.activatedAt, project.startDate)
  const calendar = await loadCalendar(client)
  const max = await client.query<{ n: number }>(
    'SELECT COALESCE(MAX(position), 0)::int AS n FROM subtasks WHERE stage_id = $1',
    [stageId],
  )
  await client.query(
    `INSERT INTO subtasks (id, stage_id, name, duration_days, done, position, start_date, end_date)
     VALUES ($1, $2, $3, $4, false, $5, $6, $7)`,
    [randomUUID(), stageId, input.name, duration, max.rows[0].n + 1, anchor, addWorkingDays(anchor, duration, calendar)],
  )
  await rescheduleProject(client, projectId, stageId)
  return requireProject(client, projectId)
}

async function predecessorScope(
  client: PoolClient,
  projectId: string,
  stageId: string,
): Promise<{ scope: PredecessorScope; predecessorOf: Map<string, string | null> }> {
  const stages = await client.query<{ id: string; position: number }>(
    'SELECT id, position FROM project_stages WHERE project_id = $1 ORDER BY position',
    [projectId],
  )
  const current = stages.rows.find((stage) => stage.id === stageId)
  if (!current) throw notFound('Etapa não encontrada.')
  const tasks = await client.query<{ id: string; stage_id: string; predecessor_id: string | null }>(
    `SELECT task.id, task.stage_id, task.predecessor_id
     FROM subtasks AS task
     JOIN project_stages AS stage ON stage.id = task.stage_id
     WHERE stage.project_id = $1`,
    [projectId],
  )
  const idsIn = (stageIds: ReadonlySet<string>) => new Set(
    tasks.rows.filter((task) => stageIds.has(task.stage_id)).map((task) => task.id),
  )
  const idsAt = (matches: (position: number) => boolean) => idsIn(new Set(
    stages.rows.filter((stage) => matches(stage.position)).map((stage) => stage.id),
  ))
  return {
    scope: {
      sameStageIds: idsAt((position) => position === current.position),
      previousStageIds: idsAt((position) => position === current.position - 1),
      laterStageIds: idsAt((position) => position > current.position),
      earlierStageIds: idsAt((position) => position < current.position - 1),
    },
    predecessorOf: new Map(tasks.rows.map((task) => [task.id, task.predecessor_id])),
  }
}

export async function updateSubtask(
  client: PoolClient,
  projectId: string,
  stageId: string,
  subtaskId: string,
  patch: {
    name?: string
    durationDays?: number
    done?: boolean
    startDate?: string | null
    predecessorId?: string | null
    allocation?: { userId: string; startDate: string; durationDays: number }
  },
  actor: { id: string; role: Role },
  today: string,
): Promise<ProjectDetail> {
  const project = await requireOpenStage(client, projectId, stageId)
  const stage = project.stages.find((item) => item.id === stageId)
  const subtask = stage?.subtasks.find((item) => item.id === subtaskId)
  if (!stage || !subtask) throw notFound('Tarefa não encontrada.')
  if (actor.role !== 'admin') {
    if (
      patch.name !== undefined
      || patch.durationDays !== undefined
      || patch.allocation !== undefined
      || patch.startDate !== undefined
      || patch.predecessorId !== undefined
    ) {
      throw forbidden('O operador só pode marcar a tarefa como feita.')
    }
    if (subtask.assignee?.id !== actor.id) throw notFound('Tarefa não encontrada.')
  }
  const stored = await client.query<{
    name: string
    duration_days: number
    done: boolean
    assignee_id: string | null
    allocation_start: string | null
    allocation_days: number | null
    predecessor_id: string | null
    manual_start_date: string | null
    start_date: string | null
  }>(
    `SELECT name, duration_days, done, assignee_id, allocation_start, allocation_days,
            predecessor_id, manual_start_date, start_date
     FROM subtasks
     WHERE id = $1 AND stage_id = $2
     FOR UPDATE`,
    [subtaskId, stageId],
  )
  const current = stored.rows[0]
  if (!current) throw notFound('Tarefa não encontrada.')
  if (patch.predecessorId) {
    const { scope, predecessorOf } = await predecessorScope(client, projectId, stageId)
    const violation = predecessorViolation(subtaskId, patch.predecessorId, scope, predecessorOf)
    if (violation) throw badRequest(violation)
  }
  const nextPredecessor = patch.predecessorId !== undefined ? patch.predecessorId : current.predecessor_id
  const clearingPredecessor = current.predecessor_id !== null && nextPredecessor === null
  let manualStart = current.manual_start_date
  if (nextPredecessor === null) {
    if (patch.startDate !== undefined) manualStart = patch.startDate
    else if (clearingPredecessor) manualStart = current.start_date
  }
  const previousAssignee = current.assignee_id
  let nextDuration = patch.durationDays ?? Number(current.duration_days)
  let assigneeId = current.assignee_id
  let allocationStart = current.allocation_start
  let allocationDays = current.allocation_days === null ? null : Number(current.allocation_days)
  if (patch.allocation) {
    await assertActiveOperator(client, patch.allocation.userId)
    assigneeId = patch.allocation.userId
    allocationStart = patch.allocation.startDate
    allocationDays = patch.allocation.durationDays
    if (nextDuration <= 0) nextDuration = patch.allocation.durationDays
  } else if (clearingPredecessor && assigneeId && manualStart) {
    allocationStart = manualStart
  }
  await client.query(
    `UPDATE subtasks
     SET name = $1, duration_days = $2, done = $3,
         assignee_id = $4, allocation_start = $5, allocation_days = $6,
         predecessor_id = $7, manual_start_date = $8
     WHERE id = $9 AND stage_id = $10`,
    [
      patch.name ?? current.name,
      nextDuration,
      patch.done ?? current.done,
      assigneeId,
      allocationStart,
      allocationDays,
      nextPredecessor,
      manualStart,
      subtaskId,
      stageId,
    ],
  )
  if (previousAssignee && previousAssignee !== assigneeId) {
    await releaseOperator(client, stageId, previousAssignee)
  }
  if (patch.done !== undefined || previousAssignee !== assigneeId) {
    await sweep(client, projectId, today)
  }
  await rescheduleProject(client, projectId, stageId)
  return requireProject(client, projectId)
}

export async function deleteSubtask(
  client: PoolClient,
  projectId: string,
  stageId: string,
  subtaskId: string,
  today: string,
): Promise<ProjectDetail> {
  const project = await requireOpenStage(client, projectId, stageId)
  const task = project.stages.find((stage) => stage.id === stageId)?.subtasks.find((item) => item.id === subtaskId)
  if (!task) throw notFound('Tarefa não encontrada.')
  await client.query('DELETE FROM subtasks WHERE id = $1 AND stage_id = $2', [subtaskId, stageId])
  if (task.assignee) {
    await releaseOperator(client, stageId, task.assignee.id)
    await sweep(client, projectId, today)
  }
  const remaining = await client.query<{ id: string }>(
    'SELECT id FROM subtasks WHERE stage_id = $1 ORDER BY position',
    [stageId],
  )
  await writeSubtaskOrder(client, stageId, remaining.rows.map((row) => row.id))
  await rescheduleProject(client, projectId, stageId)
  return requireProject(client, projectId)
}

export async function reorderSubtasks(
  client: PoolClient,
  projectId: string,
  stageId: string,
  ids: string[],
): Promise<ProjectDetail> {
  const project = await requireOpenStage(client, projectId, stageId)
  const stage = project.stages.find((item) => item.id === stageId)
  const current = stage?.subtasks.map((subtask) => subtask.id) ?? []
  const same =
    current.length === ids.length && current.every((id) => ids.includes(id)) && new Set(ids).size === ids.length
  if (!same) throw badRequest('A ordem precisa incluir todas as tarefas da etapa.')
  await writeSubtaskOrder(client, stageId, ids)
  return requireProject(client, projectId)
}

export async function assertLastAdminSurvives(
  db: Db,
  targetId: string,
  next: { role: Role; active: boolean },
): Promise<void> {
  const current = await db.query<{ role: Role; active: boolean }>(
    'SELECT role, active FROM users WHERE id = $1',
    [targetId],
  )
  const user = current.rows[0]
  if (!user) throw notFound('Usuário não encontrado.')
  const wasActiveAdmin = user.role === 'admin' && user.active
  const staysActiveAdmin = next.role === 'admin' && next.active
  if (!wasActiveAdmin || staysActiveAdmin) return
  const others = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active AND deleted_at IS NULL AND id <> $1`,
    [targetId],
  )
  if (others.rows[0].n === 0) {
    throw conflict('Não é possível desativar ou rebaixar o único administrador ativo.')
  }
}
