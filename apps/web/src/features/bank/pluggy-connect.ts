/*
 * O widget de conexão do Pluggy.
 *
 * É um script de fora, carregado só quando alguém vai conectar um banco — quem nunca conecta
 * nada não paga por ele. O `connectToken` vem do nosso servidor e vale meia hora; o segredo
 * do Pluggy nunca chega aqui.
 */

const ENDERECO = 'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js'

type ItemData = { item: { id: string } }

type Opcoes = {
  connectToken: string
  /** Preenchido quando é para arrumar uma conexão que já existe */
  updateItem?: string
  includeSandbox?: boolean
  onSuccess: (dados: ItemData) => void
  onError?: (erro: unknown) => void
  onClose?: () => void
}

type Widget = { init: () => void }

declare global {
  interface Window {
    PluggyConnect?: new (opcoes: Opcoes) => Widget
  }
}

let carregando: Promise<void> | null = null

function carregar() {
  if (window.PluggyConnect) return Promise.resolve()
  if (carregando) return carregando
  carregando = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = ENDERECO
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      carregando = null
      reject(new Error('Não foi possível carregar a tela de conexão do banco.'))
    }
    document.head.append(script)
  })
  return carregando
}

export async function abrirPluggy(opcoes: Opcoes) {
  await carregar()
  const Widget = window.PluggyConnect
  if (!Widget) throw new Error('Não foi possível carregar a tela de conexão do banco.')
  new Widget({ includeSandbox: true, ...opcoes }).init()
}
