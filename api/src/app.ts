import { createHash, randomBytes, randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z, ZodError } from 'zod'
import {
  archiveProject,
  assertLastAdminSurvives,
  activateStage,
  createClient,
  createProject,
  createService,
  createSubtask,
  createSupplier,
  createTemplate,
  deleteArchivedProject,
  deleteClient,
  deleteService,
  deleteSupplier,
  deleteSubtask,
  deleteUser,
  getProject,
  listArchivedProjects,
  listClients,
  listProjects,
  listServices,
  listSuppliers,
  listUsers,
  loadCalendar,
  loadTemplate,
  saveCalendar,
  projectListFields,
  reorderSubtasks,
  saveTemplate,
  setCompletion,
  updateClient,
  updateProject,
  updateService,
  updateSubtask,
  updateSupplier,
  type PublicUser,
  type Role,
} from './data.js'
import { allocationReport } from './allocation.js'
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from './http.js'
import { withTransaction } from './migrate.js'
import { hashPassword, verifyPassword } from './passwords.js'

const INVALID_LOGIN = 'E-mail ou senha inválidos.'
const SESSION_DAYS = 14

export type Clock = {
  today: () => string
  now: () => Date
}

type AuthUser = PublicUser

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null
  }
}

const emailSchema = z.string().trim().email('Informe um e-mail válido.').transform((value) => value.toLowerCase())
const nameSchema = z.string().trim().min(1, 'Informe o nome.').max(120)
const passwordSchema = z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.').max(200)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.')
const uuidSchema = z.string().uuid()
const durationSchema = z.number().int().positive('A duração precisa ser um número inteiro de dias maior que zero.')
const allocationDaysSchema = z.number().positive('O tempo de alocação precisa ser maior que zero.').max(365)
const scopeSchema = z.array(z.object({
  serviceId: uuidSchema,
  quantity: z.number().int().positive('A quantidade precisa ser um número inteiro maior que zero.'),
  allocationDays: allocationDaysSchema.optional(),
}))
const descriptionSchema = z.string().trim().max(4000, 'A descrição pode ter no máximo 4000 caracteres.')
const clientIdSchema = z.string().uuid().nullable()
const serviceBody = z.object({
  name: nameSchema,
  allocationDays: allocationDaysSchema,
})

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function requireUser(request: FastifyRequest): AuthUser {
  if (!request.authUser) throw unauthorized()
  return request.authUser
}

function requireAdmin(request: FastifyRequest): AuthUser {
  const user = requireUser(request)
  if (user.role !== 'admin') throw forbidden('Acesso restrito ao administrador.')
  return user
}

async function readAuthUser(pool: Pool, token: string, now: Date): Promise<AuthUser | null> {
  const result = await pool.query<AuthUser>(
    `SELECT u.id, u.name, u.email, u.role, u.active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.active AND u.deleted_at IS NULL`,
    [hashToken(token), now.toISOString()],
  )
  return result.rows[0] ?? null
}

