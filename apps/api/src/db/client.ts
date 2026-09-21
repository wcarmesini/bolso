import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema'

// A API roda a partir de apps/api (em dev, nos testes e no Docker): as migrations ficam em ./drizzle
const migrationsFolder = resolve(process.cwd(), 'drizzle')

type Options =
  | { kind: 'postgres'; url: string }
  // dataDir ausente = banco só em memória (usado nos testes)
  | { kind: 'pglite'; dataDir?: string }

/**
 * Produção: Postgres de verdade (DATABASE_URL).
 * Desenvolvimento e testes: PGlite, o mesmo Postgres rodando dentro do Node — nada para instalar.
 * O código da API é igual nos dois casos.
 */
export async function createDatabase(options: Options) {
  if (options.kind === 'postgres') {
    const client = postgres(options.url, { max: 10 })
    const db = drizzlePostgres(client, { schema })
    await migratePostgres(db, { migrationsFolder })
    const database: Database = db
    return { db: database, close: () => client.end() }
  }

  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true })
  const client = new PGlite(options.dataDir)
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder })
  const database: Database = db
  return { db: database, close: () => client.close() }
}

// Tipo comum aos dois drivers: o resto da API não sabe (nem precisa saber) qual está em uso
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>
