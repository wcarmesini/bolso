import type { RealtimeEvent } from '@bolso/shared'

export type Subscriber = { send: (data: string) => void }

/*
 * Canais de tempo real, um por grupo. Quem está conectado recebe os avisos do próprio grupo.
 *
 * Funciona dentro de um processo. Para rodar várias instâncias da API no futuro, o `publish`
 * passa a sair pelo Postgres (NOTIFY) e cada instância repassa aos seus sockets (LISTEN);
 * nada muda para quem chama `publish` ou `subscribe`.
 */
export class RealtimeHub {
  private readonly channels = new Map<string, Set<Subscriber>>()

  subscribe(groupId: string, subscriber: Subscriber) {
    let channel = this.channels.get(groupId)
    if (!channel) {
      channel = new Set()
      this.channels.set(groupId, channel)
    }
    channel.add(subscriber)

    return () => {
      channel.delete(subscriber)
      if (channel.size === 0) this.channels.delete(groupId)
    }
  }

  publish(groupId: string, event: RealtimeEvent) {
    const channel = this.channels.get(groupId)
    if (!channel) return
    const data = JSON.stringify(event)
    for (const subscriber of channel) {
      try {
        subscriber.send(data)
      } catch {
        // Conexão caída: o fechamento dela remove o inscrito
      }
    }
  }

  connections(groupId: string) {
    return this.channels.get(groupId)?.size ?? 0
  }
}