export async function buildApp(pool: Pool, clock: Clock): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      const allowed = process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
      const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      if (allowed.includes(origin) || local) {
        callback(null, true)
        return
      }
      callback(new Error('Origem não permitida.'), false)
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  const dummyHash = await hashPassword('senha-invalida-para-tempo-constante')

  app.decorateRequest('authUser', null)
  app.addHook('onRequest', async (request) => {
    request.authUser = null
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    const token = header.slice('Bearer '.length).trim()
    if (!token) return
    request.authUser = await readAuthUser(pool, token, clock.now())
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message })
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues[0]?.message ?? 'Dados inválidos.' })
    }
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500
    if (statusCode < 500) return reply.code(statusCode).send({ error: 'Dados inválidos.' })
    request.log.error(error)
    return reply.code(500).send({ error: 'Erro interno.' })
  })

  app.get('/api/health', async () => ({ ok: true }))

  app.post('/api/session', async (request) => {
    const body = z.object({ email: emailSchema, password: z.string().min(1) }).parse(request.body)
    const found = await pool.query<{
      id: string
      name: string
      email: string
      role: Role
      active: boolean
      password_hash: string
    }>('SELECT id, name, email, role, active, password_hash FROM users WHERE email = $1 AND deleted_at IS NULL', [body.email])
    const user = found.rows[0]
    const matches = await verifyPassword(body.password, user?.password_hash ?? dummyHash)
    if (!user || !user.active || !matches) throw unauthorized(INVALID_LOGIN)
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(clock.now().getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
    await pool.query(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [randomUUID(), user.id, hashToken(token), expires.toISOString()],
    )
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active },
    }
  })

  app.delete('/api/session', async (request, reply) => {
    requireUser(request)
    const header = request.headers.authorization ?? ''
    const token = header.slice('Bearer '.length).trim()
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
    return reply.code(204).send()
  })

  app.get('/api/session', async (request) => {
    const user = requireUser(request)
    return { user }
  })

  app.get('/api/users', async (request) => {
    requireAdmin(request)
    return { users: await listUsers(pool) }
  })

  app.post('/api/users', async (request, reply) => {
    requireAdmin(request)
    const body = z.object({
      name: nameSchema,
      email: emailSchema,
      role: z.enum(['admin', 'operator']),
      password: passwordSchema,
    }).parse(request.body)
    try {
      const id = randomUUID()
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id, body.name, body.email, await hashPassword(body.password), body.role],
      )
      return reply.code(201).send({
        user: { id, name: body.name, email: body.email, role: body.role, active: true },
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe uma pessoa com este e-mail.')
      throw error
    }
  })

  app.get('/api/users/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const user = await findUser(pool, params.id)
    if (!user) throw notFound('Usuário não encontrado.')
    return { user }
  })

  app.patch('/api/users/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = z.object({
      name: nameSchema.optional(),
      email: emailSchema.optional(),
      role: z.enum(['admin', 'operator']).optional(),
      password: passwordSchema.optional(),
      active: z.boolean().optional(),
    }).parse(request.body)
    const current = await findUser(pool, params.id)
    if (!current) throw notFound('Usuário não encontrado.')
    const next = {
      name: body.name ?? current.name,
      email: body.email ?? current.email,
      role: body.role ?? current.role,
      active: body.active ?? current.active,
    }
    if (next.role !== current.role) {
      const allocated = await pool.query('SELECT 1 FROM subtasks WHERE assignee_id = $1 LIMIT 1', [current.id])
      if (allocated.rowCount) {
        throw conflict('Esta pessoa está alocada em tarefas. Remova as alocações antes de mudar o papel.')
      }
    }
    await assertLastAdminSurvives(pool, current.id, next)
    try {
      if (body.password) {
        await pool.query(
          `UPDATE users SET name = $1, email = $2, role = $3, active = $4, password_hash = $5 WHERE id = $6`,
          [next.name, next.email, next.role, next.active, await hashPassword(body.password), current.id],
        )
      } else {
        await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, active = $4 WHERE id = $5',
          [next.name, next.email, next.role, next.active, current.id],
        )
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe uma pessoa com este e-mail.')
      throw error
    }
    if (!next.active) await pool.query('DELETE FROM sessions WHERE user_id = $1', [current.id])
    return { user: { id: current.id, ...next } }
  })

  app.delete('/api/users/:id', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    await withTransaction(pool, (client) => deleteUser(client, params.id))
    return reply.code(204).send()
  })

  app.get('/api/templates', async (request) => {
    requireAdmin(request)
    const templates = await pool.query<{ id: string; name: string; archived: boolean }>(
      'SELECT id, name, archived FROM templates ORDER BY name',
    )
    const stages = await pool.query<{
      id: string
      template_id: string
      name: string
      position: number
    }>('SELECT id, template_id, name, position FROM template_stages ORDER BY position')
    const tasks = await pool.query<{
      id: string
      stage_id: string
      name: string
      duration_days: number
      position: number
      predecessor_id: string | null
    }>(
      `SELECT id, stage_id, name, duration_days, position, predecessor_id
       FROM template_tasks
       ORDER BY position`,
    )
    return {
      templates: templates.rows.map((template) => ({
        id: template.id,
        name: template.name,
        archived: template.archived,
        stages: stages.rows
          .filter((stage) => stage.template_id === template.id)
          .map((stage) => toTemplateStage(
            stage,
            tasks.rows.filter((task) => task.stage_id === stage.id),
          )),
      })),
    }
  })

  app.post('/api/templates', async (request, reply) => {
    requireAdmin(request)
    const body = templateBody.parse(request.body)
    try {
      const template = await withTransaction(pool, (client) => createTemplate(client, body))
      return reply.code(201).send({ template })
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um template com este nome.')
      throw error
    }
  })

  app.get('/api/templates/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const template = await loadTemplate(pool, params.id)
    if (!template) throw notFound('Template não encontrado.')
    return { template }
  })

  app.put('/api/templates/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = templateBody.parse(request.body)
    const current = await loadTemplate(pool, params.id)
    if (!current) throw notFound('Template não encontrado.')
    try {
      const template = await withTransaction(pool, (client) => saveTemplate(client, params.id, body))
      return { template }
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um template com este nome.')
      throw error
    }
  })

  app.post('/api/templates/:id/archive', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const updated = await pool.query('UPDATE templates SET archived = true WHERE id = $1', [params.id])
    if (!updated.rowCount) throw notFound('Template não encontrado.')
    const template = await loadTemplate(pool, params.id)
    return { template }
  })

  app.delete('/api/templates/:id', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const deleted = await pool.query('DELETE FROM templates WHERE id = $1', [params.id])
    if (!deleted.rowCount) throw notFound('Template não encontrado.')
    return reply.code(204).send()
  })

  app.get('/api/projects', async (request) => {
    const user = requireUser(request)
    const projects = await listProjects(pool, user.role === 'admin' ? {} : { userId: user.id })
    return { projects: projects.map((project) => projectListFields(project, user.role === 'admin')) }
  })

  app.get('/api/projects/archived', async (request) => {
    requireAdmin(request)
    return { projects: await listArchivedProjects(pool) }
  })

  app.delete('/api/projects/:id', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    await withTransaction(pool, (client) => deleteArchivedProject(client, params.id))
    return reply.code(204).send()
  })

  app.post('/api/projects', async (request, reply) => {
    requireAdmin(request)
    const body = z.object({
      name: nameSchema,
      startDate: dateSchema,
      templateId: uuidSchema,
      scope: scopeSchema.optional(),
    }).parse(request.body)
    const project = await withTransaction(pool, (client) => createProject(client, body))
    return reply.code(201).send({ project: toProjectDetail(project, true) })
  })

  app.get('/api/projects/:id', async (request) => {
    const user = requireUser(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const project = await visibleProject(pool, params.id, user)
    return { project: toProjectDetail(project, user.role === 'admin') }
  })

  app.patch('/api/projects/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = z.object({
      name: nameSchema.optional(),
      startDate: dateSchema.optional(),
      scope: scopeSchema.optional(),
      description: descriptionSchema.optional(),
      clientId: clientIdSchema.optional(),
      supplierId: clientIdSchema.optional(),
    }).parse(request.body)
    const project = await withTransaction(pool, (client) => updateProject(client, params.id, body))
    return { project: toProjectDetail(project, true) }
  })

  app.get('/api/clients', async (request) => {
    requireAdmin(request)
    return { clients: await listClients(pool) }
  })

  app.post('/api/clients', async (request, reply) => {
    requireAdmin(request)
    const body = z.object({ name: nameSchema }).parse(request.body)
    try {
      const client = await withTransaction(pool, (db) => createClient(db, body))
      return reply.code(201).send({ client })
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um cliente com este nome.')
      throw error
    }
  })

  app.patch('/api/clients/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = z.object({ name: nameSchema }).parse(request.body)
    try {
      const client = await withTransaction(pool, (db) => updateClient(db, params.id, body))
      return { client }
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um cliente com este nome.')
      throw error
    }
  })

  app.delete('/api/clients/:id', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    try {
      await withTransaction(pool, (db) => deleteClient(db, params.id))
    } catch (error) {
      if (isForeignKeyViolation(error)) throw conflict('Este cliente está em um projeto e não pode ser excluído.')
      throw error
    }
    return reply.code(204).send()
  })

  app.get('/api/suppliers', async (request) => {
    requireAdmin(request)
    return { suppliers: await listSuppliers(pool) }
  })

  app.post('/api/suppliers', async (request, reply) => {
    requireAdmin(request)
    const body = z.object({ name: nameSchema }).parse(request.body)
    try {
      const supplier = await withTransaction(pool, (db) => createSupplier(db, body))
      return reply.code(201).send({ supplier })
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um fornecedor com este nome.')
      throw error
    }
  })

  app.patch('/api/suppliers/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = z.object({ name: nameSchema }).parse(request.body)
    try {
      const supplier = await withTransaction(pool, (db) => updateSupplier(db, params.id, body))
      return { supplier }
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um fornecedor com este nome.')
      throw error
    }
  })

  app.delete('/api/suppliers/:id', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    try {
      await withTransaction(pool, (db) => deleteSupplier(db, params.id))
    } catch (error) {
      if (isForeignKeyViolation(error)) throw conflict('Este fornecedor está em uso e não pode ser excluído.')
      throw error
    }
    return reply.code(204).send()
  })

  app.get('/api/services', async (request) => {
    requireAdmin(request)
    return { services: await listServices(pool) }
  })

  app.post('/api/services', async (request, reply) => {
    requireAdmin(request)
    const body = serviceBody.parse(request.body)
    try {
      const service = await withTransaction(pool, (client) => createService(client, body))
      return reply.code(201).send({ service })
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um serviço com este nome.')
      throw error
    }
  })

  app.patch('/api/services/:id', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = serviceBody.partial().parse(request.body)
    try {
      const service = await withTransaction(pool, (client) => updateService(client, params.id, body))
      return { service }
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Já existe um serviço com este nome.')
      throw error
    }
  })

  app.delete('/api/services/:id', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    try {
      await withTransaction(pool, (client) => deleteService(client, params.id))
    } catch (error) {
      if (isForeignKeyViolation(error)) throw conflict('Este serviço está no escopo de um projeto e não pode ser excluído.')
      throw error
    }
    return reply.code(204).send()
  })

  app.get('/api/calendar', async (request) => {
    requireUser(request)
    return { calendar: await loadCalendar(pool) }
  })

  app.put('/api/calendar', async (request) => {
    requireAdmin(request)
    const body = z.object({
      closedWeekdays: z.array(z.number().int().min(0).max(6)),
      holidays: z.array(dateSchema),
    }).parse(request.body)
    const calendar = await withTransaction(pool, (client) => saveCalendar(client, body))
    return { calendar }
  })

  app.get('/api/reports/allocation', async (request) => {
    requireAdmin(request)
    const query = z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mês no formato AAAA-MM.'),
    }).parse(request.query)
    return allocationReport(pool, query.month)
  })

  app.post('/api/projects/:id/archive', async (request, reply) => {
    const user = requireAdmin(request)
    const params = z.object({ id: uuidSchema }).parse(request.params)
    const body = z.object({
      password: z.string().min(1, 'Informe a senha.'),
    }).parse(request.body)
    const stored = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id],
    )
    const hash = stored.rows[0]?.password_hash
    const matches = await verifyPassword(body.password, hash ?? dummyHash)
    if (!hash || !matches) throw unauthorized('Senha incorreta.')
    await withTransaction(pool, (client) => archiveProject(client, params.id))
    return reply.code(204).send()
  })

  app.post('/api/projects/:id/stages/:stageId/activate', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema, stageId: uuidSchema }).parse(request.params)
    const project = await withTransaction(pool, (client) =>
      activateStage(client, params.id, params.stageId, clock.today()),
    )
    return { project: toProjectDetail(project, true) }
  })

  app.put('/api/projects/:id/stages/:stageId/completion', async (request) => {
    const user = requireUser(request)
    const params = z.object({ id: uuidSchema, stageId: uuidSchema }).parse(request.params)
    const body = z.object({ completed: z.boolean() }).parse(request.body)
    await visibleProject(pool, params.id, user)
    const project = await withTransaction(pool, (client) =>
      setCompletion(client, params.id, params.stageId, user.id, body.completed, clock.today()),
    )
    return { project: toProjectDetail(project, user.role === 'admin') }
  })

  app.post('/api/projects/:id/stages/:stageId/subtasks', async (request, reply) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema, stageId: uuidSchema }).parse(request.params)
    const body = z.object({ name: nameSchema, durationDays: durationSchema.optional() }).parse(request.body)
    const project = await withTransaction(pool, (client) => createSubtask(client, params.id, params.stageId, body))
    return reply.code(201).send({ project: toProjectDetail(project, true) })
  })

  app.patch('/api/projects/:id/stages/:stageId/subtasks/:subtaskId', async (request) => {
    const user = requireUser(request)
    const params = z.object({ id: uuidSchema, stageId: uuidSchema, subtaskId: uuidSchema }).parse(request.params)
    const allocationSchema = z.object({
      userId: uuidSchema.optional(),
      supplierId: uuidSchema.optional(),
      startDate: dateSchema,
      durationDays: durationSchema,
    }).refine((value) => Number(Boolean(value.userId)) + Number(Boolean(value.supplierId)) === 1, {
      message: 'Escolha um profissional.',
    })
    const body = user.role === 'admin'
      ? z.object({
          name: nameSchema.optional(),
          durationDays: durationSchema.optional(),
          done: z.boolean().optional(),
          startDate: dateSchema.nullable().optional(),
          predecessorId: uuidSchema.nullable().optional(),
          allocation: allocationSchema.optional(),
        }).refine((value) => (
          value.name !== undefined
          || value.durationDays !== undefined
          || value.done !== undefined
          || value.startDate !== undefined
          || value.predecessorId !== undefined
          || value.allocation !== undefined
        ), {
          message: 'Informe o que deseja alterar.',
        }).parse(request.body)
      : z.object({ done: z.boolean() }).strict().parse(request.body)
    await visibleProject(pool, params.id, user)
    const project = await withTransaction(pool, (client) =>
      updateSubtask(client, params.id, params.stageId, params.subtaskId, body, user, clock.today()),
    )
    return { project: toProjectDetail(project, user.role === 'admin') }
  })

  app.put('/api/projects/:id/stages/:stageId/subtasks/order', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema, stageId: uuidSchema }).parse(request.params)
    const body = z.object({ ids: z.array(uuidSchema) }).parse(request.body)
    const project = await withTransaction(pool, (client) =>
      reorderSubtasks(client, params.id, params.stageId, body.ids),
    )
    return { project: toProjectDetail(project, true) }
  })

  app.delete('/api/projects/:id/stages/:stageId/subtasks/:subtaskId', async (request) => {
    requireAdmin(request)
    const params = z.object({ id: uuidSchema, stageId: uuidSchema, subtaskId: uuidSchema }).parse(request.params)
    const project = await withTransaction(pool, (client) =>
      deleteSubtask(client, params.id, params.stageId, params.subtaskId, clock.today()),
    )
    return { project: toProjectDetail(project, true) }
  })

  return app
}

