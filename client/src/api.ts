import type { AllocationReport, ArchivedProject, ClientRecord, ProjectDetail, ProjectListItem, ServiceRecord, SessionUser, SupplierRecord, Template, TemplateStageInput, WorkCalendar } from './types'

const TOKEN_KEY = 'producao-editorial-token'

export function apiBase(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8088'
}

export async function readToken(): Promise<string | null> {
  if (typeof localStorage === 'undefined') return memoryToken
  return localStorage.getItem(TOKEN_KEY)
}

export async function writeToken(token: string | null): Promise<void> {
  memoryToken = token
  if (typeof localStorage === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

let memoryToken: string | null = null

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = (await readToken()) ?? memoryToken
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError('Não foi possível falar com a API.')
  }
  if (response.status === 204) return undefined as T
  const payload = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) throw new ApiError(payload?.error ?? 'Não foi possível concluir a ação.')
  return payload as T
}

export const api = {
  async login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
    return request('/api/session', { method: 'POST', body: { email, password } })
  },
  async logout(): Promise<void> {
    await request('/api/session', { method: 'DELETE' })
  },
  async session(): Promise<{ user: SessionUser }> {
    return request('/api/session')
  },
  async users(): Promise<{ users: SessionUser[] }> {
    return request('/api/users')
  },
  async createUser(body: { name: string; email: string; role: SessionUser['role']; password: string }): Promise<{ user: SessionUser }> {
    return request('/api/users', { method: 'POST', body })
  },
  async updateUser(id: string, body: Partial<{ name: string; email: string; role: SessionUser['role']; password: string; active: boolean }>): Promise<{ user: SessionUser }> {
    return request(`/api/users/${id}`, { method: 'PATCH', body })
  },
  async deleteUser(id: string): Promise<void> {
    await request(`/api/users/${id}`, { method: 'DELETE' })
  },
  async templates(): Promise<{ templates: Template[] }> {
    return request('/api/templates')
  },
  async createTemplate(body: { name: string; stages: TemplateStageInput[] }): Promise<{ template: Template }> {
    return request('/api/templates', { method: 'POST', body })
  },
  async updateTemplate(id: string, body: { name: string; stages: TemplateStageInput[] }): Promise<{ template: Template }> {
    return request(`/api/templates/${id}`, { method: 'PUT', body })
  },
  async archiveTemplate(id: string): Promise<{ template: Template }> {
    return request(`/api/templates/${id}/archive`, { method: 'POST' })
  },
  async deleteTemplate(id: string): Promise<void> {
    await request(`/api/templates/${id}`, { method: 'DELETE' })
  },
  async projects(): Promise<{ projects: ProjectListItem[] }> {
    return request('/api/projects')
  },
  async project(id: string): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${id}`)
  },
  async createProject(body: { name: string; startDate: string; templateId: string; scope?: { serviceId: string; quantity: number; allocationDays?: number }[] }): Promise<{ project: ProjectDetail }> {
    return request('/api/projects', { method: 'POST', body })
  },
  async updateProject(id: string, body: {
    name?: string
    startDate?: string
    scope?: { serviceId: string; quantity: number; allocationDays?: number }[]
    description?: string
    clientId?: string | null
    supplierId?: string | null
  }): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${id}`, { method: 'PATCH', body })
  },
  async clients(): Promise<{ clients: ClientRecord[] }> {
    return request('/api/clients')
  },
  async createClient(body: { name: string }): Promise<{ client: ClientRecord }> {
    return request('/api/clients', { method: 'POST', body })
  },
  async updateClient(id: string, body: { name: string }): Promise<{ client: ClientRecord }> {
    return request(`/api/clients/${id}`, { method: 'PATCH', body })
  },
  async deleteClient(id: string): Promise<void> {
    await request(`/api/clients/${id}`, { method: 'DELETE' })
  },
  async suppliers(): Promise<{ suppliers: SupplierRecord[] }> {
    return request('/api/suppliers')
  },
  async createSupplier(body: { name: string }): Promise<{ supplier: SupplierRecord }> {
    return request('/api/suppliers', { method: 'POST', body })
  },
  async updateSupplier(id: string, body: { name: string }): Promise<{ supplier: SupplierRecord }> {
    return request(`/api/suppliers/${id}`, { method: 'PATCH', body })
  },
  async deleteSupplier(id: string): Promise<void> {
    await request(`/api/suppliers/${id}`, { method: 'DELETE' })
  },
  async archiveProject(id: string, password: string): Promise<void> {
    await request(`/api/projects/${id}/archive`, { method: 'POST', body: { password } })
  },
  async archivedProjects(): Promise<{ projects: ArchivedProject[] }> {
    return request('/api/projects/archived')
  },
  async deleteProject(id: string): Promise<void> {
    await request(`/api/projects/${id}`, { method: 'DELETE' })
  },
  async activateStage(projectId: string, stageId: string): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${projectId}/stages/${stageId}/activate`, { method: 'POST' })
  },
  async setCompletion(projectId: string, stageId: string, completed: boolean): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${projectId}/stages/${stageId}/completion`, { method: 'PUT', body: { completed } })
  },
  async createSubtask(projectId: string, stageId: string, body: { name: string; durationDays?: number }): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${projectId}/stages/${stageId}/subtasks`, { method: 'POST', body })
  },
  async updateSubtask(
    projectId: string,
    stageId: string,
    subtaskId: string,
    body: {
      name?: string
      durationDays?: number
      done?: boolean
      startDate?: string | null
      predecessorId?: string | null
      allocation?: { userId?: string; supplierId?: string; startDate: string; durationDays: number }
    },
  ): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${projectId}/stages/${stageId}/subtasks/${subtaskId}`, { method: 'PATCH', body })
  },
  async reorderSubtasks(projectId: string, stageId: string, ids: string[]): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${projectId}/stages/${stageId}/subtasks/order`, { method: 'PUT', body: { ids } })
  },
  async deleteSubtask(projectId: string, stageId: string, subtaskId: string): Promise<{ project: ProjectDetail }> {
    return request(`/api/projects/${projectId}/stages/${stageId}/subtasks/${subtaskId}`, { method: 'DELETE' })
  },
  async calendar(): Promise<{ calendar: WorkCalendar }> {
    return request('/api/calendar')
  },
  async saveCalendar(calendar: WorkCalendar): Promise<{ calendar: WorkCalendar }> {
    return request('/api/calendar', { method: 'PUT', body: calendar })
  },
  async services(): Promise<{ services: ServiceRecord[] }> {
    return request('/api/services')
  },
  async createService(body: { name: string; allocationDays: number }): Promise<{ service: ServiceRecord }> {
    return request('/api/services', { method: 'POST', body })
  },
  async updateService(id: string, body: { name?: string; allocationDays?: number }): Promise<{ service: ServiceRecord }> {
    return request(`/api/services/${id}`, { method: 'PATCH', body })
  },
  async deleteService(id: string): Promise<void> {
    await request(`/api/services/${id}`, { method: 'DELETE' })
  },
  async allocation(month: string): Promise<AllocationReport> {
    return request(`/api/reports/allocation?month=${month}`)
  },
}
