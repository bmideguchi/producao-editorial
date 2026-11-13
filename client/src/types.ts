export type Role = 'admin' | 'operator'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
}

export type StageColor = 'gray' | 'blue' | 'yellow' | 'green'

export type OverallStatus = 'Concluído' | 'Em andamento'

export type StageListItem = {
  id: string
  name: string
  position: number
  color: StageColor
  unassigned: boolean
}

export type ArchivedProject = {
  id: string
  name: string
  startDate: string
}

export type ProjectListItem = {
  id: string
  name: string
  startDate: string
  stages: StageListItem[]
  subtasksDone: number
  subtasksTotal: number
  statusPercent: number
  overall: OverallStatus
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
  kind: 'user' | 'supplier'
  name: string
  active: boolean
  deleted: boolean
  startDate: string
  durationDays: number
}

export type Subtask = {
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
  subtasks: Subtask[]
}

export type ClientRecord = {
  id: string
  name: string
}

export type SupplierRecord = {
  id: string
  name: string
}

export type ProjectDetail = {
  id: string
  name: string
  templateId: string | null
  templateName: string | null
  startDate: string
  archived: boolean
  description: string
  clientId: string | null
  clientName: string
  supplierId: string | null
  supplierName: string
  subtasksDone: number
  subtasksTotal: number
  stages: StageDetail[]
  scope: ScopeLine[]
}

export type ScopeLine = {
  serviceId: string
  serviceName: string
  allocationDays: number
  quantity: number
}

export type ServiceRecord = {
  id: string
  name: string
  allocationDays: number
}

export type TemplateTask = {
  id: string
  name: string
  durationDays: number
  position: number
  predecessorId: string | null
}

export type TemplateStage = {
  id: string
  name: string
  position: number
  tasks: TemplateTask[]
}

export type Template = {
  id: string
  name: string
  archived: boolean
  stages: TemplateStage[]
}

export type TemplateStageInput = {
  id?: string
  name: string
  tasks?: {
    id?: string
    name: string
    durationDays: number
    predecessorId?: string | null
  }[]
}

export type WorkCalendar = {
  closedWeekdays: number[]
  holidays: string[]
}

export type AllocationEntry = {
  project: string
  task: string
}

export type AllocationReport = {
  month: string
  days: string[]
  closed: boolean[]
  people: {
    id: string
    name: string
    counts: number[]
    tasks: AllocationEntry[][]
  }[]
}
