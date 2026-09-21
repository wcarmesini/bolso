import type { RealtimeClientMessage, RealtimeEvent } from '@bolso/shared'
import type { Context } from 'hono'
import type { WSEvents } from 'hono/ws'
import { findMembership, firstMembership } from '../groups'
import type { Deps } from '../http'

// Código de fechamento quando não há sessão válida: o app manda a pessoa para o login
export const UNAUTHORIZED_CLOSE_CODE = 4401

const send = (ws: { send: (data: string) => void }, event: RealtimeEvent) =>
  ws.send(JSON.stringify(event))

/**
 * Conexão de tempo real: autentica pelo cookie da sessão, entra no canal do grupo ativo
 * e repassa os avisos. Trocar de grupo = o app reconecta e entra no canal novo.
 */
export async function realtimeSocket(deps: Deps, c: Context): Promise<WSEvents> {
  const result = await deps.auth.api.getSession({ headers: c.req.raw.headers })
  const activeId = result?.session.activeOrganizationId
  const membership = result
    ? ((activeId ? await findMembership(deps.db, result.user.id, activeId) : undefined) ??
      (await firstMembership(deps.db, result.user.id)))
    : undefined

  let unsubscribe: (() => void) | undefined

  return {
    onOpen(_event, ws) {
      if (!membership) {
        ws.close(UNAUTHORIZED_CLOSE_CODE, 'unauthorized')
        return
      }
      unsubscribe = deps.hub.subscribe(membership.organizationId, {
        send: (data) => ws.send(data),
      })
      send(ws, { type: 'ready', groupId: membership.organizationId })
    },
    onMessage(event, ws) {
      // O app manda "ping" de tempos em tempos para a conexão não ser derrubada por inatividade
      if (typeof event.data !== 'string') return
      try {
        const message: RealtimeClientMessage = JSON.parse(event.data)
        if (message.type === 'ping') send(ws, { type: 'pong' })
      } catch {
        // Mensagem inválida: ignora
      }
    },
    onClose() {
      unsubscribe?.()
    },
  }
}
