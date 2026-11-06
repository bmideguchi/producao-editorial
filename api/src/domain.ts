export type StageColor = 'gray' | 'blue' | 'yellow' | 'green'

export type StageAppearance = {
  color: StageColor
  unassigned: boolean
}

export function stageAppearance(input: {
  activated: boolean
  operatorIds: readonly string[]
  completedOperatorIds: readonly string[]
}): StageAppearance {
  if (!input.activated) return { color: 'gray', unassigned: false }
  const operators = new Set(input.operatorIds)
  if (operators.size === 0) return { color: 'gray', unassigned: true }
  const completed = input.completedOperatorIds.filter((id) => operators.has(id)).length
  if (completed === 0) return { color: 'blue', unassigned: false }
  if (completed < operators.size) return { color: 'yellow', unassigned: false }
  return { color: 'green', unassigned: false }
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export type WorkCalendar = {
  /** 0 = domingo … 6 = sábado. */
  closedWeekdays: readonly number[]
  holidays: readonly string[]
}

/** Sábado e domingo, sem feriados. Vale quando ainda não há calendário gravado. */
export const DEFAULT_WORK_CALENDAR: WorkCalendar = {
  closedWeekdays: [0, 6],
  holidays: [],
}

export function isWorkingDay(isoDate: string, calendar: WorkCalendar = DEFAULT_WORK_CALENDAR): boolean {
  const [year, month, day] = isoDate.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  if (calendar.closedWeekdays.includes(weekday)) return false
  return !calendar.holidays.includes(isoDate)
}

/** Próximo dia útil estritamente depois de `isoDate`. */
export function nextWorkingDay(isoDate: string, calendar: WorkCalendar = DEFAULT_WORK_CALENDAR): string {
  const closedWeekdays = new Set(calendar.closedWeekdays)
  if (closedWeekdays.size >= 7) return addDays(isoDate, 1)
  let cursor = isoDate
  let steps = 0
  const limit = 14 + calendar.holidays.length
  do {
    cursor = addDays(cursor, 1)
    steps += 1
    if (steps > limit) return addDays(isoDate, 1)
  } while (!isWorkingDay(cursor, calendar))
  return cursor
}

/**
 * O início conta como dia 1 quando é útil. Duração 1 termina no próprio início.
 * Se o início não é útil, o primeiro dia contado é o próximo dia útil.
 * Duração 0 devolve o próprio início.
 */
export function addWorkingDays(isoDate: string, days: number, calendar: WorkCalendar = DEFAULT_WORK_CALENDAR): string {
  if (days <= 0) return isoDate
  const closedWeekdays = new Set(calendar.closedWeekdays)
  if (closedWeekdays.size >= 7) return addDays(isoDate, days - 1)
  let cursor = isWorkingDay(isoDate, calendar) ? isoDate : nextWorkingDay(isoDate, calendar)
  let remaining = days - 1
  let steps = 0
  const limit = days * 14 + calendar.holidays.length + 7
  while (remaining > 0) {
    cursor = addDays(cursor, 1)
    steps += 1
    if (steps > limit) return addDays(isoDate, days - 1)
    if (isWorkingDay(cursor, calendar)) remaining -= 1
  }
  return cursor
}

/** Dias úteis de `start` até `end`, inclusive os dois extremos. */
export function workingDaysBetween(start: string, end: string, calendar: WorkCalendar = DEFAULT_WORK_CALENDAR): number {
  if (!start || !end || end < start) return 0
  let count = 0
  let cursor = start
  let guard = 0
  while (guard < 3660) {
    if (isWorkingDay(cursor, calendar)) count += 1
    if (cursor >= end) break
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return count
}

export type ForecastStage = {
  id: string
  position: number
  durationDays: number
  activatedAt: string | null
}

export type StageForecast = {
  id: string
  forecastStart: string
  forecastEnd: string
}

export function forecastStages(
  projectStart: string,
  stages: readonly ForecastStage[],
  calendar: WorkCalendar = DEFAULT_WORK_CALENDAR,
): StageForecast[] {
  const ordered = [...stages].sort((a, b) => a.position - b.position)
  const result: StageForecast[] = []
  for (let index = 0; index < ordered.length; index += 1) {
    const stage = ordered[index]
    const start = stage.activatedAt
      ?? (index === 0 ? projectStart : result[index - 1].forecastEnd)
    result.push({
      id: stage.id,
      forecastStart: start,
      forecastEnd: addWorkingDays(start, stage.durationDays, calendar),
    })
  }
  return result
}

export type ActivationStage = {
  id: string
  position: number
  activatedAt: string | null
  color: StageColor
}

/** Ativa a etapa imediatamente seguinte a cada etapa verde que ainda esteja aguardando. */
export function stagesToActivate(stages: readonly ActivationStage[]): string[] {
  const ordered = [...stages].sort((a, b) => a.position - b.position)
  const ids: string[] = []
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const next = ordered[index + 1]
    if (ordered[index].color === 'green' && next.activatedAt === null) ids.push(next.id)
  }
  return ids
}

export function saoPauloToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function daysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  const from = Date.UTC(startYear, startMonth - 1, startDay)
  const to = Date.UTC(endYear, endMonth - 1, endDay)
  return Math.round((to - from) / 86_400_000)
}

