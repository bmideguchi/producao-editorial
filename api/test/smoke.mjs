import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:8088'
const adminEmail = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@example.com'
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'troque-esta-senha'

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  return { status: response.status, payload }
}

function stage(project, name) {
  const found = project.stages.find((item) => item.name === name)
  assert.ok(found, `etapa ${name} não encontrada`)
  return found
}

const health = await call('/api/health')
assert.equal(health.status, 200)

const unknown = await call('/api/session', {
  method: 'POST',
  body: { email: 'nao-existe@example.com', password: 'senha-errada' },
})
const wrong = await call('/api/session', {
  method: 'POST',
  body: { email: adminEmail, password: 'senha-errada' },
})
assert.equal(unknown.status, 401)
assert.equal(wrong.status, 401)
assert.equal(unknown.payload.error, wrong.payload.error)

const login = await call('/api/session', {
  method: 'POST',
  body: { email: adminEmail, password: adminPassword },
})
assert.equal(login.status, 200)
assert.equal(login.payload.user.role, 'admin')
const admin = login.payload.token

const suffix = randomUUID().slice(0, 8)
const operatorEmail = `operador-${suffix}@example.com`
const secondEmail = `operador2-${suffix}@example.com`
const created = await call('/api/users', {
  method: 'POST',
  token: admin,
  body: { name: 'Operador Um', email: operatorEmail, role: 'operator', password: 'senha-operador' },
})
assert.equal(created.status, 201)
const operatorId = created.payload.user.id
const second = await call('/api/users', {
  method: 'POST',
  token: admin,
  body: { name: 'Operador Dois', email: secondEmail, role: 'operator', password: 'senha-operador' },
})
const secondId = second.payload.user.id

const operatorLogin = await call('/api/session', {
  method: 'POST',
  body: { email: operatorEmail, password: 'senha-operador' },
})
const operator = operatorLogin.payload.token
const hidden = await call('/api/users', { token: operator })
assert.equal(hidden.status, 403)

const deactivated = await call(`/api/users/${secondId}`, {
  method: 'PATCH',
  token: admin,
  body: { active: false },
})
assert.equal(deactivated.status, 200)
const inactiveLogin = await call('/api/session', {
  method: 'POST',
  body: { email: secondEmail, password: 'senha-operador' },
})
assert.equal(inactiveLogin.status, 401)
assert.equal(inactiveLogin.payload.error, unknown.payload.error)
await call(`/api/users/${secondId}`, { method: 'PATCH', token: admin, body: { active: true } })

const self = await call('/api/session', { token: admin })
const lastAdmin = await call(`/api/users/${self.payload.user.id}`, {
  method: 'PATCH',
  token: admin,
  body: { active: false },
})
assert.equal(lastAdmin.status, 409)

const template = await call('/api/templates', {
  method: 'POST',
  token: admin,
  body: {
    name: `Fluxo ${suffix}`,
    stages: [
      { name: 'Pauta', durationDays: 5 },
      { name: 'Revisão', durationDays: 2 },
      { name: 'Fechamento', durationDays: 1 },
    ],
  },
})
assert.equal(template.status, 201)
const templateId = template.payload.template.id

const projectResponse = await call('/api/projects', {
  method: 'POST',
  token: admin,
  body: { name: `Livro ${suffix}`, startDate: '2026-11-06', templateId },
})
assert.equal(projectResponse.status, 201)
let project = projectResponse.payload.project
assert.equal(stage(project, 'Pauta').activatedAt, '2026-11-06')
assert.equal(stage(project, 'Revisão').activatedAt, null)
assert.equal(stage(project, 'Pauta').color, 'gray')
assert.equal(stage(project, 'Pauta').unassigned, true)
assert.equal(stage(project, 'Pauta').forecastEnd, '2026-11-11')

const renamed = await call(`/api/templates/${templateId}`, {
  method: 'PUT',
  token: admin,
  body: {
    name: `Fluxo ${suffix}`,
    stages: [
      { name: 'Pauta alterada', durationDays: 9 },
      { name: 'Revisão', durationDays: 2 },
    ],
  },
})
assert.equal(renamed.status, 200)
const untouched = await call(`/api/projects/${project.id}`, { token: admin })
assert.equal(stage(untouched.payload.project, 'Pauta').durationDays, 5)

