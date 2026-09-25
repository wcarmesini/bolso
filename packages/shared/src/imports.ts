import { z } from 'zod'

/*
 * Importar um extrato OFX e conciliar com o que já está lançado.
 *
 * São dois passos: primeiro a API lê o arquivo e devolve o que encontrou, dizendo de cada
 * linha se é nova, se parece com um lançamento que já existe, ou se já foi importada antes.
 * Depois o app manda as decisões. O arquivo vai junto nas duas vezes: assim os valores vêm
 * sempre do extrato, e não de algo que o navegador possa ter mexido.
 */
const ofxText = z.string().min(1, 'Envie o arquivo').max(8_000_000, 'Arquivo muito grande')

export const importPreviewSchema = z.object({
  accountId: z.uuid(),
  text: ofxText,
})

export const importRowStatuses = ['new', 'match', 'imported'] as const
export type ImportRowStatus = (typeof importRowStatuses)[number]

/** Lançamento do Bolso ligado (ou sugerido) para uma linha do extrato */
export type ImportMatch = {
  id: string
  description: string
  purchaseDate: string
  amountCents: number
  categoryName: string | null
  /** Saída ou entrada, para a tela mostrar o sinal certo */
  type: 'expense' | 'income'
}

export type ImportRow = {
  fitId: string
  date: string
  /** Negativo = saída, como vem no extrato */
  amountCents: number
  description: string
  /** Como o banco classificou a linha ("Pix - Enviado") */
  kind: string | null
  /*
   * Parcela de cartão, quando o banco conta que é uma. `purchaseDate` é a data da **compra**:
   * é ela que vale como competência das dez parcelas, e não a data em que cada uma caiu na
   * fatura. A tela mostra as duas coisas, para ninguém achar que o Bolso errou o mês.
   */
  installment: { number: number; count: number; purchaseDate: string } | null
  /*
   * O que já foi decidido para esta linha e está guardado no banco. É o que devolve o
   * trabalho de quem classificou e saiu da tela — ou deslogou — sem confirmar.
   */
  decision: PendingDecision | null
  status: ImportRowStatus
  /** No "match", o lançamento parecido; no "imported", o que já veio deste extrato */
  match: ImportMatch | null
  /*
   * Os outros lançamentos que também poderiam ser esta linha, do mais provável ao menos.
   * É o que deixa trocar o par sem procurar na mão quando o palpite do Bolso erra.
   */
  candidates: ImportMatch[]
}

export type ImportPreview = {
  accountNumber: string | null
  bankNumber: string | null
  start: string | null
  end: string | null
  rows: ImportRow[]
  /*
   * O que está no Bolso, nesta conta e neste período, e **não** apareceu no extrato. É a
   * pergunta que a conciliação deixa no ar: ou o lançamento está errado (valor, data, conta),
   * ou é algo que o banco ainda não processou. Ver isso é metade do trabalho de conferir.
   */
  unmatched: ImportMatch[]
  /*
   * Tudo o que está lançado nesta conta e neste período e ainda não pertence a nenhuma linha
   * do extrato. A tela usa para deixar escolher o par na mão, inclusive um que o Bolso não
   * sugeriria (valor diferente por causa de uma digitação errada, por exemplo).
   */
  available: ImportMatch[]
  /** Linhas de saldo que o banco manda como lançamento e que não são importadas */
  balanceLines: number
  /** Conferência do extrato: saldo anterior + lançamentos tem que dar o saldo final */
  check: {
    previousBalanceCents: number | null
    movementCents: number
    finalBalanceCents: number | null
    /** Verdadeiro quando a conta fecha — prova de que nada se perdeu na leitura */
    matches: boolean
  }
}

/*
 * O que fazer com uma linha que veio de fora:
 * - create: vira lançamento novo (entrada ou saída, com categoria)
 * - link: gruda num lançamento que já existia
 * - transfer: é dinheiro trocando de conta (inclusive o pagamento da fatura do cartão), então
 *   vira uma transferência de duas pernas, sem categoria e fora dos relatórios
 * - skip: fica de fora
 */