/** Intervalo útil do início mais cedo ao fim mais tarde. Tarefas paralelas não se somam. Sem data, zero. */
export function stageDurationDays(
  tasks: readonly { startDate: string | null; endDate: string | null }[],
  calendar: WorkCalendar = DEFAULT_WORK_CALENDAR,
): number {
  const dated = tasks.filter((task): task is { startDate: string; endDate: string } => Boolean(task.startDate && task.endDate))
  if (dated.length === 0) return 0
  const earliest = dated.reduce((min, task) => (task.startDate < min ? task.startDate : min), dated[0].startDate)
  const latest = dated.reduce((max, task) => (task.endDate > max ? task.endDate : max), dated[0].endDate)
  return workingDaysBetween(earliest, latest, calendar)
}

export type OverallStatus = 'Concluído' | 'Em andamento'

export function overallStatus(colors: readonly StageColor[]): OverallStatus {
  if (colors.length > 0 && colors.every((color) => color === 'green')) return 'Concluído'
  return 'Em andamento'
}

export function statusPercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((done * 100) / total)
}

export type ScheduleTask = {
  id: string
  durationDays: number
  predecessorId: string | null
  /** Início informado. Ignorado quando a tarefa tem predecessora. Vazio usa a âncora da etapa. */
  manualStart: string | null
}

export type ScheduledDates = {
  startDate: string
  endDate: string
}

export function stageAnchor(activatedAt: string | null, projectStart: string): string {
  return activatedAt ?? projectStart
}

const SELF_PREDECESSOR = 'A tarefa não pode ser predecessora de si mesma.'
const LATER_PREDECESSOR = 'A predecessora não pode ser de uma etapa posterior.'
const EARLIER_PREDECESSOR = 'A predecessora não pode ser de uma etapa anterior à imediatamente anterior.'
const FOREIGN_PREDECESSOR = 'A predecessora precisa ser uma tarefa deste projeto.'
const CYCLE_PREDECESSOR = 'Essa predecessora fecharia um ciclo.'

export type PredecessorScope = {
  sameStageIds: ReadonlySet<string>
  previousStageIds: ReadonlySet<string>
  laterStageIds: ReadonlySet<string>
  earlierStageIds: ReadonlySet<string>
}

/** Recusa auto-vínculo, etapa posterior, etapa anterior à imediatamente anterior, outro projeto e ciclo. */
export function predecessorViolation(
  taskId: string,
  predecessorId: string,
  scope: PredecessorScope,
  predecessorOf: ReadonlyMap<string, string | null>,
): string | null {
  if (predecessorId === taskId) return SELF_PREDECESSOR
  if (scope.laterStageIds.has(predecessorId)) return LATER_PREDECESSOR
  if (scope.earlierStageIds.has(predecessorId)) return EARLIER_PREDECESSOR
  const allowed = scope.sameStageIds.has(predecessorId) || scope.previousStageIds.has(predecessorId)
  if (!allowed) return FOREIGN_PREDECESSOR
  const next = new Map(predecessorOf)
  next.set(taskId, predecessorId)
  const seen = new Set<string>()
  let cursor: string | null = predecessorId
  while (cursor) {
    if (cursor === taskId || seen.has(cursor)) return CYCLE_PREDECESSOR
    seen.add(cursor)
    cursor = next.get(cursor) ?? null
  }
  return null
}

/**
 * Início e fim em dias úteis. Predecessora término-início começa no dia útil seguinte ao fim.
 * `externalEnds` traz o fim de predecessoras fora desta lista, em geral da etapa anterior.
 */
export function scheduleTasks(
  anchor: string,
  tasks: readonly ScheduleTask[],
  externalEnds: ReadonlyMap<string, string> = new Map(),
  calendar: WorkCalendar = DEFAULT_WORK_CALENDAR,
): Map<string, ScheduledDates> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const result = new Map<string, ScheduledDates>()
  const visiting = new Set<string>()

  function visit(id: string): ScheduledDates {
    const cached = result.get(id)
    if (cached) return cached
    if (visiting.has(id)) throw new Error(CYCLE_PREDECESSOR)
    visiting.add(id)
    const task = byId.get(id)
    if (!task) throw new Error(FOREIGN_PREDECESSOR)
    let startDate: string
    if (task.predecessorId) {
      if (byId.has(task.predecessorId)) {
        startDate = nextWorkingDay(visit(task.predecessorId).endDate, calendar)
      } else {
        const externalEnd = externalEnds.get(task.predecessorId)
        if (!externalEnd) throw new Error(FOREIGN_PREDECESSOR)
        startDate = nextWorkingDay(externalEnd, calendar)
      }
    } else {
      startDate = task.manualStart ?? anchor
    }
    const scheduled = { startDate, endDate: addWorkingDays(startDate, task.durationDays, calendar) }
    visiting.delete(id)
    result.set(id, scheduled)
    return scheduled
  }

  for (const task of tasks) visit(task.id)
  return result
}
