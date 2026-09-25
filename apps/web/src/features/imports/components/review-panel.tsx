import {
  type ImportDecision,
  type ImportMatch,
  type ImportPreview,
  type ImportRow,
  importActions,
} from '@bolso/shared'
import {
  ArrowLeftRight,
  Check,
  Clock,
  EyeOff,
  Link2,
  Pencil,
  Plus,
  TriangleAlert,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { StatGrid } from '@/components/stat-grid'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAccounts } from '@/features/accounts/queries'
import { useCategories } from '@/features/categories/queries'
import { categoryTree, searchKey } from '@/features/transactions/category-options'
import { CategoryPicker } from '@/features/transactions/components/category-picker'
import { TransactionFormDialog } from '@/features/transactions/components/transaction-form-dialog'
import { shortDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'

/*
 * A conferência: decidir, linha por linha, o que entra no orçamento.
 *
 * É a mesma tela para o extrato OFX e para o banco conectado, porque a pergunta é a mesma —
 * isto é novo, ou já está lançado? O que muda são os rótulos: num caso a pessoa "importa",
 * no outro "aprova" o que o Bolso buscou sozinho.
 */

/*
 * "Depois" não é uma decisão que vai para o servidor: é a ausência dela. A linha simplesmente
 * não entra na lista enviada, e continua esperando na fila do banco. É diferente de
 * "Dispensar", que resolve a linha para sempre — a pessoa disse que aquilo não interessa.
 */
export type AcaoDaLinha = ImportDecision['action'] | 'later'

export type Decisao = {
  action: AcaoDaLinha
  categoryId: string | null
  /** Com qual lançamento do Bolso esta linha vai ser conciliada */
  transactionId: string | null
  /** Na transferência: a outra conta, para onde o dinheiro foi ou de onde veio */
  counterAccountId: string | null
}

const IMPORTAR = { value: 'create', label: 'Importar', icon: Plus } as const
const APROVAR = { value: 'create', label: 'Aprovar', icon: Plus } as const
const CONCILIAR = { value: 'link', label: 'Conciliar', icon: Link2 } as const
const TRANSFERIR = { value: 'transfer', label: 'Transferir', icon: ArrowLeftRight } as const
const DEPOIS = {
  value: 'later',
  label: 'Depois',
  icon: Clock,
  dica: 'Continua esperando; aparece de novo na próxima vez',
} as const

/** O que a linha faz por padrão: nova entra, parecida concilia, já importada fica de fora */
const acaoPadrao = (row: ImportRow): AcaoDaLinha =>
  row.status === 'new' ? 'create' : row.status === 'match' ? 'link' : 'skip'

const decisaoPadrao = (row: ImportRow): Decisao => ({
  action: acaoPadrao(row),
  categoryId: null,
  transactionId: row.status === 'match' ? (row.match?.id ?? null) : null,
  counterAccountId: null,
})

export type TextosDaConferencia = {
  /** "Importar" (arquivo) ou "Aprovar" (banco conectado) */
  entrar: 'importar' | 'aprovar'
  /** O que fazer com o que não deve entrar */
  foraLabel: string
  foraDica: string
  /*
   * "Depois" só existe no banco conectado, onde a fila é guardada. No extrato, deixar de
   * fora já é adiar: o arquivo continua no computador e pode ser lido de novo.
   */
  temDepois: boolean
  blocoNovos: string
  blocoJaEntrou: string
  blocoJaEntrouTexto: string
  confirmar: string
  confirmando: string
  /** De onde vieram as linhas, para o texto do que ficou sem par */
  fonte: string
}

export const textosDoExtrato: TextosDaConferencia = {
  entrar: 'importar',
  foraLabel: 'Ignorar',
  foraDica: 'Não entra nesta importação',
  temDepois: false,
  blocoNovos: 'Não existe nada parecido por aqui. Escolha a categoria de cada um, se quiser.',
  blocoJaEntrou: 'Já importados antes',
  blocoJaEntrouTexto: 'Vieram de uma importação anterior deste mesmo extrato. Ficam de fora.',
  confirmar: 'Confirmar importação',
  confirmando: 'Importando…',
  fonte: 'no extrato',
}

export const textosDoBanco: TextosDaConferencia = {
  entrar: 'aprovar',
  foraLabel: 'Dispensar',
  foraDica: 'Sai da fila e não volta (dá para desfazer no histórico)',
  temDepois: true,
  blocoNovos: 'Não existe nada parecido por aqui. Escolha a categoria de cada um, se quiser.',
  blocoJaEntrou: 'Já aprovados',
  blocoJaEntrouTexto: 'Já viraram lançamento numa aprovação anterior. Ficam de fora.',
  confirmar: 'Aprovar',
  confirmando: 'Aprovando…',
  fonte: 'no banco',
}

type ReviewPanelProps = {
  preview: ImportPreview
  /** A conta do Bolso deste extrato ou desta conexão: a transferência sai dela ou entra nela */
  accountId: string
  textos: TextosDaConferencia
  /** Linha de contexto acima dos números (conta, período, banco) */
  resumo?: ReactNode
  salvando: boolean
  onConfirmar: (decisions: ImportDecision[]) => void | Promise<void>
}

export function ReviewPanel({
  preview,
  accountId,
  textos,
  resumo,
  salvando,
  onConfirmar,
}: ReviewPanelProps) {
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})

  // Cada leitura nova recomeça as decisões do palpite do Bolso
  useEffect(() => {
    setDecisoes(Object.fromEntries(preview.rows.map((row) => [row.fitId, decisaoPadrao(row)])))
    setCriados([])
  }, [preview])

  // As despesas são o caso comum; a árvore muda conforme o sinal da linha
  const arvoreDespesa = useMemo(() => categoryTree(categories, 'expense'), [categories])
  const arvoreReceita = useMemo(() => categoryTree(categories, 'income'), [categories])

  /*
   * Os vínculos vivem nas decisões, não no palpite que veio do servidor: assim trocar um par
   * atualiza na hora quem está livre e o que ficou sem par, sem nova consulta.
   */
  /*
   * Lançamentos que nasceram aqui mesmo, pelo botão de detalhar uma linha. Ficam ao lado dos
   * que vieram do servidor para a conciliação enxergar os dois sem uma nova consulta.
   */
  const [criados, setCriados] = useState<ImportMatch[]>([])
  /** A linha que está sendo detalhada no formulário completo */
  const [detalhando, setDetalhando] = useState<ImportRow | null>(null)
  const todosDisponiveis = useMemo(
    () => [...criados, ...preview.available],
    [criados, preview.available],
  )

  const emUso = useMemo(() => {
    const mapa = new Map<string, { fitId: string; rotulo: string; amountCents: number }[]>()
    for (const row of preview.rows) {
      const decisao = decisoes[row.fitId]
      if (decisao?.action === 'link' && decisao.transactionId) {
        mapa.set(decisao.transactionId, [
          ...(mapa.get(decisao.transactionId) ?? []),
          {
            fitId: row.fitId,
            rotulo: row.description || shortDate(row.date),
            amountCents: row.amountCents,
          },
        ])
      }
    }
    return mapa
  }, [preview, decisoes])

  /*
   * Uma compra que o banco cobrou em duas vezes: as duas linhas apontam para o mesmo
   * lançamento, e ele se divide entre elas. Só fecha se a soma bater com o valor dele —
   * a conferência é aqui, para a pessoa ver o que falta antes de tentar confirmar.
   */
  const divisoes = useMemo(() => {
    const mapa = new Map<string, { soma: number; alvo: number; bate: boolean }>()
    for (const [transactionId, linhas] of emUso) {
      if (linhas.length < 2) continue
      const alvo = todosDisponiveis.find((item) => item.id === transactionId)?.amountCents ?? 0
      const soma = linhas.reduce((total, linha) => total + Math.abs(linha.amountCents), 0)
      mapa.set(transactionId, { soma, alvo, bate: soma === alvo })
    }
    return mapa
  }, [emUso, todosDisponiveis])

  const semPar = useMemo(
    () => todosDisponiveis.filter((item) => !emUso.has(item.id)),
    [todosDisponiveis, emUso],
  )

  // A outra ponta de uma transferência é qualquer conta, menos esta
  const outrasContas = useMemo(
    () => accounts.filter((conta) => conta.id !== accountId),
    [accounts, accountId],
  )

  const contagem = useMemo(() => {
    const valores = Object.values(decisoes)
    return {
      create: valores.filter((item) => item.action === 'create').length,
      link: valores.filter((item) => item.action === 'link').length,
      transfer: valores.filter((item) => item.action === 'transfer').length,
      later: valores.filter((item) => item.action === 'later').length,
      skip: valores.filter((item) => item.action === 'skip').length,
      /** Transferência sem a outra conta escolhida: não dá para confirmar assim */
      semDestino: valores.filter((item) => item.action === 'transfer' && !item.counterAccountId)
        .length,
    }
  }, [decisoes])

  /** Divisões que ainda não fecham: o servidor recusaria, então travamos antes */
  const divisoesAbertas = useMemo(
    () => [...divisoes.values()].filter((divisao) => !divisao.bate).length,
    [divisoes],
  )

  const mudarDecisao = (fitId: string, mudanca: Partial<Decisao>) =>
    setDecisoes((atual) => {
      const anterior: Decisao = atual[fitId] ?? {
        action: 'skip',
        categoryId: null,
        transactionId: null,
        counterAccountId: null,
      }
      return { ...atual, [fitId]: { ...anterior, ...mudanca } }
    })

  /*
   * Escolher (ou trocar) o lançamento desta linha. Um lançamento pertence a uma linha só: se
   * já estava ligado a outra, sai de lá — é o que permite corrigir um palpite errado sem ter
   * de desfazer nada antes.
   */
  const vincular = (fitId: string, transactionId: string | null, juntar = false) =>
    setDecisoes((atual) => {
      const proximo = { ...atual }
      // Sem "juntar", o lançamento pertence a uma linha só: escolher aqui tira de lá
      if (transactionId && !juntar) {
        for (const [outro, decisao] of Object.entries(atual)) {
          if (outro !== fitId && decisao.transactionId === transactionId) {
            proximo[outro] = { ...decisao, action: 'create', transactionId: null }
          }
        }
      }
      const anterior = atual[fitId] ?? {
        action: 'create',
        categoryId: null,
        transactionId: null,
        counterAccountId: null,
      }
      proximo[fitId] = transactionId
        ? { ...anterior, action: 'link', transactionId }
        : { ...anterior, action: 'create', transactionId: null }
      return proximo
    })

  /*
   * Quem ficou "para depois" não entra na lista: o servidor só mexe no que recebe, então a
   * linha continua esperando exatamente como estava.
   */
  const confirmar = () =>
    onConfirmar(
      preview.rows
        .filter((row) => (decisoes[row.fitId] ?? decisaoPadrao(row)).action !== 'later')
        .map((row): ImportDecision => {
          const decisao = decisoes[row.fitId] ?? decisaoPadrao(row)
          return {
            fitId: row.fitId,
            // O "later" já saiu no filtro acima; o que sobra é decisão de verdade
            action: decisao.action === 'later' ? 'skip' : decisao.action,
            transactionId:
              decisao.action === 'link' ? (decisao.transactionId ?? undefined) : undefined,
            categoryId: decisao.action === 'create' ? decisao.categoryId : null,
            contactId: null,
            counterAccountId: decisao.action === 'transfer' ? decisao.counterAccountId : null,
          }
        }),
    )

  const entrarLabel = textos.entrar === 'aprovar' ? 'A aprovar' : 'A importar'
  const blocos = [
    {
      status: 'match' as const,
      titulo: 'Já parecem lançados',
      texto: 'O Bolso achou um lançamento igual para cada um. Conciliar liga os dois, sem repetir.',
    },
    { status: 'new' as const, titulo: 'Novos no Bolso', texto: textos.blocoNovos },
    {
      status: 'imported' as const,
      titulo: textos.blocoJaEntrou,
      texto: textos.blocoJaEntrouTexto,
    },
  ]

  return (
    <>
      <StatGrid
        stats={[
          {
            label: textos.entrar === 'aprovar' ? 'Esperando' : 'No extrato',
            value: String(preview.rows.length),
          },
          { label: entrarLabel, value: String(contagem.create) },
          { label: 'A conciliar', value: String(contagem.link) },
          ...(contagem.transfer > 0
            ? [{ label: 'Transferências', value: String(contagem.transfer) }]
            : []),
          semPar.length > 0
            ? {
                label: 'Sem par',
                value: String(semPar.length),
                tone: 'text-amber-600 dark:text-amber-400',
              }
            : { label: 'Fora', value: String(contagem.skip) },
        ]}
      >
        {resumo}
        <ContaDoExtrato preview={preview} />
      </StatGrid>

      {blocos.map(({ status, titulo, texto }) => {
        const linhas = preview.rows.filter((row) => row.status === status)
        if (linhas.length === 0) return null
        return (
          <section key={status} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-muted-foreground text-xs">
                {titulo} <span className="tabular-nums">({linhas.length})</span>
              </h2>
              <p className="hidden text-muted-foreground/70 text-xs sm:block">{texto}</p>
            </div>
            <ul className="divide-y rounded-xl border bg-card">
              {linhas.map((row) => (
                <Linha
                  key={row.fitId}
                  row={row}
                  textos={textos}
                  decisao={decisoes[row.fitId] ?? decisaoPadrao(row)}
                  arvore={row.amountCents > 0 ? arvoreReceita : arvoreDespesa}
                  onMudar={(mudanca) => mudarDecisao(row.fitId, mudanca)}
                  disponiveis={todosDisponiveis}
                  emUso={emUso}
                  divisao={divisoes.get(decisoes[row.fitId]?.transactionId ?? '') ?? null}
                  onDetalhar={() => setDetalhando(row)}
                  outrasContas={outrasContas}
                  onVincular={(transactionId, juntar) => vincular(row.fitId, transactionId, juntar)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      <SemPar itens={semPar} periodo={[preview.start, preview.end]} fonte={textos.fonte} />

      {/*
       * Detalhar uma linha: o formulário de sempre, já preenchido com o que o banco mandou.
       * Ao salvar, o lançamento passa a existir e a linha fica conciliada com ele — nada
       * entra duas vezes, e a pessoa não perdeu o fio da conferência.
       */}
      <TransactionFormDialog
        open={detalhando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhando(null)
        }}
        month={(detalhando?.date ?? preview.start ?? '').slice(0, 7)}
        initialValues={
          detalhando
            ? {
                type: detalhando.amountCents > 0 ? 'income' : 'expense',
                amountCents: Math.abs(detalhando.amountCents),
                description: detalhando.description,
                accountId,
                // Parcela: a competência é a data da compra; o caixa continua sendo o da parcela
                purchaseDate: detalhando.installment?.purchaseDate ?? detalhando.date,
                paymentDate: detalhando.date,
                splits: [
                  {
                    categoryId: decisoes[detalhando.fitId]?.categoryId ?? null,
                    amountCents: Math.abs(detalhando.amountCents),
                  },
                ],
              }
            : null
        }
        onSaved={(salvo) => {
          const linha = detalhando
          if (!linha) return
          setCriados((atual) => [
            {
              id: salvo.id,
              description: salvo.description,
              purchaseDate: salvo.purchaseDate,
              amountCents: salvo.amountCents,
              categoryName: null,
              type: salvo.type,
            },
            ...atual,
          ])
          // A linha passa a conciliar com o que acabou de nascer: não entra de novo
          setDecisoes((atual) => ({
            ...atual,
            [linha.fitId]: {
              ...(atual[linha.fitId] ?? decisaoPadrao(linha)),
              action: 'link',
              transactionId: salvo.id,
            },
          }))
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {divisoesAbertas > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">
              {divisoesAbertas === 1
                ? 'As partes de um lançamento dividido não somam o valor dele.'
                : `${divisoesAbertas} lançamentos divididos têm partes que não somam o valor deles.`}
            </span>
          ) : contagem.semDestino > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">
              Escolha a outra conta {contagem.semDestino === 1 ? 'da' : 'das'}{' '}
              {contagem.semDestino === 1
                ? 'transferência'
                : `${contagem.semDestino} transferências`}{' '}
              para continuar.
            </span>
          ) : (
            <>
              {contagem.create} a {textos.entrar},{' '}
              {contagem.transfer > 0 && `${contagem.transfer} a transferir, `}
              {contagem.link} a conciliar
              {contagem.later > 0 && `, ${contagem.later} para depois`} e {contagem.skip}{' '}
              {textos.temDepois ? 'dispensados' : 'de fora'}.
            </>
          )}
        </p>
        <Button
          onClick={confirmar}
          disabled={
            salvando ||
            divisoesAbertas > 0 ||
            contagem.semDestino > 0 ||
            contagem.create + contagem.link + contagem.transfer + contagem.skip === 0
          }
        >
          {salvando ? textos.confirmando : textos.confirmar}
        </Button>
      </div>
    </>
  )
}

/** A conta do extrato: saldo anterior + movimento = saldo final. Fechou, nada se perdeu. */
function ContaDoExtrato({ preview }: { preview: ImportPreview }) {
  const { check, balanceLines } = preview
  const avisos = []
  if (balanceLines > 0) {
    avisos.push(
      `${balanceLines} ${balanceLines === 1 ? 'linha de saldo foi ignorada' : 'linhas de saldo foram ignoradas'}: são a foto da conta, não dinheiro entrando ou saindo.`,
    )
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {check.matches && check.finalBalanceCents !== null && (
        <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5 shrink-0" />
          <span>
            O extrato fecha: {formatCents(check.previousBalanceCents ?? 0)} de saldo anterior
            {check.movementCents < 0 ? ' menos ' : ' mais '}
            {formatCents(Math.abs(check.movementCents))} dão os{' '}
            {formatCents(check.finalBalanceCents)} que o banco informa.
          </span>
        </p>
      )}
      {avisos.map((aviso) => (
        <p key={aviso} className="text-muted-foreground">
          {aviso}
        </p>
      ))}
    </div>
  )
}

type LinhaProps = {
  row: ImportRow
  textos: TextosDaConferencia
  decisao: Decisao
  arvore: ReturnType<typeof categoryTree>
  onMudar: (mudanca: Partial<Decisao>) => void
  /** Tudo o que está lançado no período e pode virar o par desta linha */
  disponiveis: ImportMatch[]
  /** Lançamento → as linhas que já o escolheram (mais de uma = ele vai ser dividido) */
  emUso: Map<string, { fitId: string; rotulo: string; amountCents: number }[]>
  /** Quando esta linha divide um lançamento com outras: como está a soma */
  divisao: { soma: number; alvo: number; bate: boolean } | null
  /** Abre o formulário completo para detalhar esta linha antes de aprovar */
  onDetalhar: () => void
  /** As contas que podem ser a outra ponta de uma transferência */
  outrasContas: { id: string; name: string }[]
  onVincular: (transactionId: string | null, juntar?: boolean) => void
}

function Linha({
  row,
  textos,
  decisao,
  arvore,
  onMudar,
  disponiveis,
  emUso,
  divisao,
  outrasContas,
  onDetalhar,
  onVincular,
}: LinhaProps) {
  const entrada = row.amountCents > 0
  const escolhido =
    row.status === 'imported'
      ? row.match
      : (disponiveis.find((item) => item.id === decisao.transactionId) ?? null)
  const conciliando = decisao.action === 'link' && escolhido !== null

  const entrar = textos.entrar === 'aprovar' ? APROVAR : IMPORTAR
  const fora = {
    value: 'skip',
    label: textos.foraLabel,
    icon: EyeOff,
    dica: textos.foraDica,
  } as const
  /*
   * "Conciliar" só aparece quando existe um lançamento escolhido para esta linha, e
   * "Transferir" só quando há outra conta para onde mandar o dinheiro.
   */
  const acoes = [
    ...(escolhido !== null ? [CONCILIAR] : []),
    entrar,
    ...(outrasContas.length > 0 ? [TRANSFERIR] : []),
    ...(textos.temDepois ? [DEPOIS] : []),
    fora,
  ]

  return (
    <li
      className={`flex flex-col gap-2 border-l-2 py-3 pr-4 pl-4 transition-colors ${
        conciliando ? 'border-l-primary bg-primary/[0.04]' : 'border-l-transparent'
      } ${row.status === 'imported' ? 'opacity-60' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm">{row.description || '—'}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {[
              shortDate(row.date),
              row.kind,
              /*
               * A parcela precisa aparecer aqui: o valor desta linha é de uma prestação, mas
               * o gasto é da data da compra — e é nessa data que ela vai entrar. Sem dizer
               * isso, quem confere acha que o Bolso errou o mês.
               */
              row.installment
                ? `parcela ${row.installment.number}/${row.installment.count} · compra em ${shortDate(row.installment.purchaseDate)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span
          className={`shrink-0 text-sm tabular-nums ${
            entrada ? 'text-emerald-600 dark:text-emerald-400' : ''
          }`}
        >
          {entrada ? '+' : '−'}
          {formatCents(Math.abs(row.amountCents))}
        </span>
      </div>

      {/* O par: o que já está no Bolso e vai ficar ligado a esta linha */}
      {escolhido && (
        <p
          className={`flex items-center gap-1.5 text-xs ${
            conciliando ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Link2 className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {row.status === 'imported' ? 'Já é ' : 'Concilia com '}
            <span className="font-medium">
              {escolhido.description || 'lançamento sem descrição'}
            </span>
            {escolhido.categoryName && ` em ${escolhido.categoryName}`}
            {` · ${shortDate(escolhido.purchaseDate)}`}
            {divisao && (
              <span className={divisao.bate ? '' : 'text-amber-600 dark:text-amber-400'}>
                {' · '}
                {divisao.bate
                  ? `dividido: as partes somam ${formatCents(divisao.alvo)}`
                  : `dividido: as partes somam ${formatCents(divisao.soma)} e ele é de ${formatCents(divisao.alvo)}`}
              </span>
            )}
          </span>
          {row.status !== 'imported' && (
            <button
              type="button"
              onClick={() => onVincular(null)}
              title="Desfazer este par"
              aria-label={`Desfazer o par de ${row.description || 'lançamento'}`}
              className="shrink-0 rounded text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          )}
        </p>
      )}

      {row.status !== 'imported' && (
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            spacing={0}
            size="sm"
            value={[decisao.action]}
            onValueChange={(next) => {
              // A lista de ações vem do pacote compartilhado: esquecer uma aqui já custou caro
              const acao = [...importActions, 'later' as const].find((valor) => valor === next[0])
              if (acao) onMudar({ action: acao })
            }}
          >
            {acoes.map((acao) => (
              <ToggleGroupItem
                key={acao.value}
                value={acao.value}
                title={'dica' in acao ? acao.dica : undefined}
              >
                <acao.icon />
                {acao.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <EscolherPar
            row={row}
            escolhidoId={decisao.transactionId}
            disponiveis={disponiveis}
            emUso={emUso}
            onEscolher={onVincular}
          />

          {decisao.action === 'transfer' && (
            <div className="flex min-w-56 flex-1 items-center gap-2">
              <span className="shrink-0 text-muted-foreground text-xs">
                {entrada ? 'veio de' : 'foi para'}
              </span>
              <Select
                items={outrasContas.map((conta) => ({ value: conta.id, label: conta.name }))}
                value={decisao.counterAccountId ?? ''}
                onValueChange={(next) => onMudar({ counterAccountId: next as string })}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={`Outra conta de ${row.description || 'lançamento'}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {outrasContas.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {decisao.action === 'create' && (
            <div className="flex min-w-56 flex-1 items-center gap-1">
              <div className="min-w-0 flex-1">
                <CategoryPicker
                  tree={arvore}
                  kind={entrada ? 'income' : 'expense'}
                  value={decisao.categoryId}
                  onChange={(categoryId) => onMudar({ categoryId })}
                  label={`Categoria de ${row.description || 'lançamento'}`}
                />
              </div>
              {/* A categoria resolve a maioria; quem precisa de contato, parcelas ou
                  divisão abre o formulário inteiro sem sair da conferência */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDetalhar}
                title="Preencher tudo neste lançamento"
                aria-label={`Detalhar ${row.description || 'lançamento'}`}
                className="shrink-0 text-muted-foreground"
              >
                <Pencil />
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * O que está lançado no Bolso, nesta conta e neste período, e não apareceu do outro lado.
 * Costuma ser valor ou data digitados errado — vale conferir antes de fechar.
 */
function SemPar({
  itens,
  periodo,
  fonte,
}: {
  itens: ImportMatch[]
  periodo: [string | null, string | null]
  fonte: string
}) {
  if (itens.length === 0) return null
  const [inicio, fim] = periodo

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-400">
          <TriangleAlert className="size-3.5" />
          No Bolso, sem par {fonte} <span className="tabular-nums">({itens.length})</span>
        </h2>
      </div>
      <ul className="divide-y rounded-xl border border-amber-500/30 bg-amber-500/[0.04]">
        {itens.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm">
                {item.description || 'Lançamento sem descrição'}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {[shortDate(item.purchaseDate), item.categoryName].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span
              className={`shrink-0 text-sm tabular-nums ${
                item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : ''
              }`}
            >
              {item.type === 'income' ? '+' : '−'}
              {formatCents(item.amountCents)}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-1 text-muted-foreground text-xs">
        Estão lançados aqui{inicio && fim ? ` entre ${shortDate(inicio)} e ${shortDate(fim)}` : ''},
        mas o banco não os mostra. Confira o valor, a data e a conta — ou espere o banco processar.
      </p>
    </section>
  )
}

type EscolherParProps = {
  row: ImportRow
  escolhidoId: string | null
  disponiveis: ImportMatch[]
  emUso: Map<string, { fitId: string; rotulo: string; amountCents: number }[]>
  onEscolher: (transactionId: string | null, juntar?: boolean) => void
}

/**
 * Escolhe à mão com qual lançamento esta linha se junta.
 *
 * O palpite do Bolso acerta na maioria, mas dois gastos do mesmo valor na mesma semana são
 * indistinguíveis para ele e óbvios para quem lançou. Os de mesmo valor vêm em cima, marcados;
 * o resto fica na lista, e a busca aceita descrição ou valor.
 */
function EscolherPar({ row, escolhidoId, disponiveis, emUso, onEscolher }: EscolherParProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  if (row.status === 'imported') return null

  const mesmoValor = (item: ImportMatch) => item.amountCents === Math.abs(row.amountCents)
  const chave = searchKey(query)
  const lista = disponiveis
    .filter(
      (item) =>
        !chave ||
        searchKey(item.description).includes(chave) ||
        formatCents(item.amountCents).includes(query.trim()),
    )
    .sort((a, b) => {
      // Mesmo valor primeiro; depois, o mais perto da data da linha
      if (mesmoValor(a) !== mesmoValor(b)) return mesmoValor(a) ? -1 : 1
      const perto = (item: ImportMatch) =>
        Math.abs(Date.parse(item.purchaseDate) - Date.parse(row.date))
      return perto(a) - perto(b)
    })
    .slice(0, 40)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
        aria-label={`Escolher o lançamento de ${row.description || 'lançamento'}`}
      >
        <Link2 />
        {escolhidoId ? 'Trocar par' : 'Conciliar com…'}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-96 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por descrição ou valor…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhum lançamento deste período por aqui.</CommandEmpty>
            {lista.map((item) => {
              const ocupantes = emUso.get(item.id) ?? []
              const ocupadoPorOutra = ocupantes.filter((linha) => linha.fitId !== row.fitId)
              /*
               * O lançamento já é de outra linha. Escolher aqui não rouba: as duas linhas
               * passam a dividir o mesmo lançamento — é o caso da compra que o banco cobrou
               * em duas vezes. Quem só quer corrigir o palpite desfaz o par da outra linha.
               */
              const juntando = ocupadoPorOutra.length > 0
              return (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onEscolher(item.id, juntando)
                    setOpen(false)
                    setQuery('')
                  }}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {item.description || 'Lançamento sem descrição'}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCents(item.amountCents)}</span>
                  </span>
                  <span className="flex w-full items-baseline gap-1.5 text-muted-foreground text-xs">
                    {shortDate(item.purchaseDate)}
                    {item.categoryName && ` · ${item.categoryName}`}
                    {mesmoValor(item) && (
                      <span className="rounded bg-primary/10 px-1 text-primary">mesmo valor</span>
                    )}
                    {juntando && (
                      <span className="truncate text-primary">
                        juntar com “{ocupadoPorOutra[0]?.rotulo}”
                        {ocupadoPorOutra.length > 1 && ` e mais ${ocupadoPorOutra.length - 1}`}
                      </span>
                    )}
                  </span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
