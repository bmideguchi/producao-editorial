import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { before, after, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { createPool } from '../src/db.ts'
import { createProject, createTemplate, getProject, saveTemplate, updateSubtask } from '../src/data.ts'
import { HttpError } from '../src/http.ts'
import { migrate } from '../src/migrate.ts'

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  const password = env.match(/^APP_DB_PASSWORD=(.*)$/m)?.[1]?.trim()
  const database = env.match(/^POSTGRES_DB=(.*)$/m)?.[1]?.trim()
  if (!password || !database) throw new Error('Defina DATABASE_URL ou APP_DB_PASSWORD no .env.')
  return `postgresql://editorial_app:${encodeURIComponent(password)}@127.0.0.1:54329/${database}`
}

const pool = createPool(databaseUrl())

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

describe('tarefas do template', () => {
  it('copia nome, duração e dependência e não reescreve a tarefa do projeto', async () => {
    await withRollback(async (client) => {
      const ler = randomUUID()
      const escrever = randomUUID()
      const template = await createTemplate(client, {
        name: `Template ${randomUUID()}`,
        stages: [{
          name: 'Pauta',
          tasks: [
            { id: ler, name: 'Ler', durationDays: 2 },
            { id: escrever, name: 'Escrever', durationDays: 3, predecessorId: ler },
          ],
        }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      const copied = project.stages[0].subtasks
      const copiedLer = copied.find((task) => task.name === 'Ler')
      const copiedEscrever = copied.find((task) => task.name === 'Escrever')
      assert.ok(copiedLer)
      assert.ok(copiedEscrever)
      assert.equal(copiedLer.durationDays, 2)
      assert.equal(copiedLer.predecessorId, null)
      assert.equal(copiedLer.assignee, null)
      assert.equal(copiedLer.startDate, null)
      assert.equal(copiedEscrever.durationDays, 3)
      assert.equal(copiedEscrever.predecessorId, copiedLer.id)
      assert.notEqual(copiedEscrever.predecessorId, escrever)
      assert.equal(copiedEscrever.assignee, null)
      assert.equal(copiedEscrever.startDate, null)

      await saveTemplate(client, template.id, {
        name: template.name,
        stages: [{
          id: template.stages[0].id,
          name: 'Pauta',
          tasks: [
            { id: ler, name: 'Ler tudo', durationDays: 9 },
            { id: escrever, name: 'Redigir', durationDays: 4, predecessorId: null },
          ],
        }],
      })
      const afterEdit = await getProject(client, project.id)
      const stillLer = afterEdit?.stages[0].subtasks.find((task) => task.id === copiedLer.id)
      const stillEscrever = afterEdit?.stages[0].subtasks.find((task) => task.id === copiedEscrever.id)
      assert.equal(stillLer?.name, 'Ler')
      assert.equal(stillLer?.durationDays, 2)
      assert.equal(stillEscrever?.name, 'Escrever')
      assert.equal(stillEscrever?.durationDays, 3)
      assert.equal(stillEscrever?.predecessorId, copiedLer.id)

      const checar = randomUUID()
      const publicar = randomUUID()
      await saveTemplate(client, template.id, {
        name: template.name,
        stages: [
          { id: template.stages[0].id, name: 'Pauta' },
          {
            name: 'Fechamento',
            tasks: [
              { id: checar, name: 'Checar', durationDays: 1 },
              { id: publicar, name: 'Publicar', durationDays: 2, predecessorId: checar },
            ],
          },
        ],
      })
      const grown = await getProject(client, project.id)
      assert.equal(grown?.stages.length, 2)
      assert.equal(grown?.stages[0].subtasks.find((task) => task.id === copiedLer.id)?.name, 'Ler')
      const fechamento = grown?.stages.find((stage) => stage.name === 'Fechamento')
      assert.ok(fechamento)
      const copiedChecar = fechamento.subtasks.find((task) => task.name === 'Checar')
      const copiedPublicar = fechamento.subtasks.find((task) => task.name === 'Publicar')
      assert.equal(copiedChecar?.durationDays, 1)
      assert.equal(copiedChecar?.assignee, null)
      assert.equal(copiedChecar?.startDate, null)
      assert.equal(copiedPublicar?.durationDays, 2)
      assert.equal(copiedPublicar?.predecessorId, copiedChecar?.id)
      assert.equal(copiedPublicar?.assignee, null)
      assert.equal(copiedPublicar?.startDate, null)
      const stored = await client.query<{ name: string; duration_days: number }>(
        'SELECT name, duration_days FROM template_tasks WHERE id = $1',
        [ler],
      )
      assert.equal(stored.rows[0].name, 'Ler tudo')
      assert.equal(Number(stored.rows[0].duration_days), 9)
    })
  })

  it('recusa ciclo e predecessora além da etapa anterior', async () => {
    await withRollback(async (client) => {
      const primeira = randomUUID()
      const segunda = randomUUID()
      await assert.rejects(
        () => createTemplate(client, {
          name: `Ciclo ${randomUUID()}`,
          stages: [{
            name: 'Pauta',
            tasks: [
              { id: primeira, name: 'Primeira', durationDays: 1, predecessorId: segunda },
              { id: segunda, name: 'Segunda', durationDays: 1, predecessorId: primeira },
            ],
          }],
        }),
        (error: unknown) => error instanceof HttpError
          && error.statusCode === 400
          && error.message === 'Essa predecessora fecharia um ciclo.',
      )

      const antiga = randomUUID()
      const atual = randomUUID()
      await assert.rejects(
        () => createTemplate(client, {
          name: `Longe ${randomUUID()}`,
          stages: [
            { name: 'Pauta', tasks: [{ id: antiga, name: 'Antiga', durationDays: 1 }] },
            { name: 'Revisão' },
            {
              name: 'Fechamento',
              tasks: [{ id: atual, name: 'Atual', durationDays: 2, predecessorId: antiga }],
            },
          ],
        }),
        (error: unknown) => error instanceof HttpError
          && error.statusCode === 400
          && error.message === 'A predecessora não pode ser de uma etapa anterior à imediatamente anterior.',
      )
    })
  })

  it('excluir o template mantém as tarefas do projeto editáveis', async () => {
    await withRollback(async (client) => {
      const template = await createTemplate(client, {
        name: `Solto ${randomUUID()}`,
        stages: [{
          name: 'Pauta',
          tasks: [{ name: 'Ler', durationDays: 2 }],
        }],
      })
      const project = await createProject(client, {
        name: `Projeto solto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
      })
      await client.query('DELETE FROM templates WHERE id = $1', [template.id])
      const kept = await getProject(client, project.id)
      assert.ok(kept)
      assert.equal(kept.templateId, null)
      assert.equal(kept.stages.length, 1)
      assert.equal(kept.stages[0].name, 'Pauta')
      assert.equal(kept.stages[0].subtasks.length, 1)
      const task = kept.stages[0].subtasks[0]
      const updated = await updateSubtask(
        client,
        project.id,
        kept.stages[0].id,
        task.id,
        { name: 'Ler de novo' },
        { id: randomUUID(), role: 'admin' },
        '2026-11-06',
      )
      assert.equal(updated.stages[0].subtasks[0].name, 'Ler de novo')
      assert.equal(updated.stages[0].subtasks[0].durationDays, 2)
    })
  })
})
