import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Cada arquivo sobe um Postgres inteiro (PGlite) em memória e roda as migrations no
    // beforeAll. Com os arquivos em paralelo e o `pnpm dev` aberto ao lado, isso passa dos
    // 10 s padrão; não é teste travado, é o banco nascendo.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
})
