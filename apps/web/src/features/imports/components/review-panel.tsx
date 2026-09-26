import type {
  ImportDecision,
  ImportMatch,
  ImportPreview,
  ImportRow,
  PendingDecision,
} from '@bolso/shared'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Clock,
  EyeOff,
  Link2,
  type LucideIcon,
  Pencil,
  Plus,
  TriangleAlert,
  X,
} from 'lucide-react'
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccounts } from '@/features/accounts/queries'
import { useCategories } from '@/features/categories/queries'
import { useContacts } from '@/features/contacts/queries'
import { categoryTree, searchKey } from '@/features/transactions/category-options'
import { CategoryPicker } from '@/features/transactions/components/category-picker'
import { InstallmentBadge } from '@/features/transactions/components/installment-badge'
import { TransactionFormDialog } from '@/features/transactions/components/transaction-form-dialog'
import { shortDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'

/*
 * A conferência: decidir, linha por linha, o que entra no orçamento.
 *
 * É a mesma tela para o extrato OFX e para o banco conectado, porque a pergunta é a mesma —
 * isto é novo, ou já está lançado? O que muda são os rótulos: num caso a pessoa "importa",
 * no outro "aprova" o que o Bolso buscou sozinho.
 *
 * O desenho segue o que a tarefa é de verdade: uma **lista para percorrer**, não um formulário
 * por linha. Cada linha mostra o que o banco mandou e **a decisão** que está tomada; o resto
 * (trocar o par, escolher a outra conta, detalhar) aparece quando aquela decisão pede. Quem
 * precisa resolver trinta linhas iguais marca todas e decide de uma vez, na barra de baixo.
 */

/*
 * "Depois" não é uma decisão que vai para o servidor: é a ausência dela. A linha simplesmente
 * não entra na lista enviada, e continua esperando na fila do banco. É diferente de
 * "dispensar", que resolve a linha e a tira do caminho.
 */
type Acao = ImportDecision['action'] | 'later'

type Decisao = {
  action: Acao
  categoryId: string | null
  contactId: string | null
  transactionId: string | null
  counterAccountId: string | null
  draft: PendingDecision['draft']
}

const acaoPadrao = (row: ImportRow): Acao =>
  row.status === 'new' ? 'create' : row.status === 'match' ? 'link' : 'skip'

/*
 * O que a linha mostra ao abrir: o que já foi decidido e está guardado no banco; e, se
 * ninguém decidiu ainda, o palpite do Bolso.
 */
const decisaoPadrao = (row: ImportRow): Decisao =>
  row.decision
    ? {
        action: row.decision.action,
        categoryId: row.decision.categoryId,
        transactionId: row.decision.transactionId,
        counterAccountId: row.decision.counterAccountId,
        contactId: row.decision.contactId,
        draft: row.decision.draft,
      }
    : {
        action: acaoPadrao(row),
        categoryId: null,
        transactionId: row.status === 'match' ? (row.match?.id ?? null) : null,
        counterAccountId: null,
        contactId: null,
        draft: null,
      }

/** Uma decisão sem nada escolhido, para partir de algum lugar */
const vazia = (): Decisao => ({
  action: 'skip',
  categoryId: null,
  transactionId: null,
  counterAccountId: null,
  contactId: null,
  draft: null,
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

/** Como cada decisão se chama e se desenha, do jeito que a pessoa a vê na linha */
type Rotulo = { label: string; icon: LucideIcon; tom?: string }

const rotulosDe = (textos: TextosDaConferencia): Record<Acao, Rotulo> => ({
  create: {
    label: textos.entrar === 'aprovar' ? 'Aprovar' : 'Importar',
    icon: Plus,
    tom: 'text-primary',
  },
  link: { label: 'Conciliar', icon: Link2, tom: 'text-primary' },
  transfer: { label: 'Transferir', icon: ArrowLeftRight },
  later: { label: 'Depois', icon: Clock },
  skip: { label: textos.foraLabel, icon: EyeOff },
})

type ReviewPanelProps = {
  preview: ImportPreview
  /** A conta do Bolso deste extrato ou desta conexão: a transferência sai dela ou entra nela */
  accountId: string
  textos: TextosDaConferencia
  /** Linha de contexto acima da lista (conta, período, banco) */
  resumo?: ReactNode
  salvando: boolean
  onConfirmar: (decisions: ImportDecision[]) => void | Promise<void>
  /** Guarda o rascunho da decisão no banco (só existe onde há fila guardada) */
  onGuardar?: (decisions: { id: string; decision: PendingDecision | null }[]) => void
}

export function ReviewPanel({
  preview,
  accountId,
  textos,
  resumo,
  salvando,
  onConfirmar,
  onGuardar,
}: ReviewPanelProps) {
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: contatos = [] } = useContacts()
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())

  /*
   * A leitura chega de novo o tempo todo — a busca automática traz linhas, outra pessoa do
   * orçamento aprova algo, a janela volta ao foco, a conexão cai e volta. Em nenhum desses casos
   * o que a pessoa já decidiu pode ser jogado fora: classificar trinta linhas e ver tudo
   * voltar ao palpite do Bolso é perder trabalho de verdade.
   *
   * Então **junta** em vez de recomeçar: quem já tem decisão mantém a sua, quem chegou agora
   * nasce com o palpite, e quem saiu da fila sai daqui também.
   */
  useEffect(() => {
    setDecisoes((atual) =>
      Object.fromEntries(
        preview.rows.map((row) => [row.fitId, atual[row.fitId] ?? decisaoPadrao(row)]),
      ),
    )
    setMarcadas((atual) => {
      const vivas = new Set(preview.rows.map((row) => row.fitId))
      const proximas = new Set([...atual].filter((fitId) => vivas.has(fitId)))
      return proximas.size === atual.size ? atual : proximas
    })
  }, [preview])

  // As despesas são o caso comum; a árvore muda conforme o sinal da linha
  const arvoreDespesa = useMemo(() => categoryTree(categories, 'expense'), [categories])
  const arvoreReceita = useMemo(() => categoryTree(categories, 'income'), [categories])
  const rotulos = useMemo(() => rotulosDe(textos), [textos])
  const nomeDoContato = useMemo(
    () => new Map(contatos.map((contato) => [contato.id, contato.name])),
    [contatos],
  )

  /** A linha que está sendo detalhada no formulário completo */
  const [detalhando, setDetalhando] = useState<ImportRow | null>(null)
  const todosDisponiveis = preview.available

  /*
   * Os vínculos vivem nas decisões, não no palpite que veio do servidor: assim trocar um par
   * atualiza na hora quem está livre e o que ficou sem par, sem nova consulta.
   */
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
   * O mapa de quem está ocupado muda a cada escolha, e ele só é lido quando alguém abre o
   * seletor de par. Passá-lo como propriedade faria as duzentas linhas se redesenharem a cada
   * clique; numa referência, ele fica à mão sem custar nada.
   */
  const emUsoRef = useRef(emUso)
  emUsoRef.current = emUso

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

  /*
   * Toda escolha é guardada no banco na hora. Não recarrega a fila — a tela já sabe o que
   * escolheu —, mas quem sair da página e voltar (ou deslogar) encontra o trabalho onde
   * parou. Falhar ao guardar não desfaz nada na tela: o aviso já apareceu, e insistir
   * bastaria clicar de novo.
   */
  const guardarRef = useRef(onGuardar)
  guardarRef.current = onGuardar
  const guardar = useCallback((mudados: Record<string, Decisao>) => {
    const enviar = guardarRef.current
    if (!enviar) return
    enviar(
      Object.entries(mudados).map(([fitId, decisao]) => ({
        id: fitId,
        decision: {
          action: decisao.action,
          categoryId: decisao.categoryId,
          contactId: decisao.contactId,
          counterAccountId: decisao.counterAccountId,
          transactionId: decisao.transactionId,
          draft: decisao.draft,
        },
      })),
    )
  }, [])

  const mudarDecisao = useCallback(
    (fitId: string, mudanca: Partial<Decisao>) =>
      setDecisoes((atual) => {
        const nova = { ...(atual[fitId] ?? vazia()), ...mudanca }
        guardar({ [fitId]: nova })
        return { ...atual, [fitId]: nova }
      }),
    [guardar],
  )

  /** A mesma decisão para todas as linhas marcadas, de uma vez só */
  const mudarVarias = useCallback(
    (fitIds: string[], mudanca: Partial<Decisao>) =>
      setDecisoes((atual) => {
        const proximo = { ...atual }
        const mudados: Record<string, Decisao> = {}
        for (const fitId of fitIds) {
          const nova = { ...(atual[fitId] ?? vazia()), ...mudanca }
          proximo[fitId] = nova
          mudados[fitId] = nova
        }
        guardar(mudados)
        return proximo
      }),
    [guardar],
  )

  /*
   * Escolher (ou trocar) o lançamento desta linha. Um lançamento pertence a uma linha só: se
   * já estava ligado a outra, sai de lá — é o que permite corrigir um palpite errado sem ter
   * de desfazer nada antes.
   */
  const vincular = useCallback(
    (fitId: string, transactionId: string | null, juntar = false) =>
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
        const anterior = atual[fitId] ?? vazia()
        proximo[fitId] = transactionId
          ? { ...anterior, action: 'link', transactionId }
          : { ...anterior, action: 'create', transactionId: null }
        // O que mudou aqui pode ser mais de uma linha: quem perdeu o par também foi mexido
        guardar(
          Object.fromEntries(
            Object.entries(proximo).filter(([id, decisao]) => decisao !== atual[id]),
          ),
        )
        return proximo
      }),
    [guardar],
  )

  const marcar = useCallback(
    (fitId: string, ligada: boolean) =>
      setMarcadas((atual) => {
        const proximo = new Set(atual)
        if (ligada) proximo.add(fitId)
        else proximo.delete(fitId)
        return proximo
      }),
    [],
  )

  const detalhar = useCallback((row: ImportRow) => setDetalhando(row), [])

  const valoresIniciais = useMemo(() => {
    const linha = detalhando
    if (!linha) return null
    const decisao = decisoes[linha.fitId]
    const rascunho = decisao?.draft
    const amountCents = Math.abs(linha.amountCents)
    return {
      type: (linha.amountCents > 0 ? 'income' : 'expense') as 'income' | 'expense',
      amountCents,
      accountId,
      description: rascunho?.description ?? linha.description,
      contactId: decisao?.contactId ?? null,
      // Parcela: a competência é a data da compra; o caixa continua sendo o da parcela
      purchaseDate: rascunho?.purchaseDate ?? linha.installment?.purchaseDate ?? linha.date,
      paymentDate: rascunho?.paymentDate ?? linha.date,
      splits:
        rascunho && rascunho.splits.length > 0
          ? rascunho.splits
          : [{ categoryId: decisao?.categoryId ?? null, amountCents }],
    }
    // Um objeto novo a cada render faria o formulário se recarregar enquanto a pessoa digita
  }, [detalhando, decisoes, accountId])

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
            contactId: decisao.action === 'create' ? decisao.contactId : null,
            counterAccountId: decisao.action === 'transfer' ? decisao.counterAccountId : null,
          }
        }),
    )

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

  const porStatus = useMemo(() => {
    const mapa = { match: [] as ImportRow[], new: [] as ImportRow[], imported: [] as ImportRow[] }
    for (const row of preview.rows) mapa[row.status].push(row)
    return mapa
  }, [preview])

  const decidiveis = porStatus.match.length + porStatus.new.length
  const selecionadas = [...marcadas]

  /*
   * Categoria em massa só faz sentido quando as marcadas são todas do mesmo lado: as
   * categorias de entrada e de saída são listas diferentes, e misturar não daria escolha
   * possível. Marcou saídas e entradas juntas? As outras ações continuam valendo.
   */
  const tipoDasMarcadas = useMemo(() => {
    let tipo: 'income' | 'expense' | null = null
    for (const row of preview.rows) {
      if (!marcadas.has(row.fitId)) continue
      const dela = row.amountCents > 0 ? 'income' : 'expense'
      if (tipo && tipo !== dela) return null
      tipo = dela
    }
    return tipo
  }, [preview, marcadas])

  return (
    <>
      {/* O contexto do que está na tela: a conta, o período e a conferência do saldo */}
      {(resumo || preview.check.matches) && (
        <div className="flex flex-col gap-1 px-1">
          {resumo}
          <ContaDoExtrato preview={preview} />
        </div>
      )}

      {blocos.map(({ status, titulo, texto }) => {
        const linhas = porStatus[status]
        if (linhas.length === 0) return null
        const idsDoBloco = linhas.map((row) => row.fitId)
        const marcadasNoBloco = idsDoBloco.filter((fitId) => marcadas.has(fitId)).length
        return (
          <section key={status}>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {/*
               * O cabeçalho mora dentro da lista e gruda no topo: numa fila longa, rolando, a
               * pessoa continua sabendo em que bloco está — e a caixa de marcar tudo fica
               * alinhada com as das linhas, na mesma coluna.
               */}
              <li className="sticky top-0 z-[1] flex items-center gap-3 bg-muted/40 px-3 py-2 backdrop-blur">
                {status === 'imported' ? (
                  <span className="size-4 shrink-0" />
                ) : (
                  <Checkbox
                    aria-label={`Marcar tudo em ${titulo}`}
                    checked={marcadasNoBloco > 0 && marcadasNoBloco === idsDoBloco.length}
                    indeterminate={marcadasNoBloco > 0 && marcadasNoBloco < idsDoBloco.length}
                    onCheckedChange={(ligada) =>
                      setMarcadas((atual) => {
                        const proximo = new Set(atual)
                        for (const fitId of idsDoBloco) {
                          if (ligada) proximo.add(fitId)
                          else proximo.delete(fitId)
                        }
                        return proximo
                      })
                    }
                  />
                )}
                <h2 className="shrink-0 font-medium text-xs">
                  {titulo} <span className="tabular-nums">({linhas.length})</span>
                </h2>
                <p className="hidden truncate text-muted-foreground text-xs sm:block">{texto}</p>
              </li>
              {linhas.map((row) => (
                <Linha
                  key={row.fitId}
                  row={row}
                  contatoNome={nomeDoContato.get(decisoes[row.fitId]?.contactId ?? '') ?? null}
                  textos={textos}
                  rotulos={rotulos}
                  decisao={decisoes[row.fitId] ?? decisaoPadrao(row)}
                  marcada={marcadas.has(row.fitId)}
                  arvore={row.amountCents > 0 ? arvoreReceita : arvoreDespesa}
                  disponiveis={todosDisponiveis}
                  emUsoRef={emUsoRef}
                  divisao={divisoes.get(decisoes[row.fitId]?.transactionId ?? '') ?? null}
                  outrasContas={outrasContas}
                  onMarcar={marcar}
                  onMudar={mudarDecisao}
                  onDetalhar={detalhar}
                  onVincular={vincular}
                />
              ))}
            </ul>
          </section>
        )
      })}

      <SemPar itens={semPar} periodo={[preview.start, preview.end]} fonte={textos.fonte} />

      {/*
       * Detalhar uma linha: o formulário de sempre, preenchido com o rascunho guardado — ou,
       * na primeira vez, com o que o banco mandou. Salvar não cria nada: guarda a decisão.
       */}
      <TransactionFormDialog
        open={detalhando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhando(null)
        }}
        month={(detalhando?.date ?? preview.start ?? '').slice(0, 7)}
        initialValues={valoresIniciais}
        lockKeyFields
        onSubmitValues={(values) => {
          const linha = detalhando
          if (!linha) return
          mudarDecisao(linha.fitId, {
            action: 'create',
            contactId: values.contactId,
            categoryId: values.splits.length === 1 ? (values.splits[0]?.categoryId ?? null) : null,
            draft: {
              description: values.description,
              purchaseDate: values.purchaseDate,
              paymentDate: values.paymentDate,
              splits: values.splits,
            },
          })
          setDetalhando(null)
        }}
      />

      {/*
       * A barra fica colada no rodapé da janela: com cinquenta linhas, o botão de confirmar
       * estaria a uma rolagem inteira de distância, e o que a pessoa marcou lá em cima teria
       * de ser levado de memória até aqui embaixo.
       */}
      <div className="-mx-4 md:-mx-6 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        {selecionadas.length > 0 ? (
          <AcoesEmMassa
            quantas={selecionadas.length}
            textos={textos}
            rotulos={rotulos}
            arvore={tipoDasMarcadas === 'income' ? arvoreReceita : arvoreDespesa}
            tipo={tipoDasMarcadas}
            onAcao={(action) => {
              mudarVarias(selecionadas, { action })
              setMarcadas(new Set())
            }}
            onCategoria={(categoryId) => {
              mudarVarias(selecionadas, { action: 'create', categoryId })
              setMarcadas(new Set())
            }}
            onLimpar={() => setMarcadas(new Set())}
          />
        ) : (
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
        )}
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
          {decidiveis > 0 && !salvando && (
            <span className="tabular-nums opacity-80">
              {contagem.create + contagem.link + contagem.transfer}
            </span>
          )}
        </Button>
      </div>
    </>
  )
}

