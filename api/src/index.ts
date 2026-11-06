import { createPool } from './db.js'
import { buildApp } from './app.js'
import { saoPauloToday } from './domain.js'
import { migrate } from './migrate.js'
import { seed } from './seed.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('Defina DATABASE_URL.')

const pool = createPool(connectionString)
const port = Number(process.env.PORT ?? 8080)

await migrate(pool)
await seed(pool)

const app = await buildApp(pool, {
  today: () => saoPauloToday(),
  now: () => new Date(),
})

await app.listen({ port, host: '0.0.0.0' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().finally(() => pool.end())
  })
}
