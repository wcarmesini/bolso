import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { accounts, bankConnections, pendingTransactions } from '../db/schema'
import { firstMembership } from '../groups'
import type { Deps } from '../http'
import { onInvalid } from '../http'

/*
 * Login de desenvolvimento: entra (ou cria a conta) só com nome e e-mail, sem Google/Apple/
 * Microsoft configurados. NUNCA é montado em produção (ver app.ts).
 *
 * Como não pede senha, só responde a quem chama da própria máquina. Isso importa quando o
 * app é exposto por um túnel (ngrok): de fora, qualquer um entraria com o e-mail dos outros.
 */
const DEV_PASSWORD = 'bolso-dev-password'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const isLocalRequest = (url: string) => LOCAL_HOSTS.has(new URL(url).hostname)

const devSignInSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email(),
})

/** Um banco de mentira, para ver a caixa de entrada funcionando sem credencial do Pluggy */
const bancoFalsoSchema = z.object({ accountId: z.uuid() })

export function devRoutes({ auth, db }: Deps) {
  return (
    new Hono()
      .post('/sign-in', zValidator('json', devSignInSchema, onInvalid), async (c) => {
        // Chamada de fora da máquina (túnel, celular na rede): a rota nem existe
        if (!isLocalRequest(c.req.url)) return c.json({ error: 'Endereço não encontrado.' }, 404)

        const { name, email } = c.req.valid('json')
        const headers = c.req.raw.headers
        const signIn = await auth.api.signInEmail({
          body: { email, password: DEV_PASSWORD },
          headers,
          asResponse: true,
        })
        if (signIn.ok) return signIn
        // Primeira vez: cria a conta (e o grupo pessoal, pelo gancho do auth.ts) e já entra
        return auth.api.signUpEmail({
          body: { name, email, password: DEV_PASSWORD },
          headers,
          asResponse: true,
        })
      })

      /*
       * Conecta um "banco" de mentira à conta escolhida e enche a caixa de entrada. Serve para
       * ver e testar a aprovação sem credencial do Pluggy — e, como o resto daqui, só existe
       * fora de produção e só atende chamadas da própria máquina.
       */
      .post('/banco-falso', zValidator('json', bancoFalsoSchema, onInvalid), async (c) => {
        if (!isLocalRequest(c.req.url)) return c.json({ error: 'Endereço não encontrado.' }, 404)
        const sessao = await auth.api.getSession({ headers: c.req.raw.headers })
        if (!sessao) return c.json({ error: 'Faça login para continuar.' }, 401)

        const membership =
          (sessao.session.activeOrganizationId
            ? { organizationId: sessao.session.activeOrganizationId }
            : undefined) ?? (await firstMembership(db, sessao.user.id))
        if (!membership) return c.json({ error: 'Sem orçamento.' }, 400)
        const groupId = membership.organizationId

        const { accountId } = c.req.valid('json')
        const [conta] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.groupId, groupId)))
          .limit(1)
        if (!conta) return c.json({ error: 'Conta não encontrada.' }, 400)

        const hoje = new Date()
        const diaAtras = (quantos: number) => {
          const data = new Date(hoje)
          data.setDate(data.getDate() - quantos)
          return data.toISOString().slice(0, 10)
        }

        const [conexao] = await db
          .insert(bankConnections)
          .values({
            groupId,
            itemId: `falso-${Date.now()}`,
            connectorName: 'Banco de Mentira',
            status: 'UPDATED',
            accountId,
            externalAccountId: `falso-conta-${Date.now()}`,
            externalAccountName: 'Corrente 12345-6',
            startDate: diaAtras(90),
            lastSyncedAt: new Date(),
            createdBy: sessao.user.id,
          })
          .returning()
        if (!conexao) return c.json({ error: 'Não deu.' }, 500)

        const linhas = [
          { dias: 1, valor: -8990, texto: 'SUPERMERCADO SAO JOSE', tipo: 'Compras' },
          { dias: 2, valor: -3550, texto: 'PAG*POSTO IPIRANGA', tipo: 'Combustível' },
          { dias: 3, valor: -12000, texto: 'PIX ENVIADO MARIA', tipo: 'Pix' },
          { dias: 5, valor: 450000, texto: 'SALARIO EMPRESA LTDA', tipo: 'Transferência' },
          { dias: 6, valor: -6790, texto: 'FARMACIA POPULAR', tipo: 'Saúde' },
          { dias: 8, valor: -2490, texto: 'NETFLIX.COM', tipo: 'Assinaturas' },
        ]

        await db.insert(pendingTransactions).values(
          linhas.map((linha, indice) => ({
            groupId,
            connectionId: conexao.id,
            accountId,
            externalId: `${conexao.itemId}-${indice}`,
            date: diaAtras(linha.dias),
            amountCents: linha.valor,
            description: linha.texto,
            kind: linha.tipo,
          })),
        )

        return c.json({ connectionId: conexao.id, pending: linhas.length }, 201)
      })
  )
}
