import { defineConfig } from 'drizzle-kit'

// `pnpm --filter api db:generate` cria a migration SQL a partir do schema (sem precisar de banco)
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
})
