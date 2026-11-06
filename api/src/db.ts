import pg from 'pg'

pg.types.setTypeParser(1082, (value) => value)

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    options: '-c search_path=editorial',
  })
}
