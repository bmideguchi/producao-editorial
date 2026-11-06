import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { createPool } from '../src/db.ts'
import {
  archiveProject,
  createProject,
  createSubtask,
  createTemplate,
  getProject,
  listProjects,
  projectListFields,
  saveTemplate,
  updateSubtask,
} from '../src/data.ts'
import { HttpError } from '../src/http.ts'
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

describe('template, duração e lista', () => {
  it('propaga renomear, incluir e remover, mede o intervalo das tarefas e monta percentual e Geral', async () => {
    await withRollback(async (client) => {
      const operatorId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador teste', $2, $3, 'operator', true)`,
        [operatorId, `op-${operatorId}@example.com`, await hashPassword('senha-teste')],
      )
      const template = await createTemplate(client, {
        name: `Template ${randomUUID()}`,
        stages: [{ name: 'Pauta' }, { name: 'Revisão' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const pauta = project.stages[0]
      const revisao = project.stages[1]
      assert.equal(pauta.durationDays, 0)
      assert.equal(pauta.activatedAt, '2026-11-06')
      assert.equal(revisao.activatedAt, null)

      await createSubtask(client, project.id, revisao.id, { name: 'Passar o olho', durationDays: 4 })
      const withTasks = await createSubtask(client, project.id, pauta.id, { name: 'Ler', durationDays: 2 })
      const second = await createSubtask(client, project.id, pauta.id, { name: 'Entrevistar', durationDays: 3 })
      assert.equal(second.stages[0].durationDays, 3)
      assert.equal(second.stages[0].forecastEnd, '2026-11-10')
      const ler = withTasks.stages[0].subtasks[0]
      const entrevistar = second.stages[0].subtasks[1]
      await updateSubtask(
        client,
        project.id,
        pauta.id,
        ler.id,
        { allocation: { userId: operatorId, startDate: '2026-11-06', durationDays: 5 } },
        { id: operatorId, role: 'admin' },
        '2026-11-06',
      )

      const marked = await updateSubtask(
        client,
        project.id,
        pauta.id,
        ler.id,
        { done: true },
        { id: operatorId, role: 'operator' },
        '2026-11-06',
      )
      await assert.rejects(
        () => updateSubtask(
          client,
          project.id,
          pauta.id,
          entrevistar.id,
          { done: true },
          { id: operatorId, role: 'operator' },
          '2026-11-06',
        ),
        (error: unknown) => error instanceof HttpError && error.statusCode === 404,
      )
      assert.equal(marked.stages[0].operators[0].startDate, '2026-11-06')
      assert.equal(marked.stages[0].operators[0].durationDays, 5)
      assert.equal(marked.stages[0].subtasks.filter((subtask) => subtask.done).length, 1)
      assert.equal(marked.stages[0].color, 'green')
      await assert.rejects(
        () => updateSubtask(client, project.id, pauta.id, ler.id, { name: 'Outro' }, { id: operatorId, role: 'operator' }, '2026-11-06'),
        (error: unknown) => error instanceof HttpError && error.statusCode === 403,
      )

      const saved = await saveTemplate(client, template.id, {
        name: template.name,
        stages: [
          { id: template.stages[0].id, name: 'Pauta nova' },
          { name: 'Fechamento' },
        ],
      })
      const after = await getProject(client, project.id)
      assert.ok(after)
      assert.equal(after.stages.length, 2)
      assert.equal(after.stages[0].id, pauta.id)
      assert.equal(after.stages[0].name, 'Pauta nova')
      assert.equal(after.stages[0].operators.length, 1)
      assert.equal(after.stages[0].operators[0].id, operatorId)
      assert.equal(after.stages[0].subtasks.length, 2)
      assert.equal(after.stages[0].durationDays, 3)
      assert.equal(after.stages[0].activatedAt, '2026-11-06')
      assert.equal(after.stages[1].name, 'Fechamento')
      assert.equal(after.stages[1].activatedAt, null)
      assert.equal(after.stages.some((stage) => stage.id === revisao.id), false)
      const gone = await client.query('SELECT COUNT(*)::int AS n FROM subtasks WHERE stage_id = $1', [revisao.id])
      assert.equal(gone.rows[0].n, 0)
      assert.equal(saved.stages.map((stage) => stage.name).join(','), 'Pauta nova,Fechamento')

      const list = projectListFields(after, true)
      assert.equal(list.subtasksDone, 1)
      assert.equal(list.subtasksTotal, 2)
      assert.equal(list.statusPercent, 50)
      assert.equal(list.overall, 'Em andamento')
      assert.equal(list.stages[0].color, 'green')

      await archiveProject(client, project.id)
      await saveTemplate(client, template.id, {
        name: template.name,
        stages: saved.stages.map((stage) => ({ id: stage.id, name: stage.name === 'Pauta nova' ? 'Pauta arquivada' : stage.name })),
      })
      const archived = await getProject(client, project.id)
      assert.equal(archived?.archived, true)
      assert.equal(archived?.stages[0].name, 'Pauta arquivada')
      assert.equal(archived?.stages[0].operators.length, 1)
      const visible = await listProjects(client, {})
      assert.equal(visible.some((item) => item.id === project.id), false)

      const single = await createTemplate(client, {
        name: `Único ${randomUUID()}`,
        stages: [{ name: 'Fecho' }],
      })
      const doneProject = await createProject(client, {
        name: `Fechado ${randomUUID()}`,
        startDate: '2026-11-01',
        templateId: single.id,
      })
      const closed = await createSubtask(client, doneProject.id, doneProject.stages[0].id, { name: 'Fechar' })
      await updateSubtask(
        client,
        doneProject.id,
        doneProject.stages[0].id,
        closed.stages[0].subtasks[0].id,
        { allocation: { userId: operatorId, startDate: '2026-11-01', durationDays: 2 } },
        { id: operatorId, role: 'admin' },
        '2026-11-06',
      )
      const green = await updateSubtask(
        client,
        doneProject.id,
        doneProject.stages[0].id,
        closed.stages[0].subtasks[0].id,
        { done: true },
        { id: operatorId, role: 'operator' },
        '2026-11-06',
      )
      const summary = projectListFields(green, true)
      assert.equal(summary.subtasksDone, 1)
      assert.equal(summary.subtasksTotal, 1)
      assert.equal(summary.statusPercent, 100)
      assert.equal(summary.overall, 'Concluído')
      assert.deepEqual(summary.stages.map((stage) => stage.color), ['green'])

      const ordered = await createTemplate(client, {
        name: `Ordem ${randomUUID()}`,
        stages: [{ name: 'Alpha' }, { name: 'Beta' }],
      })
      const flowing = await createProject(client, {
        name: `Fluxo ${randomUUID()}`,
        startDate: '2026-11-02',
        templateId: ordered.id,
      })
      const conducted = await createSubtask(client, flowing.id, flowing.stages[0].id, { name: 'Conduzir' })
      await updateSubtask(
        client,
        flowing.id,
        flowing.stages[0].id,
        conducted.stages[0].subtasks[0].id,
        { allocation: { userId: operatorId, startDate: '2026-11-02', durationDays: 3 } },
        { id: operatorId, role: 'admin' },
        '2026-11-06',
      )
      const completed = await updateSubtask(
        client,
        flowing.id,
        flowing.stages[0].id,
        conducted.stages[0].subtasks[0].id,
        { done: true },
        { id: operatorId, role: 'operator' },
        '2026-11-06',
      )
      assert.equal(completed.stages[1].activatedAt, '2026-11-06')
      await saveTemplate(client, ordered.id, {
        name: ordered.name,
        stages: [
          { id: ordered.stages[1].id, name: 'Beta' },
          { id: ordered.stages[0].id, name: 'Alpha' },
        ],
      })
      const reordered = await getProject(client, flowing.id)
      assert.deepEqual(reordered?.stages.map((stage) => stage.name), ['Beta', 'Alpha'])
      const alpha = reordered?.stages[1]
      assert.equal(alpha?.id, flowing.stages[0].id)
      assert.equal(alpha?.activatedAt, '2026-11-02')
      assert.equal(alpha?.operators[0].completed, true)
      assert.ok(reordered?.stages[0].activatedAt)

      await client.query('UPDATE project_stages SET activated_at = NULL WHERE project_id = $1', [flowing.id])
      const dormant = await saveTemplate(client, ordered.id, {
        name: ordered.name,
        stages: [{ name: 'Antes' }, ...reordered!.stages.map((stage) => ({ id: stage.id === alpha?.id ? ordered.stages[0].id : ordered.stages[1].id, name: stage.name }))],
      })
      const awakened = await getProject(client, flowing.id)
      assert.equal(awakened?.stages[0].name, 'Antes')
      assert.equal(awakened?.stages[0].activatedAt, '2026-11-02')
      assert.equal(awakened?.stages[1].activatedAt, null)
      assert.equal(dormant.stages[0].name, 'Antes')

      const kept = await createProject(client, {
        name: `Mantém ${randomUUID()}`,
        startDate: '2026-11-03',
        templateId: ordered.id,
      })
      const front = await saveTemplate(client, ordered.id, {
        name: ordered.name,
        stages: [{ name: 'Nova frente' }, ...dormant.stages.map((stage) => ({ id: stage.id, name: stage.name }))],
      })
      const shifted = await getProject(client, kept.id)
      assert.equal(shifted?.stages[0].name, 'Nova frente')
      assert.equal(shifted?.stages[0].activatedAt, null)
      assert.equal(shifted?.stages[1].activatedAt, '2026-11-03')
      assert.ok(front.stages.some((stage) => stage.name === 'Nova frente'))
    })
  })

  it('pinta a etapa pela conclusão de cada operador e ativa a seguinte', async () => {
    await withRollback(async (client) => {
      const firstId = randomUUID()
      const secondId = randomUUID()
      const password = await hashPassword('senha-teste')
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador Um', $2, $3, 'operator', true),
                ($4, 'Operador Dois', $5, $3, 'operator', true)`,
        [firstId, `um-${firstId}@example.com`, password, secondId, `dois-${secondId}@example.com`],
      )
      const template = await createTemplate(client, {
        name: `Dois ${randomUUID()}`,
        stages: [{ name: 'Pauta' }, { name: 'Revisão' }],
      })
      const project = await createProject(client, {
        name: `Livro ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const admin = { id: firstId, role: 'admin' as const }
      const today = '2026-11-06'
      const withFirst = await createSubtask(client, project.id, stageId, { name: 'Operador Um' })
      const withSecond = await createSubtask(client, project.id, stageId, { name: 'Operador Dois' })
      const firstTaskId = withFirst.stages[0].subtasks[0].id
      const secondTaskId = withSecond.stages[0].subtasks[1].id
      const allocation = { startDate: today, durationDays: 1 }
      await updateSubtask(
        client,
        project.id,
        stageId,
        firstTaskId,
        { allocation: { userId: firstId, ...allocation } },
        admin,
        today,
      )
      const noneDone = await updateSubtask(
        client,
        project.id,
        stageId,
        secondTaskId,
        { allocation: { userId: secondId, ...allocation } },
        admin,
        today,
      )
      assert.equal(noneDone.stages[0].color, 'blue')
      assert.equal(noneDone.stages[1].activatedAt, null)

      const oneDone = await updateSubtask(
        client,
        project.id,
        stageId,
        firstTaskId,
        { done: true },
        admin,
        today,
      )
      assert.equal(oneDone.stages[0].color, 'yellow')
      assert.equal(oneDone.stages[0].operators.find((operator) => operator.id === firstId)?.completed, true)
      assert.equal(oneDone.stages[0].operators.find((operator) => operator.id === secondId)?.completed, false)
      assert.equal(oneDone.stages[1].activatedAt, null)
      assert.equal(projectListFields(oneDone, true).stages[0].color, 'yellow')

      const bothDone = await updateSubtask(
        client,
        project.id,
        stageId,
        secondTaskId,
        { done: true },
        admin,
        today,
      )
      assert.equal(bothDone.stages[0].color, 'green')
      assert.equal(bothDone.stages[1].activatedAt, today)
      const summary = projectListFields(bothDone, true)
      assert.equal(summary.stages[0].color, 'green')
      assert.equal(summary.overall, 'Em andamento')

      const unchecked = await updateSubtask(
        client,
        project.id,
        stageId,
        firstTaskId,
        { done: false },
        admin,
        today,
      )
      assert.equal(unchecked.stages[0].color, 'yellow')
      assert.equal(unchecked.stages[1].activatedAt, today)

      const backToBlue = await updateSubtask(
        client,
        project.id,
        stageId,
        secondTaskId,
        { done: false },
        admin,
        today,
      )
      assert.equal(backToBlue.stages[0].color, 'blue')
    })
  })
})
