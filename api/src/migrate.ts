import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool, PoolClient } from 'pg'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function ensureSchema(pool: Pool): Promise<void> {
  const existing = await pool.query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'editorial'`,
  )
  if (!existing.rowCount) await pool.query('CREATE SCHEMA editorial')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS editorial.schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

export async function migrate(pool: Pool): Promise<void> {
  await ensureSchema(pool)
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM editorial.schema_migrations WHERE id = $1', [file])
    if (applied.rowCount) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO editorial.schema_migrations (id) VALUES ($1)', [file])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

export async function withTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
