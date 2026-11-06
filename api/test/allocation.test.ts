import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { allocationReport } from '../src/allocation.ts'
import { createPool } from '../src/db.ts'
import { createProject, createSubtask, createTemplate, loadCalendar, updateSubtask, type SubtaskDetail } from '../src/data.ts'
import { addDays, isWorkingDay } from '../src/domain.ts'
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

function countOn(report: Awaited<ReturnType<typeof allocationReport>>, userId: string, day: string): number {
  const person = report.people.find((item) => item.id === userId)
  assert.ok(person)
  const index = report.days.indexOf(day)
  assert.ok(index >= 0)
  return person.counts[index]
}

function inclusiveDays(start: string, end: string): number {
  let count = 0
  let cursor = start
  while (cursor <= end) {
    count += 1
    cursor = addDays(cursor, 1)
  }
  return count
}

async function firstWorkingDay(client: PoolClient): Promise<string> {
  const calendar = await loadCalendar(client)
  let day = '2026-11-02'
  while (day < '2026-11-20') {
    if (isWorkingDay(day, calendar)) return day
    day = addDays(day, 1)
  }
  throw new Error('Não há dia útil no início de novembro para o teste.')
}

describe('relatório de alocação', () => {
  it('conta 1, 2 e 3 no mesmo dia e 0 fora das tarefas', async () => {
    await withRollback(async (client) => {
      const operatorId = randomUUID()
      const idleId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador Relatório', $2, $3, 'operator', true),
                ($4, 'Operador Sem Tarefa', $5, $3, 'operator', true)`,
        [
          operatorId,
          `relatorio-${operatorId}@example.com`,
          await hashPassword('senha-teste'),
          idleId,
          `ocioso-${idleId}@example.com`,
        ],
      )
      const calendar = await loadCalendar(client)
      const start = await firstWorkingDay(client)
      const template = await createTemplate(client, {
        name: `Alocação ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: start,
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const names = ['Uma', 'Duas', 'Três']
      let endDate = ''
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index]
        const created = await createSubtask(client, project.id, stageId, { name, durationDays: 1 })
        const task = taskNamed(created.stages[0].subtasks, name)
        const saved = await updateSubtask(
          client,
          project.id,
          stageId,
          task.id,
          {
            durationDays: 1,
            startDate: start,
            allocation: { userId: operatorId, startDate: start, durationDays: 1 },
          },
          admin,
          today,
        )
        const scheduled = taskNamed(saved.stages[0].subtasks, name)
        assert.equal(scheduled.startDate, start)
        endDate = scheduled.endDate
        const report = await allocationReport(client, '2026-11')
        const expected = index + 1
        const person = report.people.find((item) => item.id === operatorId)
        assert.ok(person)
        const startIndex = report.days.indexOf(start)
        assert.equal(countOn(report, operatorId, start), expected)
        assert.equal(person.tasks[startIndex].length, expected)
        assert.equal(person.tasks[startIndex].filter((item) => item.task === name && item.project === project.name).length, 1)
        assert.equal(
          person.counts.reduce((sum, count) => sum + count, 0),
          inclusiveDays(start, endDate) * expected,
        )
        if (endDate.startsWith('2026-11')) {
          assert.equal(countOn(report, operatorId, endDate), expected)
        }
        const dayAfter = addDays(endDate, 1)
        if (dayAfter.startsWith('2026-11')) {
          assert.equal(countOn(report, operatorId, dayAfter), 0)
          assert.deepEqual(person.tasks[report.days.indexOf(dayAfter)], [])
        }
      }
      const report = await allocationReport(client, '2026-11')
      report.days.forEach((day, index) => {
        assert.equal(report.closed[index], !isWorkingDay(day, calendar))
      })
      const outside = report.days.find((day) => day >= '2026-11-28')
      assert.ok(outside)
      assert.equal(countOn(report, operatorId, outside), 0)
      const idle = report.people.find((person) => person.id === idleId)
      assert.ok(idle)
      assert.ok(idle.counts.every((count) => count === 0))
      await client.query('UPDATE users SET active = false WHERE id = $1', [operatorId])
      const after = await allocationReport(client, '2026-11')
      assert.equal(countOn(after, operatorId, start), 3)
      assert.equal(after.people.some((person) => person.id === idleId), true)
    })
  })
})