/** O que dá para fazer com as linhas marcadas, sem abrir uma por uma */
function AcoesEmMassa({
  quantas,
  textos,
  rotulos,
  arvore,
  tipo,
  onAcao,
  onCategoria,
  onLimpar,
}: {
  quantas: number
  textos: TextosDaConferencia
  rotulos: Record<Acao, Rotulo>
  arvore: ReturnType<typeof categoryTree>
  /** `null` quando há entradas e saídas juntas: aí não existe uma lista de categorias só */
  tipo: 'income' | 'expense' | null
  onAcao: (action: Acao) => void
  onCategoria: (categoryId: string | null) => void
  onLimpar: () => void
}) {
  const emMassa: Acao[] = ['create', ...(textos.temDepois ? (['later'] as Acao[]) : []), 'skip']
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm tabular-nums">
        {quantas} {quantas === 1 ? 'marcada' : 'marcadas'}
      </span>
      {/* Vinte tarifas do mesmo banco viram uma categoria só, num gesto */}
      {tipo && (
        <div className="w-48">
          <CategoryPicker
            tree={arvore}
            kind={tipo}
            value={null}
            vazio="Definir categoria…"
            onChange={onCategoria}
            label={`Categoria das ${quantas} marcadas`}
          />
        </div>
      )}
      {emMassa.map((acao) => {
        const { label, icon: Icone } = rotulos[acao]
        return (
          <Button key={acao} variant="outline" size="sm" onClick={() => onAcao(acao)}>
            <Icone />
            {label}
          </Button>
        )
      })}
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onLimpar}>
        Limpar
      </Button>
    </div>
  )
}