/*
 * A decisão de uma linha, guardada no banco enquanto a pessoa classifica.
 *
 * Classificar cem linhas é trabalho de verdade, e trabalho de verdade não pode viver só na
 * memória da tela: sair da página, deslogar, o navegador fechar — nada disso pode apagar o
 * que já foi decidido. Nada disso vira lançamento antes de "Aprovar": não entra em relatório
 * nem na lista de lançamentos. É um rascunho, e só.
 */
export const pendingDraftSchema = z.object({
  description: z.string().trim().max(120),
  purchaseDate: z.iso.date('Data inválida'),
  paymentDate: z.iso.date('Data inválida').nullable(),
  notes: z.string().trim().max(500).default(''),
  splits: z
    .array(z.object({ categoryId: z.uuid().nullable(), amountCents: z.number().int() }))
    .max(20)
    .default([]),
})
export type PendingDraft = z.infer<typeof pendingDraftSchema>

export const pendingDecisionSchema = z.object({
  action: z.enum(['create', 'link', 'transfer', 'skip', 'later']),
  categoryId: z.uuid().nullable().default(null),
  contactId: z.uuid().nullable().default(null),
  counterAccountId: z.uuid().nullable().default(null),
  transactionId: z.uuid().nullable().default(null),
  /** O que o formulário completo preencheu, quando a pessoa detalhou a linha */
  draft: pendingDraftSchema.nullable().default(null),
})
export type PendingDecision = z.infer<typeof pendingDecisionSchema>

export const saveDecisionsSchema = z.object({
  decisions: z
    .array(z.object({ id: z.uuid(), decision: pendingDecisionSchema.nullable() }))
    .min(1)
    .max(500),
})

export const importActions = ['create', 'link', 'transfer', 'skip'] as const
export type ImportAction = (typeof importActions)[number]

export const importDecisionSchema = z.object({
  fitId: z.string().min(1),
  action: z.enum(importActions),
  /** Obrigatório no "link": o lançamento que passa a ser o mesmo do extrato */
  transactionId: z.uuid().optional(),
  /** Só no "create": categoria e contato escolhidos na hora da importação */
  categoryId: z.uuid().nullable().default(null),
  contactId: z.uuid().nullable().default(null),
  /** Obrigatório no "transfer": a outra conta, para onde o dinheiro foi ou de onde veio */
  counterAccountId: z.uuid().nullable().default(null),
})
export type ImportDecision = z.infer<typeof importDecisionSchema>

export const importConfirmSchema = z.object({
  accountId: z.uuid(),
  text: ofxText,
  /** Nome do arquivo, só para o histórico saber de onde veio */
  label: z.string().trim().max(120).default(''),
  decisions: z.array(importDecisionSchema).min(1).max(2000),
})

export type ImportResult = {
  created: number
  linked: number
  transferred: number
  skipped: number
}

/*
 * Histórico de importações.
 *
 * Cada confirmação vira um lote. Serve para duas coisas: ver o que entrou e quando, e
 * **desfazer** — que é o que salva quem aprovou tudo de uma vez sem olhar direito.
 */
export const importSources = ['bank', 'ofx'] as const
export type ImportSource = (typeof importSources)[number]

export type ImportBatch = {
  id: string
  source: ImportSource
  /** O nome do arquivo, ou o do banco */
  label: string
  accountName: string
  created: number
  linked: number
  transferred: number
  skipped: number
  authorName: string
  createdAt: string
  /** Preenchido quando já foi desfeito: fica no histórico, sem o botão */
  undoneAt: string | null
}

export type UndoResult = {
  /** Lançamentos apagados: os que nasceram desta importação */
  removed: number
  /** Conciliações desfeitas: o lançamento continua, só perde o vínculo com o banco */
  unlinked: number
  /** Linhas que voltaram a esperar aprovação na caixa de entrada */
  restored: number
  /** Já não existia mais quando fomos desfazer (alguém apagou antes) */
  missing: number
}
