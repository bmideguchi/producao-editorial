import type { Pool, PoolClient } from 'pg'
import { loadCalendar, removedUserName } from './data.js'
import { addDays, isWorkingDay } from './domain.js'
import { badRequest } from './http.js'

type Db = Pool | PoolClient

export type AllocationEntry = {
  project: string
  task: string
}

export type AllocationReport = {
  month: string
  days: string[]
  /** Fim de semana ou feriado, na mesma ordem de `days`. */
  closed: boolean[]
  people: {
    id: string
    name: string
    counts: number[]
    tasks: AllocationEntry[][]
  }[]
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

function daysOfMonth(month: string): { start: string; end: string; days: string[] } {
  if (!MONTH.test(month)) throw badRequest('Informe o mês no formato AAAA-MM.')
  const start = `${month}-01`
  const days: string[] = []
  let cursor = start
  while (cursor.startsWith(month)) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return { start, end: cursor, days }
}

/** Cada dia de [início, fim], inclusive fim de semana e feriado. */
function addSpan(
  tasks: AllocationEntry[][],
  days: readonly string[],
  start: string,
  end: string,
  entry: AllocationEntry,
): void {
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index]
    if (day < start || day > end) continue
    tasks[index].push(entry)
  }
}

export async function allocationReport(db: Db, month: string): Promise<AllocationReport> {
  const { start, end, days } = daysOfMonth(month)
  const calendar = await loadCalendar(db)
  const spans = await db.query<{
    user_id: string
    start_date: string
    end_date: string
    project_name: string
    task_name: string
  }>(
    `SELECT task.assignee_id AS user_id, task.start_date, task.end_date,
            project.name AS project_name, task.name AS task_name
     FROM subtasks AS task
     JOIN project_stages AS stage ON stage.id = task.stage_id
     JOIN projects AS project ON project.id = stage.project_id
     WHERE task.assignee_id IS NOT NULL
       AND project.archived = false
       AND task.start_date < $2::date
       AND task.end_date >= $1::date`,
    [start, end],
  )
  const totals = new Map<string, AllocationEntry[][]>()
  for (const span of spans.rows) {
    let tasks = totals.get(span.user_id)
    if (!tasks) {
      tasks = days.map(() => [])
      totals.set(span.user_id, tasks)
    }
    addSpan(tasks, days, span.start_date, span.end_date, {
      project: span.project_name,
      task: span.task_name,
    })
  }
  for (const tasks of totals.values()) {
    for (const day of tasks) {
      day.sort((left, right) => left.project.localeCompare(right.project, 'pt-BR') || left.task.localeCompare(right.task, 'pt-BR'))
    }
  }
  const users = await db.query<{ id: string; name: string; role: string; active: boolean; deleted: boolean }>(
    `SELECT id, name, role, active, deleted_at IS NOT NULL AS deleted FROM users ORDER BY name, id`,
  )
  const people = users.rows
    .filter((user) => {
      const overlaps = totals.get(user.id)?.some((day) => day.length > 0) ?? false
      if (user.deleted) return overlaps
      if (user.role === 'operator' && user.active) return true
      return !user.active && overlaps
    })
    .map((user) => {
      const tasks = totals.get(user.id) ?? days.map(() => [])
      return {
        id: user.id,
        name: user.deleted ? removedUserName : user.name,
        counts: tasks.map((day) => day.length),
        tasks,
      }
    })
  return {
    month,
    days,
    closed: days.map((day) => !isWorkingDay(day, calendar)),
    people,
  }
}
