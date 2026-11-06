import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { allocationReport } from '../src/allocation.ts'
import { createPool } from '../src/db.ts'
import {
  archiveProject,
  createProject,
  createSubtask,
  createTemplate,
  deleteArchivedProject,
  deleteUser,
  getProject,
  listUsers,
  removedUserName,
  updateSubtask,
  type SubtaskDetail,
} from '../src/data.ts'
import { HttpError } from '../src/http.ts'
import { migrate } from '../src/migrate.ts'
import { hashPassword } from '../src/passwords.ts'

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  const password = env.match(/^APP_DB_PASSWORD=(.*)$/m)?.[1]?.trim()
  const database = env.match(/^POSTGRES_DB=(.*)$/m)?.[1]?.trim()
  if (!password || !database) throw new Error('Defina DATABASE_URL ou APP_DB_PASSWORD no .env.')
  return `postgresql://editorial_app:${encodeURIComponent(password)}@127.0.0.1:54329/${database}`
}

const pool = createPool(databaseUrl())
const actor = { id: randomUUID(), role: 'admin' as const }
const today = '2026-11-06'

before(async () => {
  await migrate(pool)
})

after(async () => {
  await pool.end()
})

async function withRollback(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await run(client)
    await client.query('ROLLBACK')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

function taskNamed(tasks: readonly SubtaskDetail[], name: string): SubtaskDetail {
  const found = tasks.find((task) => task.name === name)
  assert.ok(found)
  return found
}

describe('exclusão de usuário e de projeto arquivado', () => {
  it('exclui um usuário alocado, mantém a tarefa e mostra o placeholder', async () => {
    await withRollback(async (client) => {
      const operatorId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador Alocado', $2, $3, 'operator', true)`,
        [operatorId, `alocado-${operatorId}@example.com`, await hashPassword('senha-teste')],
      )
      const template = await createTemplate(client, {
        name: `Template exclusão ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto exclusão ${randomUUID()}`,
        startDate: '2026-11-02',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const created = await createSubtask(client, project.id, stageId, { name: 'Ler', durationDays: 2 })
      const draft = taskNamed(created.stages[0].subtasks, 'Ler')
      const saved = await updateSubtask(
        client,
        project.id,
        stageId,
        draft.id,
        { allocation: { userId: operatorId, startDate: '2026-11-02', durationDays: 2 } },
        actor,
        today,
      )
      const before = taskNamed(saved.stages[0].subtasks, 'Ler')
      assert.equal(before.assignee?.id, operatorId)
      await client.query('INSERT INTO completions (stage_id, user_id) VALUES ($1, $2)', [stageId, operatorId])

      await deleteUser(client, operatorId)

      const afterProject = await getProject(client, project.id)
      assert.ok(afterProject)
      assert.equal(afterProject.stages[0].subtasks.length, 1)
      const after = taskNamed(afterProject.stages[0].subtasks, 'Ler')
      assert.equal(after.id, before.id)
      assert.equal(after.name, before.name)
      assert.equal(after.startDate, before.startDate)
      assert.equal(after.endDate, before.endDate)
      assert.equal(after.durationDays, before.durationDays)
      assert.equal(after.done, before.done)
      assert.equal(after.predecessorId, before.predecessorId)
      assert.equal(after.assignee?.name, removedUserName)
      assert.equal(after.assignee?.deleted, true)
      assert.equal(after.assignee?.startDate, before.assignee?.startDate)
      assert.equal(after.assignee?.durationDays, before.assignee?.durationDays)
      assert.equal(afterProject.stages[0].operators[0]?.name, removedUserName)

      const people = await listUsers(client)
      assert.equal(people.some((person) => person.id === operatorId), false)
      const signIn = await client.query(
        'SELECT 1 FROM users WHERE id = $1 AND active AND deleted_at IS NULL',
        [operatorId],
      )
      assert.equal(signIn.rowCount, 0)

      const month = before.startDate.slice(0, 7)
      const report = await allocationReport(client, month)
      const row = report.people.find((person) => person.id === operatorId)
      assert.ok(row)
      assert.equal(row.name, removedUserName)
      assert.ok(row.counts.some((count) => count > 0))
    })
  })

  it('recusa excluir o único administrador ativo', async () => {
    await withRollback(async (client) => {
      const adminId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Único Admin', $2, $3, 'admin', true)`,
        [adminId, `unico-${adminId}@example.com`, await hashPassword('senha-teste')],
      )
      await client.query(
        `UPDATE users SET active = false
         WHERE role = 'admin' AND deleted_at IS NULL AND id <> $1`,
        [adminId],
      )
      await assert.rejects(
        () => deleteUser(client, adminId),
        (error: unknown) => error instanceof HttpError && error.statusCode === 409,
      )
      const still = await client.query(
        'SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL',
        [adminId],
      )
      assert.equal(still.rowCount, 1)
    })
  })

  it('apaga um projeto arquivado e recusa um projeto ativo', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Template projeto ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto removível ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      await createSubtask(client, project.id, stageId, { name: 'Ler', durationDays: 1 })
      await assert.rejects(
        () => deleteArchivedProject(client, project.id),
        (error: unknown) => error instanceof HttpError && error.statusCode === 409,
      )
      assert.ok(await getProject(client, project.id))

      await archiveProject(client, project.id)
      const archived = await client.query<{ id: string }>(
        'SELECT id FROM projects WHERE archived = true AND id = $1',
        [project.id],
      )
      assert.equal(archived.rowCount, 1)

      await deleteArchivedProject(client, project.id)
      assert.equal(await getProject(client, project.id), null)
      const stages = await client.query('SELECT 1 FROM project_stages WHERE project_id = $1', [project.id])
      const tasks = await client.query('SELECT 1 FROM subtasks WHERE stage_id = $1', [stageId])
      assert.equal(stages.rowCount, 0)
      assert.equal(tasks.rowCount, 0)
      const templateRemains = await client.query('SELECT 1 FROM templates WHERE id = $1', [template.id])
      assert.equal(templateRemains.rowCount, 1)
    })
  })
})