const missing = await call(`/api/projects/${project.id}`, { token: operator })
assert.equal(missing.status, 404)
const emptyList = await call('/api/projects', { token: operator })
assert.equal(emptyList.payload.projects.some((item) => item.id === project.id), false)

let allocated = await call(`/api/projects/${project.id}/stages/${stage(project, 'Pauta').id}/allocations`, {
  method: 'POST',
  token: admin,
  body: { userId: operatorId },
})
allocated = await call(`/api/projects/${project.id}/stages/${allocated.payload.project.stages[0].id}/allocations`, {
  method: 'POST',
  token: admin,
  body: { userId: secondId },
})
project = allocated.payload.project
assert.equal(stage(project, 'Pauta').color, 'blue')

const partial = await call(`/api/projects/${project.id}/stages/${stage(project, 'Pauta').id}/completion`, {
  method: 'PUT',
  token: operator,
  body: { completed: true },
})
assert.equal(stage(partial.payload.project, 'Pauta').color, 'yellow')
assert.equal(stage(partial.payload.project, 'Revisão').activatedAt, null)

const secondLogin = await call('/api/session', {
  method: 'POST',
  body: { email: secondEmail, password: 'senha-operador' },
})
const done = await call(`/api/projects/${project.id}/stages/${stage(project, 'Pauta').id}/completion`, {
  method: 'PUT',
  token: secondLogin.payload.token,
  body: { completed: true },
})
project = done.payload.project
assert.equal(stage(project, 'Pauta').color, 'green')
assert.ok(stage(project, 'Revisão').activatedAt)

const reopened = await call(`/api/projects/${project.id}/stages/${stage(project, 'Pauta').id}/completion`, {
  method: 'PUT',
  token: operator,
  body: { completed: false },
})
project = reopened.payload.project
assert.equal(stage(project, 'Pauta').color, 'yellow')
assert.ok(stage(project, 'Revisão').activatedAt)

const manual = await call(`/api/projects/${project.id}/stages/${stage(project, 'Fechamento').id}/activate`, {
  method: 'POST',
  token: admin,
})
assert.ok(stage(manual.payload.project, 'Fechamento').activatedAt)
const operatorCannot = await call(`/api/projects/${project.id}/stages/${stage(project, 'Fechamento').id}/activate`, {
  method: 'POST',
  token: operator,
})
assert.equal(operatorCannot.status, 403)

const visible = await call('/api/projects', { token: operator })
const listed = visible.payload.projects.find((item) => item.id === project.id)
assert.equal(listed.stages.map((item) => item.color).join(','), 'yellow,gray,gray')
assert.equal(listed.stages.every((item) => item.unassigned === false), true)

const adminList = await call('/api/projects', { token: admin })
const adminItem = adminList.payload.projects.find((item) => item.id === project.id)
assert.equal(adminItem.stages[0].color, 'yellow')
assert.equal(adminItem.stages[1].unassigned, true)
assert.equal(adminItem.stages[2].unassigned, true)

const soloResponse = await call('/api/projects', {
  method: 'POST',
  token: admin,
  body: { name: `Solo ${suffix}`, startDate: '2026-11-06', templateId },
})
let solo = soloResponse.payload.project
const soloFirst = solo.stages.find((item) => item.position === 1)
solo = (await call(`/api/projects/${solo.id}/stages/${soloFirst.id}/allocations`, {
  method: 'POST',
  token: admin,
  body: { userId: operatorId },
})).payload.project
assert.equal(solo.stages.find((item) => item.position === 1).color, 'blue')
solo = (await call(`/api/projects/${solo.id}/stages/${soloFirst.id}/completion`, {
  method: 'PUT',
  token: operator,
  body: { completed: true },
})).payload.project
assert.equal(solo.stages.find((item) => item.position === 1).color, 'green')
assert.ok(solo.stages.find((item) => item.position === 2).activatedAt)

await call(`/api/projects/${project.id}/archive`, { method: 'POST', token: admin })
const afterArchive = await call('/api/projects', { token: admin })
assert.equal(afterArchive.payload.projects.some((item) => item.id === project.id), false)

const blockedDelete = await call(`/api/templates/${templateId}`, { method: 'DELETE', token: admin })
assert.equal(blockedDelete.status, 409)

const logout = await call('/api/session', { method: 'DELETE', token: operator })
assert.equal(logout.status, 204)
const afterLogout = await call('/api/projects', { token: operator })
assert.equal(afterLogout.status, 401)

console.log('Fluxo do MVP ok.')
