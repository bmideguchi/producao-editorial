import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { hashPassword } from './passwords.js'

const livro = [
  'Pauta',
  'Redação',
  'Preparação de originais',
  'Revisão',
  'Diagramação',
  'Revisão de prova',
  'Capa',
  'Aprovação',
  'Fechamento',
] as const

const revista = [
  'Pauta da edição',
  'Reportagem',
  'Edição',
  'Revisão',
  'Diagramação',
  'Prova',
  'Fechamento',
] as const

export async function seed(pool: Pool): Promise<void> {
  const users = await pool.query('SELECT COUNT(*)::int AS n FROM users')
  if (users.rows[0].n === 0) {
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
    const password = process.env.INITIAL_ADMIN_PASSWORD
    const name = process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador'
    if (!email || !password) {
      throw new Error('Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD para criar o primeiro administrador.')
    }
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, 'admin', true)`,
      [randomUUID(), name, email, await hashPassword(password)],
    )
  }

  const templates = await pool.query('SELECT COUNT(*)::int AS n FROM templates')
  if (templates.rows[0].n === 0) {
    await insertTemplate(pool, 'Livro', livro)
    await insertTemplate(pool, 'Revista', revista)
  }
}

async function insertTemplate(pool: Pool, name: string, stages: readonly string[]): Promise<void> {
  const templateId = randomUUID()
  await pool.query('INSERT INTO templates (id, name) VALUES ($1, $2)', [templateId, name])
  for (let index = 0; index < stages.length; index += 1) {
    await pool.query(
      `INSERT INTO template_stages (id, template_id, name, position)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), templateId, stages[index], index + 1],
    )
  }
}
