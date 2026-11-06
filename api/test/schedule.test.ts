import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { createPool } from '../src/db.ts'
import {
  activateStage,
  createProject,
  createSubtask,
  createTemplate,
  updateSubtask,
  type SubtaskDetail,
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

describe('cronograma da tarefa', () => {
  it('mede tarefas paralelas pelo intervalo e não pela soma', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Intervalo ${randomUUID()}`,
        stages: [{ name: 'Conteúdo' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-01',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const first = await createSubtask(client, project.id, stageId, { name: 'Matemática', durationDays: 5 })
      const second = await createSubtask(client, project.id, stageId, { name: 'Português', durationDays: 5 })
      const math = taskNamed(first.stages[0].subtasks, 'Matemática')
      const portuguese = taskNamed(second.stages[0].subtasks, 'Português')
      const scheduled = await updateSubtask(
        client,
        project.id,
        stageId,
        portuguese.id,
        { startDate: '2026-11-16', durationDays: 5 },
        admin,
        today,
      )
      const aligned = await updateSubtask(
        client,
        project.id,
        stageId,
        math.id,
        { startDate: '2026-11-16', durationDays: 5 },
        admin,
        today,
      )
      const stage = aligned.stages[0]
      assert.equal(scheduled.stages[0].subtasks.find((task) => task.name === 'Português')?.endDate, '2026-11-20')
      assert.deepEqual(
        stage.subtasks.map((task) => [task.name, task.startDate, task.endDate]),
        [
          ['Matemática', '2026-11-16', '2026-11-20'],
          ['Português', '2026-11-16', '2026-11-20'],
        ],
      )
      assert.equal(stage.durationDays, 5)
      assert.equal(Object.hasOwn(stage, 'scheduleWarning'), false)
    })
  })

  it('aceita predecessora da etapa anterior, empurra a etapa seguinte e recusa duas etapas atrás', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Etapas ${randomUUID()}`,
        stages: [{ name: 'Planejamento' }, { name: 'Conteúdo' }, { name: 'Revisão' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const [planejamento, conteudo, revisao] = project.stages
      await createSubtask(client, project.id, planejamento.id, { name: 'Planejar', durationDays: 2 })
      const seeded = await createSubtask(client, project.id, conteudo.id, { name: 'Escrever', durationDays: 4 })
      const withReview = await createSubtask(client, project.id, revisao.id, { name: 'Revisar', durationDays: 1 })
      const planejar = taskNamed(seeded.stages[0].subtasks, 'Planejar')
      const escrever = taskNamed(seeded.stages[1].subtasks, 'Escrever')
      const revisar = taskNamed(withReview.stages[2].subtasks, 'Revisar')
      const linked = await updateSubtask(
        client,
        project.id,
        conteudo.id,
        escrever.id,
        { predecessorId: planejar.id, startDate: '2027-01-01' },
        admin,
        today,
      )
      const chained = await updateSubtask(
        client,
        project.id,
        revisao.id,
        revisar.id,
        { predecessorId: escrever.id },
        admin,
        today,
      )
      assert.equal(taskNamed(linked.stages[1].subtasks, 'Escrever').startDate, '2026-11-10')
      assert.equal(taskNamed(linked.stages[1].subtasks, 'Escrever').endDate, '2026-11-13')
      assert.equal(taskNamed(chained.stages[2].subtasks, 'Revisar').startDate, '2026-11-16')
      const pushed = await updateSubtask(
        client,
        project.id,
        planejamento.id,
        planejar.id,
        { durationDays: 5 },
        admin,
        today,
      )
      assert.equal(taskNamed(pushed.stages[0].subtasks, 'Planejar').endDate, '2026-11-12')
      assert.equal(taskNamed(pushed.stages[1].subtasks, 'Escrever').startDate, '2026-11-13')
      assert.equal(taskNamed(pushed.stages[1].subtasks, 'Escrever').endDate, '2026-11-18')
      assert.equal(taskNamed(pushed.stages[2].subtasks, 'Revisar').startDate, '2026-11-19')
      assert.equal(taskNamed(pushed.stages[2].subtasks, 'Revisar').endDate, '2026-11-19')
      await assert.rejects(
        () => updateSubtask(
          client,
          project.id,
          revisao.id,
          revisar.id,
          { predecessorId: planejar.id, durationDays: 9 },
          admin,
          today,
        ),
        (error: unknown) => error instanceof HttpError
          && error.statusCode === 400
          && error.message === 'A predecessora não pode ser de uma etapa anterior à imediatamente anterior.',
      )
      const untouched = await client.query<{ duration_days: number; predecessor_id: string | null }>(
        'SELECT duration_days, predecessor_id FROM subtasks WHERE id = $1',
        [revisar.id],
      )
      assert.equal(untouched.rows[0].duration_days, 1)
      assert.equal(untouched.rows[0].predecessor_id, escrever.id)
    })
  })

  it('recalcula a cadeia e ignora início manual com predecessora', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Cronograma ${randomUUID()}`,
        stages: [{ name: 'Pauta' }, { name: 'Revisão' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const pauta = project.stages[0]
      const revisao = project.stages[1]
      await createSubtask(client, project.id, pauta.id, { name: 'Ler', durationDays: 2 })
      await createSubtask(client, project.id, pauta.id, { name: 'Entrevistar', durationDays: 3 })
      const seeded = await createSubtask(client, project.id, pauta.id, { name: 'Fechar', durationDays: 1 })
      const stage = seeded.stages[0]
      assert.equal(stage.color, 'gray')
      const ler = taskNamed(stage.subtasks, 'Ler')
      const entrevistar = taskNamed(stage.subtasks, 'Entrevistar')
      const fechar = taskNamed(stage.subtasks, 'Fechar')
      assert.deepEqual(
        stage.subtasks.map((task) => [task.name, task.startDate, task.endDate]),
        [
          ['Ler', '2026-11-06', '2026-11-09'],
          ['Entrevistar', '2026-11-06', '2026-11-10'],
          ['Fechar', '2026-11-06', '2026-11-06'],
        ],
      )
      assert.equal(stage.durationDays, 3)
      assert.equal(Object.hasOwn(stage, 'scheduleWarning'), false)

      const linked = await updateSubtask(
        client,
        project.id,
        pauta.id,
        entrevistar.id,
        { predecessorId: ler.id, startDate: '2027-01-01' },
        admin,
        today,
      )
      const afterLink = linked.stages[0]
      assert.equal(afterLink.color, 'gray')
      assert.deepEqual(taskNamed(afterLink.subtasks, 'Entrevistar'), {
        ...taskNamed(afterLink.subtasks, 'Entrevistar'),
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        predecessorId: ler.id,
      })

      const chained = await updateSubtask(
        client,
        project.id,
        pauta.id,
        fechar.id,
        { predecessorId: entrevistar.id },
        admin,
        today,
      )
      await updateSubtask(client, project.id, pauta.id, ler.id, { durationDays: 4 }, admin, today)
      const pushed = (await updateSubtask(
        client,
        project.id,
        pauta.id,
        entrevistar.id,
        { startDate: '2027-02-01' },
        admin,
        today,
      )).stages[0]
      assert.equal(Object.hasOwn(pushed, 'scheduleWarning'), false)
      assert.equal(pushed.color, 'gray')
      assert.deepEqual(
        pushed.subtasks.map((task) => [task.name, task.startDate, task.endDate]),
        [
          ['Ler', '2026-11-06', '2026-11-11'],
          ['Entrevistar', '2026-11-12', '2026-11-16'],
          ['Fechar', '2026-11-17', '2026-11-17'],
        ],
      )
      assert.equal(chained.stages[0].subtasks.find((task) => task.name === 'Fechar')?.predecessorId, entrevistar.id)

      const opened = await updateSubtask(
        client,
        project.id,
        pauta.id,
        entrevistar.id,
        { predecessorId: null, startDate: '2026-11-06' },
        admin,
        today,
      )
      const released = await updateSubtask(
        client,
        project.id,
        pauta.id,
        fechar.id,
        { predecessorId: null, startDate: '2026-11-06' },
        admin,
        today,
      )
      assert.equal(opened.stages[0].subtasks.find((task) => task.name === 'Entrevistar')?.predecessorId, null)
      assert.equal(Object.hasOwn(released.stages[0], 'scheduleWarning'), false)
      assert.equal(released.stages[0].color, 'gray')
      assert.equal(taskNamed(released.stages[0].subtasks, 'Fechar').endDate, '2026-11-06')

      const outside = await createSubtask(client, project.id, revisao.id, { name: 'Outra etapa', durationDays: 1 })
      const other = taskNamed(outside.stages[1].subtasks, 'Outra etapa')
      assert.equal(other.startDate, '2026-11-06')
      await assert.rejects(
        () => updateSubtask(
          client,
          project.id,
          pauta.id,
          ler.id,
          { predecessorId: other.id, durationDays: 9 },
          admin,
          today,
        ),
        (error: unknown) => error instanceof HttpError
          && error.statusCode === 400
          && error.message === 'A predecessora não pode ser de uma etapa posterior.',
      )
      const untouched = await client.query<{ duration_days: number; predecessor_id: string | null }>(
        'SELECT duration_days, predecessor_id FROM subtasks WHERE id = $1',
        [ler.id],
      )
      assert.equal(untouched.rows[0].duration_days, 4)
      assert.equal(untouched.rows[0].predecessor_id, null)
    })
  })

  it('recusa auto-vínculo e ciclo indireto sem gravar a predecessora', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Ciclo ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const first = await createSubtask(client, project.id, stageId, { name: 'A', durationDays: 1 })
      const second = await createSubtask(client, project.id, stageId, { name: 'B', durationDays: 1 })
      const third = await createSubtask(client, project.id, stageId, { name: 'C', durationDays: 1 })
      const a = taskNamed(first.stages[0].subtasks, 'A')
      const b = taskNamed(second.stages[0].subtasks, 'B')
      const c = taskNamed(third.stages[0].subtasks, 'C')
      await assert.rejects(
        () => updateSubtask(client, project.id, stageId, a.id, { predecessorId: a.id }, admin, today),
        (error: unknown) => error instanceof HttpError && error.message === 'A tarefa não pode ser predecessora de si mesma.',
      )
      await updateSubtask(client, project.id, stageId, b.id, { predecessorId: a.id }, admin, today)
      await updateSubtask(client, project.id, stageId, c.id, { predecessorId: b.id }, admin, today)
      await assert.rejects(
        () => updateSubtask(client, project.id, stageId, a.id, { predecessorId: c.id }, admin, today),
        (error: unknown) => error instanceof HttpError && error.message === 'Essa predecessora fecharia um ciclo.',
      )
      const stored = await client.query<{ predecessor_id: string | null }>(
        'SELECT predecessor_id FROM subtasks WHERE id = $1',
        [a.id],
      )
      assert.equal(stored.rows[0].predecessor_id, null)
    })
  })

  it('ancora tarefa sem predecessora na ativação e só deixa o alocado marcar feita', async () => {
    await withRollback(async (client) => {
      const operatorId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador cronograma', $2, $3, 'operator', true)`,
        [operatorId, `op-${operatorId}@example.com`, await hashPassword('senha-teste')],
      )
      const template = await createTemplate(client, {
        name: `Âncora ${randomUUID()}`,
        stages: [{ name: 'Pauta' }, { name: 'Revisão' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-01',
        templateId: template.id,
      })
      const longa = await createSubtask(client, project.id, project.stages[0].id, { name: 'Longa', durationDays: 10 })
      const espera = await createSubtask(client, project.id, project.stages[1].id, { name: 'Esperar', durationDays: 2 })
      assert.equal(longa.stages[0].forecastEnd, '2026-11-13')
      const waiting = taskNamed(espera.stages[1].subtasks, 'Esperar')
      assert.equal(waiting.startDate, '2026-11-01')
      assert.equal(waiting.endDate, '2026-11-03')
      const activated = await activateStage(client, project.id, project.stages[1].id, '2026-11-20')
      const moved = taskNamed(activated.stages[1].subtasks, 'Esperar')
      assert.equal(moved.startDate, '2026-11-20')
      assert.equal(moved.endDate, '2026-11-23')
      assert.equal(Object.hasOwn(activated.stages[1], 'scheduleWarning'), false)

      const mine = taskNamed(activated.stages[0].subtasks, 'Longa')
      await updateSubtask(
        client,
        project.id,
        project.stages[0].id,
        mine.id,
        { allocation: { userId: operatorId, startDate: '2026-11-01', durationDays: 2 } },
        admin,
        today,
      )
      const operator = { id: operatorId, role: 'operator' as const }
      await assert.rejects(
        () => updateSubtask(client, project.id, project.stages[0].id, mine.id, { predecessorId: null }, operator, today),
        (error: unknown) => error instanceof HttpError && error.statusCode === 403,
      )
      const marked = await updateSubtask(
        client,
        project.id,
        project.stages[0].id,
        mine.id,
        { done: true },
        operator,
        today,
      )
      assert.equal(taskNamed(marked.stages[0].subtasks, 'Longa').done, true)
      await assert.rejects(
        () => updateSubtask(
          client,
          project.id,
          project.stages[1].id,
          moved.id,
          { done: true },
          operator,
          today,
        ),
        (error: unknown) => error instanceof HttpError && error.statusCode === 404,
      )
    })
  })

  it('conta 02/11 mais 5 dias úteis como 06/11 e pula o fim de semana fora dessa faixa', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Úteis ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-02',
        templateId: template.id,
      })
      const created = await createSubtask(client, project.id, project.stages[0].id, { name: 'Redigir', durationDays: 5 })
      const task = taskNamed(created.stages[0].subtasks, 'Redigir')
      assert.equal(task.startDate, '2026-11-02')
      assert.equal(task.endDate, '2026-11-06')
      assert.equal(created.stages[0].durationDays, 5)
      const friday = await updateSubtask(
        client,
        project.id,
        project.stages[0].id,
        task.id,
        { startDate: '2026-11-06', durationDays: 5 },
        admin,
        today,
      )
      const crossed = taskNamed(friday.stages[0].subtasks, 'Redigir')
      assert.equal(crossed.startDate, '2026-11-06')
      assert.equal(crossed.endDate, '2026-11-12')
    })
  })

  it('faz a sucessora começar no dia útil seguinte ao fim da predecessora', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Sucessora ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const first = await createSubtask(client, project.id, stageId, { name: 'Base', durationDays: 1 })
      const second = await createSubtask(client, project.id, stageId, { name: 'Depois', durationDays: 1 })
      const base = taskNamed(first.stages[0].subtasks, 'Base')
      const depois = taskNamed(second.stages[0].subtasks, 'Depois')
      assert.equal(base.endDate, '2026-11-06')
      const linked = await updateSubtask(
        client,
        project.id,
        stageId,
        depois.id,
        { predecessorId: base.id },
        admin,
        today,
      )
      const successor = taskNamed(linked.stages[0].subtasks, 'Depois')
      assert.equal(successor.startDate, '2026-11-09')
      assert.equal(successor.endDate, '2026-11-09')
    })
  })

  it('aceita o mesmo operador em duas tarefas da etapa', async () => {
    await withRollback(async (client) => {
      const operatorId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador Dois', $2, $3, 'operator', true)`,
        [operatorId, `dois-${operatorId}@example.com`, await hashPassword('senha-teste')],
      )
      const template = await createTemplate(client, {
        name: `Dupla ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const first = await createSubtask(client, project.id, stageId, { name: 'Uma', durationDays: 2 })
      const second = await createSubtask(client, project.id, stageId, { name: 'Outra', durationDays: 2 })
      const uma = taskNamed(first.stages[0].subtasks, 'Uma')
      const outra = taskNamed(second.stages[0].subtasks, 'Outra')
      const allocation = { userId: operatorId, startDate: '2026-11-06', durationDays: 2 }
      await updateSubtask(client, project.id, stageId, uma.id, { allocation }, admin, today)
      const both = await updateSubtask(client, project.id, stageId, outra.id, { allocation }, admin, today)
      const tasks = both.stages[0].subtasks
      assert.equal(taskNamed(tasks, 'Uma').assignee?.id, operatorId)
      assert.equal(taskNamed(tasks, 'Outra').assignee?.id, operatorId)
      assert.equal(taskNamed(tasks, 'Uma').assignee?.name, 'Operador Dois')
      assert.equal(both.stages[0].operators.length, 1)
    })
  })

  it('mantém nome, responsável e duração ao gravar a predecessora', async () => {
    await withRollback(async (client) => {
      const operatorId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active)
         VALUES ($1, 'Operador Dois', $2, $3, 'operator', true)`,
        [operatorId, `dois-${operatorId}@example.com`, await hashPassword('senha-teste')],
      )
      const template = await createTemplate(client, {
        name: `Preserva ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-05',
        templateId: template.id,
      })
      const stageId = project.stages[0].id
      const first = await createSubtask(client, project.id, stageId, { name: 'Base', durationDays: 1 })
      const second = await createSubtask(client, project.id, stageId, { name: 'Filha', durationDays: 4 })
      const base = taskNamed(first.stages[0].subtasks, 'Base')
      const filha = taskNamed(second.stages[0].subtasks, 'Filha')
      const prepared = await updateSubtask(
        client,
        project.id,
        stageId,
        filha.id,
        {
          name: 'Filha revista',
          durationDays: 4,
          done: true,
          allocation: { userId: operatorId, startDate: '2026-11-05', durationDays: 4 },
        },
        admin,
        today,
      )
      const before = taskNamed(prepared.stages[0].subtasks, 'Filha revista')
      const updated = await updateSubtask(
        client,
        project.id,
        stageId,
        filha.id,
        { predecessorId: base.id },
        admin,
        today,
      )
      const after = taskNamed(updated.stages[0].subtasks, 'Filha revista')
      assert.equal(after.name, 'Filha revista')
      assert.equal(after.done, true)
      assert.equal(after.durationDays, 4)
      assert.equal(after.assignee?.id, operatorId)
      assert.equal(after.assignee?.name, 'Operador Dois')
      assert.equal(after.assignee?.durationDays, before.assignee?.durationDays)
      assert.equal(after.predecessorId, base.id)
      assert.equal(after.startDate, '2026-11-06')
      assert.notEqual(after.startDate, before.startDate)
    })
  })
})
