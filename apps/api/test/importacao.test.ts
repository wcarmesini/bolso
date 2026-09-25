import {
  type Account,
  type Contact,
  type ImportPreview,
  type ImportResult,
  parseOfx,
  parseOfxAmount,
  parseOfxDate,
  type Transaction,
} from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

/** Extrato de exemplo no formato OFX 1.x (SGML, tags sem fechar), como os bancos exportam */
const extrato = (linhas: string) => `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
${linhas}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const lancamentoOfx = (fitId: string, data: string, valor: string, memo: string) =>
  `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${data}120000[-3:BRT]<TRNAMT>${valor}<FITID>${fitId}<MEMO>${memo}</STMTTRN>`

/** Como os bancos mandam de verdade: NAME com o tipo da linha, MEMO com o resto */
const linhaDoBanco = (
  name: string,
  memo: string,
  fitId = '',
  valor = '-10.00',
  data = '20260910',
) =>
  `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${data}120000[-3:BRT]<TRNAMT>${valor}<FITID>${fitId}<NAME>${name}<MEMO>${memo}</STMTTRN>`

describe('leitor de OFX', () => {
  it('lê data, valor e descrição de cada lançamento', () => {
    const statement = parseOfx(
      extrato(
        [
          lancamentoOfx('X1', '20260905', '-250.00', 'SUPERMERCADO SAO JOSE'),
          lancamentoOfx('X2', '20260910', '3000.00', 'SALARIO'),
        ].join('\n'),
      ),
    )
    expect(statement.accountNumber).toBe('12345-6')
    expect(statement.bankNumber).toBe('001')
    expect(statement.start).toBe('2026-09-01')
    expect(statement.transactions).toEqual([
      {
        fitId: 'X1',
        date: '2026-09-05',
        amountCents: -25000,
        description: 'SUPERMERCADO SAO JOSE',
        kind: null,
      },
      {
        fitId: 'X2',
        date: '2026-09-10',
        amountCents: 300000,
        description: 'SALARIO',
        kind: null,
      },
    ])
  })

  it('também lê OFX 2.x (XML, com as tags fechadas)', () => {
    const xml = `<?xml version="1.0"?><OFX><BANKTRANLIST>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260905</DTPOSTED><TRNAMT>-12.34</TRNAMT>
      <FITID>A1</FITID><NAME>PADARIA &amp; CIA</NAME></STMTTRN>
    </BANKTRANLIST></OFX>`
    const statement = parseOfx(xml)
    expect(statement.transactions[0]).toEqual({
      fitId: 'A1',
      date: '2026-09-05',
      amountCents: -1234,
      // Sem MEMO, a descrição é o nome que o banco deu
      description: 'PADARIA & CIA',
      kind: 'PADARIA & CIA',
    })
  })

  it('deixa de fora as linhas de saldo que o banco manda como lançamento', () => {
    const statement = parseOfx(
      extrato(
        [
          linhaDoBanco('Saldo Anterior', '', '', '48.76', '20260831'),
          linhaDoBanco('Pix - Enviado', '10/09 08:29 12345678901 FULANO DE TAL', 'P1', '-150.00'),
          linhaDoBanco('Saldo do dia', '', '', '1186.21', '20260910'),
        ].join('\n'),
      ),
    )
    // Fica só o lançamento de verdade; as duas linhas de saldo são contadas à parte
    expect(statement.transactions).toHaveLength(1)
    expect(statement.balanceLines).toBe(2)
    expect(statement.previousBalanceCents).toBe(4876)
  })

  it('tira do memo a data, a hora e o documento, e guarda o tipo da linha', () => {
    const statement = parseOfx(
      extrato(linhaDoBanco('Pix - Enviado', '10/09 08:29 12345678901 FULANO DE TAL', 'P1')),
    )
    expect(statement.transactions[0]).toMatchObject({
      description: 'FULANO DE TAL',
      kind: 'Pix - Enviado',
    })
  })

  it('dá um identificador próprio para linha sem FITID, ou com FITID repetido', () => {
    const statement = parseOfx(
      extrato(
        [
          linhaDoBanco('Compra com Cartão', 'PADARIA', '', '-10.00', '20260910'),
          linhaDoBanco('Compra com Cartão', 'PADARIA', '', '-10.00', '20260910'),
          linhaDoBanco('Compra com Cartão', 'MERCADO', 'REPETIDO', '-20.00', '20260911'),
          linhaDoBanco('Compra com Cartão', 'MERCADO', 'REPETIDO', '-20.00', '20260911'),
        ].join('\n'),
      ),
    )
    const ids = statement.transactions.map((item) => item.fitId)
    // Quatro linhas, quatro identificadores: nenhuma some por causa de id repetido
    expect(new Set(ids).size).toBe(4)
    expect(ids).toEqual(['2026-09-10--1000', '2026-09-10--1000#2', 'REPETIDO', 'REPETIDO#2'])
  })

  it('quando o banco manda a data da exportação, o período vem dos lançamentos', () => {
    const arquivo = extrato(
      [
        lancamentoOfx('A', '20260902', '-10.00', 'PRIMEIRA'),
        lancamentoOfx('B', '20260924', '-10.00', 'ÚLTIMA'),
      ].join('\n'),
    )
      // O banco põe o dia de hoje nos dois campos
      .replace('<DTSTART>20260901<DTEND>20260930', '<DTSTART>20260924<DTEND>20260924')
    const statement = parseOfx(arquivo)
    expect(statement.start).toBe('2026-09-02')
    expect(statement.end).toBe('2026-09-24')
  })

  it('converte valores sem erro de arredondamento', () => {
    expect(parseOfxAmount('-1234.56')).toBe(-123456)
    expect(parseOfxAmount('0.10')).toBe(10)
    expect(parseOfxAmount('19.99')).toBe(1999)
    // Alguns bancos mandam vírgula, e centavos com um dígito só
    expect(parseOfxAmount('-1234,5')).toBe(-123450)
    expect(parseOfxAmount('100')).toBe(10000)
    expect(parseOfxDate('20260915120000[-3:BRT]')).toBe('2026-09-15')
  })

  it('recusa arquivo que não é OFX', () => {
    expect(() => parseOfx('oi, tudo bem?')).toThrow(/não parece um OFX/)
  })
})

let api: TestApi
let ana: TestUser
let conta: Account
let mercado: string

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  const criada = await ana.json<Account>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Conta corrente',
      type: 'checking',
      initialBalanceCents: 0,
      closingDay: null,
      dueDay: null,
      limitCents: null,
    }),
  })
  conta = criada.body
  const categorias =
    await ana.json<{ id: string; name: string; parentId: string | null }[]>('/api/categories')
  mercado = categorias.body.find((item) => item.name === 'Mercado' && !item.parentId)?.id ?? ''
})

afterAll(async () => {
  await api.close()
})

const preview = (text: string) =>
  ana.json<ImportPreview>('/api/imports/ofx/preview', {
    method: 'POST',
    body: JSON.stringify({ accountId: conta.id, text }),
  })

const confirmar = (text: string, decisions: unknown[]) =>
  ana.json<ImportResult>('/api/imports/ofx/confirm', {
    method: 'POST',
    body: JSON.stringify({ accountId: conta.id, text, decisions }),
  })

describe('importar e conciliar', () => {
  it('marca como novo o que não existe e importa com categoria', async () => {
    const arquivo = extrato(lancamentoOfx('N1', '20260903', '-45.90', 'FARMACIA CENTRAL'))
    const lido = await preview(arquivo)
    expect(lido.body.rows).toEqual([
      {
        fitId: 'N1',
        date: '2026-09-03',
        amountCents: -4590,
        description: 'FARMACIA CENTRAL',
        kind: null,
        status: 'new',
        match: null,
        candidates: [],
      },
    ])

    const resultado = await confirmar(arquivo, [
      { fitId: 'N1', action: 'create', categoryId: mercado, contactId: null },
    ])
    expect(resultado.body).toEqual({ created: 1, linked: 0, transferred: 0, skipped: 0 })

    const lista = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    const importado = lista.body.find((item) => item.description === 'FARMACIA CENTRAL')
    expect(importado).toMatchObject({
      type: 'expense',
      amountCents: 4590,
      origin: 'ofx',
      externalId: 'N1',
      accountId: conta.id,
      paymentDate: '2026-09-03',
    })
    expect(importado?.splits).toEqual([{ categoryId: mercado, amountCents: 4590 }])
  })

  it('reimportar o mesmo arquivo não duplica: as linhas aparecem como já importadas', async () => {
    const arquivo = extrato(lancamentoOfx('N1', '20260903', '-45.90', 'FARMACIA CENTRAL'))
    const lido = await preview(arquivo)
    expect(lido.body.rows[0]?.status).toBe('imported')
    expect(lido.body.rows[0]?.match?.description).toBe('FARMACIA CENTRAL')
  })

  it('escolhe o par pelo conjunto, não pela ordem do arquivo', async () => {
    // Dois lançamentos do MESMO valor, em dias próximos: é aqui que a conciliação erra feio
    const noMercado = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 10000,
        description: 'Mercado do bairro',
        accountId: conta.id,
        purchaseDate: '2026-10-10',
        paymentDate: '2026-10-10',
        splits: [{ categoryId: mercado, amountCents: 10000 }],
      }),
    })
    const naPadaria = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 10000,
        description: 'Padaria da esquina',
        accountId: conta.id,
        purchaseDate: '2026-10-12',
        paymentDate: '2026-10-12',
        splits: [{ categoryId: mercado, amountCents: 10000 }],
      }),
    })

    /*
     * No extrato, a PADARIA vem primeiro e fica a um dia de cada um dos dois lançamentos.
     * Escolhendo por ordem, ela levaria o Mercado — e o Mercado, que casava certinho, sobraria
     * para a outra linha. Com a nota do conjunto, cada uma fica com a sua.
     */
    const arquivo = extrato(
      [
        lancamentoOfx('D1', '20261011', '-100.00', 'PADARIA DA ESQUINA LTDA'),
        lancamentoOfx('D2', '20261010', '-100.00', 'MERCADO DO BAIRRO'),
      ].join('\n'),
    )
    const lido = await preview(arquivo)

    const daPadaria = lido.body.rows.find((row) => row.fitId === 'D1')
    const doMercado = lido.body.rows.find((row) => row.fitId === 'D2')
    expect(daPadaria?.match?.id).toBe(naPadaria.body.id)
    expect(doMercado?.match?.id).toBe(noMercado.body.id)

    // E os outros candidatos ficam à mão, para trocar na tela se o palpite errar
    expect(daPadaria?.candidates.map((item) => item.id)).toContain(noMercado.body.id)
    expect(lido.body.available.map((item) => item.id)).toEqual(
      expect.arrayContaining([noMercado.body.id, naPadaria.body.id]),
    )

    for (const id of [noMercado.body.id, naPadaria.body.id]) {
      await ana.request(`/api/transactions/${id}`, { method: 'DELETE' })
    }
  })

  it('mostra o que está no Bolso e não apareceu no extrato', async () => {
    const sobrando = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 7777,
        description: 'Digitei errado',
        accountId: conta.id,
        purchaseDate: '2026-09-20',
        paymentDate: '2026-09-20',
        splits: [{ categoryId: mercado, amountCents: 7777 }],
      }),
    })

    // O extrato do mesmo período não tem nada parecido com esse valor
    const arquivo = extrato(lancamentoOfx('S1', '20260919', '-31.00', 'POSTO IPIRANGA'))
    const lido = await preview(arquivo)

    const semPar = lido.body.unmatched.find((item) => item.id === sobrando.body.id)
    expect(semPar).toMatchObject({
      description: 'Digitei errado',
      amountCents: 7777,
      type: 'expense',
      categoryName: 'Mercado',
    })
    // O que casa com o extrato não entra nessa lista
    expect(lido.body.unmatched.some((item) => item.description === 'POSTO IPIRANGA')).toBe(false)

    await ana.request(`/api/transactions/${sobrando.body.id}`, { method: 'DELETE' })
  })

  it('confere se o extrato fecha: saldo anterior mais movimento dá o saldo final', async () => {
    const arquivo = extrato(
      [
        linhaDoBanco('Saldo Anterior', '', '', '100.00', '20260901'),
        linhaDoBanco('Compra com Cartão', 'PADARIA', 'F1', '-30.00', '20260902'),
        linhaDoBanco('Pix - Recebido', 'FULANO', 'F2', '50.00', '20260903'),
      ].join('\n'),
    ).replace('</STMTRS>', '<LEDGERBAL><BALAMT>120.00<DTASOF>20260903</LEDGERBAL></STMTRS>')

    const lido = await preview(arquivo)
    expect(lido.body.check).toMatchObject({
      previousBalanceCents: 10000,
      movementCents: 2000,
      finalBalanceCents: 12000,
      matches: true,
    })
    expect(lido.body.balanceLines).toBe(1)
  })

  it('acha o lançamento parecido pelo valor e pela data, mesmo com descrição diferente', async () => {
    const meu = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 25000,
        description: 'Feira da semana',
        accountId: conta.id,
        purchaseDate: '2026-09-12',
        paymentDate: '2026-09-12',
        splits: [{ categoryId: mercado, amountCents: 25000 }],
      }),
    })

    // O banco lança dois dias depois e com outro nome
    const arquivo = extrato(lancamentoOfx('C1', '20260914', '-250.00', 'PAG*MERCADO SAO JOSE'))
    const lido = await preview(arquivo)
    expect(lido.body.rows[0]?.status).toBe('match')
    expect(lido.body.rows[0]?.match).toMatchObject({
      id: meu.body.id,
      description: 'Feira da semana',
      categoryName: 'Mercado',
    })

    const resultado = await confirmar(arquivo, [
      { fitId: 'C1', action: 'link', transactionId: meu.body.id },
    ])
    expect(resultado.body).toEqual({ created: 0, linked: 1, transferred: 0, skipped: 0 })

    // Conciliado: continua um lançamento só, agora carimbado com o id do banco
    const lista = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    const conciliado = lista.body.filter((item) => item.description === 'Feira da semana')
    expect(conciliado.length).toBe(1)
    expect(conciliado[0]?.externalId).toBe('C1')
    expect(conciliado[0]?.origin).toBe('manual')

    // E o arquivo relido já não sugere nada
    const relido = await preview(arquivo)
    expect(relido.body.rows[0]?.status).toBe('imported')
  })

  it('valor diferente não vira sugestão', async () => {
    const arquivo = extrato(lancamentoOfx('D1', '20260912', '-251.00', 'PAG*MERCADO'))
    const lido = await preview(arquivo)
    expect(lido.body.rows[0]?.status).toBe('new')
  })

  it('ignorar uma linha não cria nada', async () => {
    const arquivo = extrato(lancamentoOfx('S1', '20260920', '-10.00', 'TARIFA'))
    const resultado = await confirmar(arquivo, [{ fitId: 'S1', action: 'skip' }])
    expect(resultado.body).toEqual({ created: 0, linked: 0, transferred: 0, skipped: 1 })
    const lista = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    expect(lista.body.some((item) => item.description === 'TARIFA')).toBe(false)
  })

  it('recusa conciliar com um lançamento que já tem dono', async () => {
    const arquivo = extrato(lancamentoOfx('C2', '20260914', '-250.00', 'OUTRA VEZ'))
    const lista = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    const jaConciliado = lista.body.find((item) => item.externalId === 'C1')
    const resposta = await confirmar(arquivo, [
      { fitId: 'C2', action: 'link', transactionId: jaConciliado?.id },
    ])
    expect(resposta.status).toBe(409)
  })
})

describe('contatos', () => {
  it('cria, impede nome repetido e liga ao lançamento', async () => {
    const criado = await ana.json<Contact>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mercado São José',
        kind: 'company',
        document: '12.345.678/0001-90',
        notes: 'Feira da semana',
      }),
    })
    expect(criado.status).toBe(201)

    const repetido = await ana.json<{ field: string }>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: 'mercado sao jose', kind: 'company', document: '', notes: '' }),
    })
    expect(repetido.status).toBe(409)
    expect(repetido.body.field).toBe('name')

    const lancamento = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 8000,
        description: 'Compra',
        accountId: null,
        contactId: criado.body.id,
        purchaseDate: '2026-09-15',
        paymentDate: null,
        splits: [{ categoryId: mercado, amountCents: 8000 }],
      }),
    })
    expect(lancamento.body.contactId).toBe(criado.body.id)

    // Excluir o contato não apaga o lançamento
    await ana.request(`/api/contacts/${criado.body.id}`, { method: 'DELETE' })
    const depois = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    const mesmo = depois.body.find((item) => item.id === lancamento.body.id)
    expect(mesmo?.contactId).toBeNull()
  })

  it('recusa contato de outro grupo', async () => {
    const bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
    const dele = await bruno.json<Contact>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Padaria', kind: 'company', document: '', notes: '' }),
    })
    const resposta = await ana.json<{ field: string }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 1000,
        description: 'Pão',
        accountId: null,
        contactId: dele.body.id,
        purchaseDate: '2026-09-16',
        paymentDate: null,
        splits: [{ categoryId: null, amountCents: 1000 }],
      }),
    })
    expect(resposta.status).toBe(400)
    expect(resposta.body.field).toBe('contactId')
  })
})
