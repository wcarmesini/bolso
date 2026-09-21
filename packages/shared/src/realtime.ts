/*
 * Eventos de tempo real (WebSocket /api/ws). O servidor não manda os dados, só avisa
 * o que mudou; o cliente busca de novo pela API. Simples, e sempre consistente com o banco.
 */
export const realtimeResources = [
  'categories',
  'accounts',
  'integration-keys',
  'transactions',
  'budgets',
  'group',
] as const
export type RealtimeResource = (typeof realtimeResources)[number]

export type RealtimeEvent =
  | { type: 'invalidate'; resources: RealtimeResource[]; actorId: string }
  | { type: 'ready'; groupId: string }
  | { type: 'pong' }

export type RealtimeClientMessage = { type: 'ping' }
