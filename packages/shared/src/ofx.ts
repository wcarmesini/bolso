/*
 * Leitor de OFX — o extrato que todo banco brasileiro exporta.
 *
 * O formato tem duas gerações: OFX 1.x é SGML (as tags não fecham) e OFX 2.x é XML. As duas
 * são lidas do mesmo jeito aqui: cada valor vai da tag até o próximo "<". É por isso que o
 * leitor é escrito à mão em vez de usar uma biblioteca — são três regras e nenhuma dependência.
 */

/** Um lançamento do extrato. Valor negativo = saiu dinheiro. */
export type OfxTransaction = {
  /** Identificador do banco para a transação; é ele que evita importar duas vezes */
  fitId: string
  date: string
  amountCents: number
  description: string
  /** Como o banco classificou a linha ("Pix - Enviado", "Compra com Cartão") */
  kind: string | null
}

export type OfxStatement = {
  /** Conta no banco (ACCTID) e banco (BANKID), quando o arquivo informa */
  accountNumber: string | null
  bankNumber: string | null
  start: string | null
  end: string | null
  transactions: OfxTransaction[]
  /*
   * Quantas linhas de saldo vieram no arquivo. Vários bancos mandam "Saldo do dia" e "Saldo
   * Anterior" como se fossem lançamentos: são fotografias da conta, não dinheiro entrando ou
   * saindo. Importá-las dobraria o extrato, então ficam de fora — e a contagem aparece na
   * tela, para ninguém achar que sumiu alguma coisa.
   */
  balanceLines: number
  /** Saldo final informado pelo banco (LEDGERBAL), para conferir a importação */
  balance: { amountCents: number; date: string | null } | null
  /*
   * O "Saldo Anterior", quando o banco manda. Com ele dá para fechar a conta: saldo anterior
   * mais os lançamentos tem que dar o saldo final. Se fechar, nada se perdeu na leitura.
   */
  previousBalanceCents: number | null
}

export class OfxParseError extends Error {}

const tagValue = (bloco: string, tag: string) => {
  const match = new RegExp(`<${tag}>([^<\r\n]*)`, 'i').exec(bloco)
  return match?.[1]?.trim() ?? null
}

/** "20260915", "20260915120000" ou "20260915120000[-3:BRT]" → "2026-09-15" */
export function parseOfxDate(value: string | null) {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (digits.length < 8) return null
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

/**
 * "-1234.56" → -123456 centavos. Feito por texto, sem float: 0.1 + 0.2 não fecha em centavos,
 * e extrato tem que fechar. Aceita vírgula, que alguns bancos usam.
 */
export function parseOfxAmount(value: string | null) {
  if (!value) return null
  const limpo = value.replace(/\s/g, '').replace(',', '.')
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(limpo)
  if (!match) return null
  const [, sinal, inteiro = '0', decimal = ''] = match
  const centavos = Number(inteiro || '0') * 100 + Number(`${decimal}00`.slice(0, 2))
  return sinal === '-' ? -centavos : centavos
}

const entidades: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
}

const limparTexto = (texto: string) =>
  texto
    .replace(/&[a-z]+;/gi, (entidade) => entidades[entidade.toLowerCase()] ?? entidade)
    .replace(/\s+/g, ' ')
    .trim()

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "Saldo do dia", "Saldo Anterior": foto da conta que o banco manda junto dos lançamentos */
const ehLinhaDeSaldo = (fitId: string, name: string) => !fitId && /^saldo\b/i.test(semAcento(name))

/*
 * O memo costuma vir com data, hora e o CPF/CNPJ na frente de quem interessa
 * ("02/09 12:30 00010806353945 DEBORA DUTRA"). Fica só a parte que a pessoa reconhece.
 */
const limparMemo = (memo: string) =>
  memo
    .replace(/^\d{2}\/\d{2}(\s+\d{2}:\d{2})?\s*/, '')
    .replace(/\b\d{11,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

const menor = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b))
const maior = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b))

/** Lê o extrato inteiro. Lança OfxParseError quando o arquivo não parece um OFX. */
export function parseOfx(text: string): OfxStatement {
  if (!/<OFX>/i.test(text)) {
    throw new OfxParseError('Arquivo não parece um OFX: não encontrei a marca <OFX>.')
  }

  const transactions: OfxTransaction[] = []
  const usados = new Set<string>()
  let balanceLines = 0
  let previousBalanceCents: number | null = null

  const blocos = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  for (const bloco of blocos) {
    const date = parseOfxDate(tagValue(bloco, 'DTPOSTED'))
    const amountCents = parseOfxAmount(tagValue(bloco, 'TRNAMT'))
    if (!date || amountCents === null) continue

    const fitId = tagValue(bloco, 'FITID') ?? ''
    const name = limparTexto(tagValue(bloco, 'NAME') ?? '')
    const memo = limparTexto(tagValue(bloco, 'MEMO') ?? '')

    if (ehLinhaDeSaldo(fitId, name)) {
      balanceLines += 1
      if (/anterior/i.test(semAcento(name))) previousBalanceCents = amountCents
      continue
    }

    /*
     * Sem FITID (acontece), ou com um FITID repetido no mesmo arquivo (também acontece), a
     * linha ganha um identificador derivado dela mesma. Precisa ser estável: é assim que uma
     * segunda importação do mesmo extrato reconhece o que já entrou.
     */
    const base = fitId || `${date}-${amountCents}`
    let id = base
    for (let n = 2; usados.has(id); n += 1) id = `${base}#${n}`
    usados.add(id)

    const detalhe = limparMemo(memo)
    transactions.push({
      fitId: id,
      date,
      amountCents,
      description: detalhe || name,
      kind: name || null,
    })
  }

  if (transactions.length === 0) {
    throw new OfxParseError('Não encontrei nenhum lançamento neste arquivo.')
  }

  /*
   * Alguns bancos põem em DTSTART/DTEND o dia da exportação, não o período do extrato. Quando
   * isso acontece, as próprias datas dos lançamentos é que mandam.
   */
  const datas = transactions.map((item) => item.date).sort()
  const saldo = parseOfxAmount(tagValue(text, 'BALAMT'))

  return {
    accountNumber: tagValue(text, 'ACCTID'),
    bankNumber: tagValue(text, 'BANKID'),
    start: menor(parseOfxDate(tagValue(text, 'DTSTART')), datas[0] ?? null),
    end: maior(parseOfxDate(tagValue(text, 'DTEND')), datas.at(-1) ?? null),
    transactions,
    balanceLines,
    balance:
      saldo === null ? null : { amountCents: saldo, date: parseOfxDate(tagValue(text, 'DTASOF')) },
    previousBalanceCents,
  }
}
