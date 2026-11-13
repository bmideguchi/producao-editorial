import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import type { PoolClient } from 'pg'
import { createPool } from '../src/db.ts'
import { createClient, createProject, createService, createTemplate, deleteClient, deleteService, getProject, listServices, updateProject, updateService } from '../src/data.ts'
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

describe('escopo do projeto', () => {
  it('guarda a duração do projeto, sem alterar o catálogo, e impede excluir cliente em uso', async () => {
    await withRollback(async (client) => {
      const service = await createService(client, { name: `Revisão ${randomUUID()}`, allocationDays: 0.25 })
      assert.equal(service.allocationDays, 0.25)
      const template = await createTemplate(client, {
        name: `Template ${randomUUID()}`,
        stages: [{ name: 'Pauta' }],
      })
      const project = await createProject(client, {
        name: `Projeto ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
        scope: [{ serviceId: service.id, quantity: 4 }],
      })
      assert.equal(project.scope.length, 1)
      assert.equal(project.scope[0].quantity, 4)
      assert.equal(project.scope[0].allocationDays, 0.25)
      assert.equal(project.stages[0].name, 'Pauta')

      const other = await createProject(client, {
        name: `Outro ${randomUUID()}`,
        startDate: '2026-11-06',
        templateId: template.id,
        scope: [{ serviceId: service.id, quantity: 1 }],
      })
      assert.equal(other.scope[0].allocationDays, 0.25)

      const updated = await updateProject(client, project.id, {
        scope: [{ serviceId: service.id, quantity: 2, allocationDays: 0.5 }],
      })
      assert.equal(updated.scope[0].quantity, 2)
      assert.equal(updated.scope[0].allocationDays, 0.5)
      const kept = await getProject(client, project.id)
      assert.equal(kept?.scope[0].serviceName, service.name)
      assert.equal(kept?.scope[0].allocationDays, 0.5)

      const catalog = await listServices(client)
      assert.equal(catalog.find((item) => item.id === service.id)?.allocationDays, 0.25)
      const untouched = await getProject(client, other.id)
      assert.equal(untouched?.scope[0].allocationDays, 0.25)

      await updateService(client, service.id, { allocationDays: 1 })
      const afterCatalog = await getProject(client, project.id)
      assert.equal(afterCatalog?.scope[0].allocationDays, 0.5)
      const catalogAfter = await listServices(client)
      assert.equal(catalogAfter.find((item) => item.id === service.id)?.allocationDays, 1)

      const catalogClient = await createClient(client, { name: '  SAEB temporário  ' })
      assert.equal(catalogClient.name, 'SAEB temporário')
      const described = await updateProject(client, project.id, {
        description: '  Desafios de matemática  ',
        clientId: catalogClient.id,
      })
      assert.equal(described.description, 'Desafios de matemática')
      assert.equal(described.clientId, catalogClient.id)
      assert.equal(described.clientName, 'SAEB temporário')
      assert.equal(described.name, project.name)
      assert.equal(described.scope[0].quantity, 2)
      assert.equal(described.scope[0].allocationDays, 0.5)
      assert.equal(described.stages[0].subtasks.length, project.stages[0].subtasks.length)

      await client.query('SAVEPOINT referenced_client')
      await assert.rejects(
        () => deleteClient(client, catalogClient.id),
        (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23503',
      )
      await client.query('ROLLBACK TO SAVEPOINT referenced_client')

      const cleared = await updateProject(client, project.id, { clientId: null })
      assert.equal(cleared.clientId, null)
      assert.equal(cleared.clientName, '')
      assert.equal(cleared.description, 'Desafios de matemática')
      assert.equal(cleared.scope[0].quantity, 2)
      assert.equal(cleared.scope[0].allocationDays, 0.5)
      await deleteClient(client, catalogClient.id)

      await assert.rejects(
        () => deleteService(client, service.id),
        (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23503',
      )
    })
  })
})