/**
 * A conferência do extrato: saldo anterior mais o movimento dá o saldo final que o banco diz.
 * Quando fecha, é a prova de que nada se perdeu no caminho.
 */
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
  /** O nome do contato já escolhido, resolvido lá em cima: aqui é só texto */
  contatoNome: string | null
  textos: TextosDaConferencia
  rotulos: Record<Acao, Rotulo>
  decisao: Decisao
  marcada: boolean
  arvore: ReturnType<typeof categoryTree>
  disponiveis: ImportMatch[]
  emUsoRef: React.RefObject<Map<string, { fitId: string; rotulo: string; amountCents: number }[]>>
  divisao: { soma: number; alvo: number; bate: boolean } | null
  outrasContas: { id: string; name: string }[]
  onMarcar: (fitId: string, ligada: boolean) => void
  onMudar: (fitId: string, mudanca: Partial<Decisao>) => void
  onDetalhar: (row: ImportRow) => void
  onVincular: (fitId: string, transactionId: string | null, juntar?: boolean) => void
}

/**
 * Uma linha da conferência.
 *
 * Memoizada de propósito: numa fila de duzentas linhas, cada clique redesenhava as duzentas —
 * e um segundo inteiro se passava entre clicar e ver. As funções chegam prontas de cima e
 * recebem o `fitId`, para nenhuma delas mudar de identidade a cada render.
 */
