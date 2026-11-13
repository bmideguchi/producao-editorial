import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { allocationReport } from '../src/allocation.ts'
import { createPool } from '../src/db.ts'
import {
  createClient,
  createProject,
  createService,
  createSubtask,
  createSupplier,
  createTemplate,
  deleteSubtask,
  deleteSupplier,
  getProject,
  listUsers,
  updateProject,
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
const admin = { id: randomUUID(), role: 'admin' as const }
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

describe('fornecedores', () => {
  it('grava no projeto e na tarefa, recusa exclusão em uso e não entra na equipe', async () => {
    await withRollback(async (client) => {
      const usersBefore = await listUsers(client)
      const userCount = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')
      const supplier = await createSupplier(client, { name: '  Gráfica temporária  ' })
      assert.equal(supplier.name, 'Gráfica temporária')
      const usersAfter = await listUsers(client)
      assert.deepEqual(usersAfter.map((user) => user.id), usersBefore.map((user) => user.id))
      const userCountAfter = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users')
      assert.equal(userCountAfter.rows[0].n, userCount.rows[0].n)

      const service = await createService(client, { name: `Serviço ${randomUUID()}`, allocationDays: 0.5 })
      const catalogClient = await createClient(client, { name: `Cliente ${randomUUID()}` })
      const template = await createTemplate(client, {
        name: `Template ${randomUUID()}`,
        stages: [{ name: 'Pauta', tasks: [{ name: 'Origem', durationDays: 2 }] }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-02',
        templateId: template.id,
        scope: [{ serviceId: service.id, quantity: 3, allocationDays: 0.5 }],
      })
      const described = await updateProject(client, project.id, {
        description: 'Descrição que permanece',
        clientId: catalogClient.id,
      })
      const withSupplier = await updateProject(client, project.id, { supplierId: supplier.id })
      assert.equal(withSupplier.supplierId, supplier.id)
      assert.equal(withSupplier.supplierName, 'Gráfica temporária')
      assert.equal(withSupplier.description, 'Descrição que permanece')
      assert.equal(withSupplier.clientId, catalogClient.id)
      assert.equal(withSupplier.clientName, catalogClient.name)
      assert.equal(withSupplier.name, described.name)
      assert.equal(withSupplier.scope[0].quantity, 3)
      assert.equal(withSupplier.scope[0].allocationDays, 0.5)
      assert.equal(withSupplier.stages[0].subtasks.length, described.stages[0].subtasks.length)

      await assert.rejects(
        () => deleteSupplier(client, supplier.id),
        (error: unknown) => error instanceof HttpError && error.message === 'Este fornecedor está em um projeto e não pode ser excluído.',
      )

      const operatorId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador Fornecedor', $2, $3, 'operator', true)`,
        [operatorId, `fornecedor-${operatorId}@example.com`, await hashPassword('senha-teste')],
      )
      const usersWithOperator = await listUsers(client)
      assert.equal(usersWithOperator.some((user) => user.name === 'Gráfica temporária'), false)

      const stageId = project.stages[0].id
      const origin = taskNamed(withSupplier.stages[0].subtasks, 'Origem')
      const created = await createSubtask(client, project.id, stageId, { name: 'Copia', durationDays: 4 })
      const copy = taskNamed(created.stages[0].subtasks, 'Copia')
      const linked = await updateSubtask(
        client,
        project.id,
        stageId,
        copy.id,
        {
          name: 'Copia final',
          durationDays: 4,
          done: false,
          predecessorId: origin.id,
          allocation: { userId: operatorId, startDate: '2026-11-02', durationDays: 4 },
        },
        admin,
        today,
      )
      const beforeSwitch = taskNamed(linked.stages[0].subtasks, 'Copia final')
      assert.equal(beforeSwitch.assignee?.kind, 'user')
      assert.equal(beforeSwitch.predecessorId, origin.id)

      const switched = await updateSubtask(
        client,
        project.id,
        stageId,
        copy.id,
        { allocation: { supplierId: supplier.id, startDate: '2026-11-02', durationDays: 4 } },
        admin,
        today,
      )
      const assigned = taskNamed(switched.stages[0].subtasks, 'Copia final')
      assert.equal(assigned.name, 'Copia final')
      assert.equal(assigned.durationDays, 4)
      assert.equal(assigned.done, false)
      assert.equal(assigned.predecessorId, origin.id)
      assert.equal(assigned.startDate, beforeSwitch.startDate)
      assert.equal(assigned.endDate, beforeSwitch.endDate)
      assert.equal(assigned.assignee?.kind, 'supplier')
      assert.equal(assigned.assignee?.id, supplier.id)
      assert.equal(assigned.assignee?.name, 'Gráfica temporária')
      assert.equal(assigned.assignee?.deleted, false)
      const stage = switched.stages[0]
      assert.equal(stage.unassigned, false)
      assert.equal(stage.color, 'blue')
      assert.equal(stage.operators.some((operator) => operator.id === supplier.id), true)

      const stored = await client.query<{ assignee_id: string | null; supplier_id: string | null }>(
        'SELECT assignee_id, supplier_id FROM subtasks WHERE id = $1',
        [copy.id],
      )
      assert.equal(stored.rows[0].assignee_id, null)
      assert.equal(stored.rows[0].supplier_id, supplier.id)

      const month = (assigned.startDate ?? '2026-11-02').slice(0, 7)
      const report = await allocationReport(client, month)
      const supplierRow = report.people.find((person) => person.id === supplier.id)
      const operatorRow = report.people.find((person) => person.id === operatorId)
      assert.ok(supplierRow)
      assert.equal(supplierRow.name, 'Gráfica temporária')
      assert.ok(operatorRow)
      const day = assigned.startDate ?? '2026-11-02'
      const index = report.days.indexOf(day)
      assert.ok(index >= 0)
      assert.equal(supplierRow.counts[index], 1)
      assert.equal(supplierRow.tasks[index].filter((item) => item.task === 'Copia final' && item.project === project.name).length, 1)
      assert.equal(operatorRow.counts[index], 0)
      assert.equal(operatorRow.tasks[index].some((item) => item.task === 'Copia final'), false)

      const done = await updateSubtask(
        client,
        project.id,
        stageId,
        copy.id,
        { done: true },
        admin,
        today,
      )
      const finished = done.stages[0]
      assert.equal(taskNamed(finished.subtasks, 'Copia final').done, true)
      assert.equal(taskNamed(finished.subtasks, 'Copia final').assignee?.kind, 'supplier')
      assert.equal(finished.color, 'green')

      const cleared = await updateProject(client, project.id, { supplierId: null })
      assert.equal(cleared.supplierId, null)
      assert.equal(cleared.supplierName, '')
      assert.equal(cleared.description, 'Descrição que permanece')
      assert.equal(cleared.clientId, catalogClient.id)
      assert.equal(taskNamed(cleared.stages[0].subtasks, 'Copia final').assignee?.id, supplier.id)

      await assert.rejects(
        () => deleteSupplier(client, supplier.id),
        (error: unknown) => error instanceof HttpError && error.message === 'Este fornecedor está alocado em uma tarefa e não pode ser excluído.',
      )

      await deleteSubtask(client, project.id, stageId, copy.id, today)
      const kept = await getProject(client, project.id)
      assert.equal(kept?.description, 'Descrição que permanece')
      assert.equal(taskNamed(kept?.stages[0].subtasks ?? [], 'Origem').name, 'Origem')
      await deleteSupplier(client, supplier.id)
      const usersAtEnd = await listUsers(client)
      assert.equal(usersAtEnd.some((user) => user.id === operatorId), true)
      assert.equal(usersAtEnd.some((user) => user.name === 'Gráfica temporária'), false)
    })
  })
})