const templateTaskBody = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  durationDays: durationSchema,
  predecessorId: uuidSchema.nullable().optional(),
})

const templateBody = z.object({
  name: nameSchema,
  stages: z.array(z.object({
    id: uuidSchema.optional(),
    name: nameSchema,
    tasks: z.array(templateTaskBody).optional(),
  })).min(1, 'O template precisa de ao menos uma etapa.'),
})

function toTemplateStage(
  stage: { id: string; name: string; position: number },
  tasks: {
    id: string
    name: string
    duration_days: number
    position: number
    predecessor_id: string | null
  }[] = [],
) {
  return {
    id: stage.id,
    name: stage.name,
    position: stage.position,
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      durationDays: Number(task.duration_days),
      position: task.position,
      predecessorId: task.predecessor_id,
    })),
  }
}

async function findUser(pool: Pool, id: string): Promise<PublicUser | null> {
  const result = await pool.query<PublicUser>(
    'SELECT id, name, email, role, active FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id],
  )
  return result.rows[0] ?? null
}

async function visibleProject(pool: Pool, projectId: string, user: AuthUser) {
  const project = await getProject(pool, projectId)
  if (!project || project.archived) throw notFound('Projeto não encontrado.')
  if (user.role === 'admin') return project
  const allocated = project.stages.some((stage) => stage.operators.some((operator) => operator.id === user.id))
  if (!allocated) throw notFound('Projeto não encontrado.')
  return project
}

function toProjectDetail(
  project: NonNullable<Awaited<ReturnType<typeof getProject>>>,
  admin: boolean,
) {
  return {
    ...project,
    stages: project.stages.map((stage) => ({
      ...stage,
      unassigned: admin ? stage.unassigned : false,
    })),
  }
}

export function sendEmpty(reply: FastifyReply): FastifyReply {
  return reply.code(204).send()
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'
}

