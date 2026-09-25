import {
  accountTypeLabels,
  addMonthsToMonth,
  type MonthlyInterval,
  monthlyIntervals,
  monthsPerInterval,
  type NetWorthRow,
  parseMonth,
} from '@bolso/shared'
import { Landmark } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/empty-state'
import { MonthPicker } from '@/components/month-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { umDe, useRemembered } from '@/hooks/use-remembered'
import { currentMonth, shortMonthLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useNetWorthReport } from '../queries'
import { CONTAGENS, countLabel, intervalOptions } from './monthly-toolbar'

/*
 * Evolução patrimonial.
 *
 * O mês a mês responde "para onde foi o dinheiro"; este responde "o que ficou". Cada coluna
 * é uma foto do fim do período: o que se tem em cima, o que se deve embaixo, e a diferença
 * — que é o número que importa acompanhar ao longo do tempo.
 */

const alinhado = 'px-3 py-2 text-right tabular-nums'
const fixa = 'sticky left-0 z-10 bg-card'

/** O saldo de uma conta pode ficar negativo (cheque especial, cartão estourado) */
const tomDoSaldo = (valor: number) => (valor < 0 ? 'text-destructive' : '')

export function NetWorthReport() {
  const [interval, setInterval] = useRemembered<MonthlyInterval>(
    'patrimonio:intervalo',
    'month',
    umDe(monthlyIntervals),
  )
  const [count, setCount] = useRemembered<number>(
    'patrimonio:colunas',
    12,
    (valor): valor is number => typeof valor === 'number' && CONTAGENS.includes(valor),
  )
  // Sem nada guardado, a tabela termina no mês corrente: é para lá que se olha primeiro
  const [start, setStart] = useRemembered<string>(
    'patrimonio:inicio',
    alinharInicio(currentMonth(), count, interval),
    (valor): valor is string => typeof valor === 'string' && /^\d{4}-\d{2}$/.test(valor),
  )

  const { data, isPending, isError } = useNetWorthReport({ start, count, interval })

  const colunas = useMemo(
    () => (data?.periods ?? []).map((period) => rotuloDaColuna(period.start, interval)),
    [data, interval],
  )

  const intervalItems = monthlyIntervals.map((value) => ({
    value,
    label: intervalOptions[value].label,
  }))
  const countItems = intervalOptions[interval].counts.map((value) => ({
    value: String(value),
    label: countLabel(interval, value),
  }))

  const temConta = (data?.assets.rows.length ?? 0) + (data?.liabilities.rows.length ?? 0) > 0

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
          <Select
            items={intervalItems}
            value={interval}
            onValueChange={(next) => {
              const escolhido = next as MonthlyInterval
              setInterval(escolhido)
              // O fim da tabela é a âncora: mudar o intervalo não muda até onde se olha
              setStart(alinharInicio(fimDaTabela(start, count, interval), count, escolhido))
            }}
          >
            <SelectTrigger size="sm" aria-label="Intervalo" className={gatilho}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervalItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

          <MonthPicker
            label="Início"
            value={start}
            onChange={setStart}
            granularity={interval}
            discreto
          />

          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

          <Select
            items={countItems}
            value={String(count)}
            onValueChange={(next) => {
              const quantas = Number(next)
              setStart(alinharInicio(fimDaTabela(start, count, interval), quantas, interval))
              setCount(quantas)
            }}
          >
            <SelectTrigger size="sm" aria-label="Período" className={gatilho}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar o relatório.</p>
      ) : !temConta ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta ainda"
          text="Cadastre suas contas em Ajustes → Contas e o patrimônio aparece aqui, mês a mês."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className={`${fixa} px-3 py-2 text-left font-normal`}>Conta</th>
                {colunas.map((coluna) => (
                  <th key={coluna} className="px-3 py-2 text-right font-normal">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <Lado titulo="O que eu tenho" lado={data.assets} colunas={colunas} />
              <Lado titulo="O que eu devo" lado={data.liabilities} colunas={colunas} />

              <tr className="border-t-2">
                <th scope="row" className={`${fixa} px-3 py-2 text-left font-semibold`}>
                  Patrimônio
                </th>
                {data.netValues.map((valor, indice) => (
                  <td
                    key={data.periods[indice]?.start ?? indice}
                    className={`${alinhado} font-semibold ${tomDoSaldo(valor)}`}
                  >
                    {formatCents(valor)}
                  </td>
                ))}
              </tr>

              <tr className="text-muted-foreground text-xs">
                <th scope="row" className={`${fixa} px-3 py-1.5 text-left font-normal`}>
                  Variação
                </th>
                {data.changeValues.map((valor, indice) => (
                  <td
                    key={data.periods[indice]?.start ?? indice}
                    className="px-3 py-1.5 text-right tabular-nums"
                  >
                    {/* A primeira coluna não tem com o que comparar */}
                    {indice === 0 ? '—' : `${valor > 0 ? '+' : ''}${formatCents(valor)}`}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Cada coluna é o saldo no fim do período, pela data em que o dinheiro se move (no cartão, o
        vencimento da fatura). As transferências entram aqui: elas não mudam o patrimônio, mas mudam
        o saldo de cada conta.
      </p>
    </>
  )
}

const gatilho =
  'border-0 bg-transparent px-2 text-foreground shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted'

/** As contas de um lado do balanço, com o subtotal */
function Lado({
  titulo,
  lado,
  colunas,
}: {
  titulo: string
  lado: { rows: NetWorthRow[]; values: number[] }
  /** Os rótulos das colunas servem de chave: índice não identifica linha nenhuma */
  colunas: string[]
}) {
  if (lado.rows.length === 0) return null
  return (
    <>
      <tr className="border-t bg-muted/30">
        <th scope="row" className={`${fixa} bg-transparent px-3 py-1.5 text-left font-medium`}>
          {titulo}
        </th>
        {lado.values.map((valor, indice) => (
          <td key={colunas[indice]} className={`${alinhado} py-1.5 font-medium`}>
            {formatCents(valor)}
          </td>
        ))}
      </tr>
      {lado.rows.map((row) => (
        <tr key={row.accountId} className="border-t">
          <th scope="row" className={`${fixa} px-3 py-1.5 text-left font-normal`}>
            <span className="block truncate">{row.name}</span>
            {/* Muita gente chama a conta pelo tipo ("Poupança"): repetir embaixo seria ruído */}
            {accountTypeLabels[row.type] !== row.name && (
              <span className="block text-muted-foreground text-xs">
                {accountTypeLabels[row.type]}
              </span>
            )}
          </th>
          {row.values.map((valor, indice) => (
            <td key={colunas[indice]} className={`${alinhado} py-1.5 ${tomDoSaldo(valor)}`}>
              {formatCents(valor)}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** "out/26" no mensal; "3º tri/26" e "2026" nos outros */
function rotuloDaColuna(inicio: string, interval: MonthlyInterval) {
  const { year, month } = parseMonth(inicio)
  if (interval === 'year') return String(year)
  if (interval === 'quarter') {
    return `${Math.floor((month - 1) / 3) + 1}º tri/${String(year).slice(2)}`
  }
  return shortMonthLabel(inicio)
}

/** Último mês da tabela, que é a âncora quando o recorte muda */
function fimDaTabela(start: string, count: number, interval: MonthlyInterval) {
  return addMonthsToMonth(start, count * monthsPerInterval[interval] - 1)
}

function alinharInicio(fim: string, count: number, interval: MonthlyInterval) {
  return addMonthsToMonth(fim, -((count - 1) * monthsPerInterval[interval]))
}