const Linha = memo(function Linha({
  row,
  contatoNome,
  textos,
  rotulos,
  decisao,
  marcada,
  arvore,
  disponiveis,
  emUsoRef,
  divisao,
  outrasContas,
  onMarcar,
  onMudar,
  onDetalhar,
  onVincular,
}: LinhaProps) {
  const [escolhendoPar, setEscolhendoPar] = useState(false)
  const entrada = row.amountCents > 0
  const jaEntrou = row.status === 'imported'
  const escolhido = jaEntrou
    ? row.match
    : (disponiveis.find((item) => item.id === decisao.transactionId) ?? null)
  const conciliando = decisao.action === 'link'
  const rotulo = rotulos[decisao.action]

  const detalhes = [
    shortDate(row.date),
    decisao.draft && decisao.draft.description !== row.description
      ? `no banco: ${row.description}`
      : null,
    row.kind,
    /*
     * A parcela precisa aparecer aqui: o valor desta linha é de uma prestação, mas o gasto é
     * da data da compra — e é nessa data que ela vai entrar. Sem dizer isso, quem confere
     * acha que o Bolso errou o mês.
     */
    row.installment
      ? `parcela ${row.installment.number}/${row.installment.count} · compra em ${shortDate(row.installment.purchaseDate)}`
      : null,
    contatoNome,
  ].filter(Boolean)

  const opcoes: Acao[] = [
    'create',
    'link',
    ...(outrasContas.length > 0 ? (['transfer'] as Acao[]) : []),
    ...(textos.temDepois ? (['later'] as Acao[]) : []),
    'skip',
  ]

  return (
    <li
      className={`group/row flex flex-col gap-1.5 px-3 py-2.5 transition-colors ${
        marcada ? 'bg-primary/[0.04]' : ''
      } ${jaEntrou || decisao.action === 'skip' || decisao.action === 'later' ? 'opacity-55' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {jaEntrou ? (
          <span className="size-4 shrink-0" />
        ) : (
          <Checkbox
            checked={marcada}
            onCheckedChange={(ligada) => onMarcar(row.fitId, ligada)}
            aria-label={`Marcar ${row.description || 'lançamento'}`}
          />
        )}

        <span className="min-w-36 flex-1 basis-40">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm">
              {decisao.draft?.description || row.description || '—'}
            </span>
            <InstallmentBadge installment={row.installment} />
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {detalhes.join(' · ')}
          </span>
        </span>

        {/* A categoria é o que falta em quase toda linha nova: fica à mão, não dentro de menu */}
        {decisao.action === 'create' && !jaEntrou ? (
          <div className="hidden w-44 shrink-0 md:block">
            <CategoryPicker
              tree={arvore}
              kind={entrada ? 'income' : 'expense'}
              value={decisao.categoryId}
              onChange={(categoryId) => onMudar(row.fitId, { categoryId })}
              label={`Categoria de ${row.description || 'lançamento'}`}
            />
          </div>
        ) : (
          <span className="hidden w-44 shrink-0 md:block" />
        )}

        {/* Coluna fixa no desktop; no celular, empurra a decisão para a beirada direita */}
        <span
          className={`w-28 shrink-0 text-right text-sm tabular-nums max-md:w-auto max-md:flex-1 ${
            entrada ? 'text-emerald-600 dark:text-emerald-400' : ''
          }`}
        >
          {entrada ? '+' : '−'}
          {formatCents(Math.abs(row.amountCents))}
        </span>

        {!jaEntrou && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Decisão de ${row.description || 'lançamento'}`}
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`w-28 shrink-0 justify-between font-normal ${rotulo.tom ?? 'text-muted-foreground'}`}
                  />
                }
              >
                <span className="flex items-center gap-1.5">
                  <rotulo.icon className="size-3.5" />
                  {rotulo.label}
                </span>
                <ChevronDown className="opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {opcoes.map((acao) => {
                  const { label, icon: Icone } = rotulos[acao]
                  return (
                    <DropdownMenuItem
                      key={acao}
                      onClick={() => {
                        onMudar(row.fitId, { action: acao })
                        // Conciliar sem par escolhido: a lista abre em seguida, é o passo que falta
                        if (acao === 'link' && !decisao.transactionId) setEscolhendoPar(true)
                      }}
                    >
                      <Check className={acao === decisao.action ? '' : 'opacity-0'} />
                      <Icone className="text-muted-foreground" />
                      {label}
                    </DropdownMenuItem>
                  )
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDetalhar(row)}>
                  <Pencil />
                  Detalhar…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* No mouse, o lápis fica à mão sem ocupar a linha o tempo todo */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDetalhar(row)}
              title="Preencher tudo neste lançamento"
              aria-label={`Detalhar ${row.description || 'lançamento'}`}
              className="hidden shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-fine:inline-flex"
            >
              <Pencil />
            </Button>
          </>
        )}
      </div>

      {/* A segunda linha só existe quando a decisão pede algo: o par, ou a outra conta */}
      {(conciliando || jaEntrou) && (
        <div className="flex items-center gap-2 pl-7">
          {escolhido ? (
            <p
              className={`flex min-w-0 items-center gap-1.5 text-xs ${
                jaEntrou ? 'text-muted-foreground' : 'text-primary'
              }`}
            >
              <Link2 className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                {jaEntrou ? 'Já é ' : 'Concilia com '}
                <span className="font-medium">
                  {escolhido.description || 'lançamento sem descrição'}
                  {escolhido.installment &&
                    ` ${escolhido.installment.number}/${escolhido.installment.count}`}
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
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-400">
              <TriangleAlert className="size-3.5 shrink-0" />
              Escolha com qual lançamento esta linha se junta
            </p>
          )}
          {!jaEntrou && (
            <EscolherPar
              row={row}
              escolhidoId={decisao.transactionId}
              disponiveis={disponiveis}
              emUsoRef={emUsoRef}
              aberto={escolhendoPar}
              onAberto={setEscolhendoPar}
              onEscolher={(transactionId, juntar) => onVincular(row.fitId, transactionId, juntar)}
            />
          )}
        </div>
      )}

      {decisao.action === 'transfer' && !jaEntrou && (
        <div className="flex items-center gap-2 pl-7">
          <span className="shrink-0 text-muted-foreground text-xs">
            {entrada ? 'veio de' : 'foi para'}
          </span>
          <Select
            items={outrasContas.map((conta) => ({ value: conta.id, label: conta.name }))}
            value={decisao.counterAccountId ?? ''}
            onValueChange={(next) => onMudar(row.fitId, { counterAccountId: next as string })}
          >
            <SelectTrigger
              size="sm"
              aria-label={`Outra conta de ${row.description || 'lançamento'}`}
              className="w-56"
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

      {/* No celular a categoria não cabe na linha de cima; aqui ela tem a largura toda */}
      {decisao.action === 'create' && !jaEntrou && (
        <div className="pl-7 md:hidden">
          <CategoryPicker
            tree={arvore}
            kind={entrada ? 'income' : 'expense'}
            value={decisao.categoryId}
            onChange={(categoryId) => onMudar(row.fitId, { categoryId })}
            label={`Categoria de ${row.description || 'lançamento'} (celular)`}
          />
        </div>
      )}
    </li>
  )
})

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
              {/* A parcela ao lado do nome, como na lista de lançamentos: é por ela que a
                  pessoa reconhece qual das dez é esta */}
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm">
                  {item.description || 'Lançamento sem descrição'}
                </span>
                <InstallmentBadge installment={item.installment} />
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
  emUsoRef: React.RefObject<Map<string, { fitId: string; rotulo: string; amountCents: number }[]>>
  aberto: boolean
  onAberto: (aberto: boolean) => void
  onEscolher: (transactionId: string | null, juntar?: boolean) => void
}

