import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'
import { requireDatabaseConfig } from './connection-string'

async function migrate(): Promise<void> {
  const pool = new Pool(
    process.env.DATABASE_MIGRATION_URL
      ? { connectionString: process.env.DATABASE_MIGRATION_URL }
      : requireDatabaseConfig(),
  )
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(892811020)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const migrationsDirectory = join(__dirname, 'migrations')
    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const filename of files) {
      const source = await readFile(join(migrationsDirectory, filename), 'utf8')
      const checksum = createHash('sha256').update(source).digest('hex')
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename],
      )
      if (applied.rowCount) {
        if (applied.rows[0]?.checksum !== checksum) {
          throw new Error(
            `Migration ${filename} was modified after application`,
          )
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(source)
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(892811020)')
      .catch(() => undefined)
    client.release()
    await pool.end()
  }
}

migrate().catch((error: unknown) => {
  console.error('Database migration failed', error)
  process.exitCode = 1
})