/**
 * Escolhe à mão com qual lançamento esta linha se junta.
 *
 * O palpite do Bolso acerta na maioria, mas dois gastos do mesmo valor na mesma semana são
 * indistinguíveis para ele e óbvios para quem lançou. Os de mesmo valor vêm em cima, marcados;
 * a busca serve para o resto. A lista só é montada quando a pessoa abre: ordenar centenas de
 * candidatos em cada uma das centenas de linhas, a cada clique, era o que travava a tela.
 */
function EscolherPar({
  row,
  escolhidoId,
  disponiveis,
  emUsoRef,
  aberto,
  onAberto,
  onEscolher,
}: EscolherParProps) {
  const [query, setQuery] = useState('')

  const mesmoValor = (item: ImportMatch) => item.amountCents === Math.abs(row.amountCents)
  const lista = useMemo(() => {
    if (!aberto) return []
    const chave = searchKey(query)
    return disponiveis
      .filter(
        (item) =>
          !chave ||
          searchKey(item.description).includes(chave) ||
          formatCents(item.amountCents).includes(query.trim()),
      )
      .sort((a, b) => {
        // Mesmo valor primeiro; depois, o mais perto da data da linha
        const iguais = (item: ImportMatch) =>
          item.amountCents === Math.abs(row.amountCents) ? 0 : 1
        if (iguais(a) !== iguais(b)) return iguais(a) - iguais(b)
        const perto = (item: ImportMatch) =>
          Math.abs(Date.parse(item.purchaseDate) - Date.parse(row.date))
        return perto(a) - perto(b)
      })
      .slice(0, 40)
  }, [aberto, query, disponiveis, row.amountCents, row.date])

  return (
    <Popover
      open={aberto}
      onOpenChange={(next) => {
        onAberto(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" />}
        aria-label={`Escolher o lançamento de ${row.description || 'lançamento'}`}
      >
        {escolhidoId ? 'Trocar' : 'Escolher…'}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-96 p-0">
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
              const ocupantes = emUsoRef.current?.get(item.id) ?? []
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
                    onAberto(false)
                    setQuery('')
                  }}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">
                        {item.description || 'Lançamento sem descrição'}
                      </span>
                      {/* Dez parcelas da mesma compra são idênticas menos por isto */}
                      <InstallmentBadge installment={item.installment} />
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
        {escolhidoId && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                onEscolher(null)
                onAberto(false)
              }}
            >
              <X />
              Desfazer este par
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
