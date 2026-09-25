import type { Category } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
})

afterAll(async () => {
  await api.close()
})

const listar = async () => (await ana.json<Category[]>('/api/categories')).body

const criar = (body: Record<string, unknown>) =>
  ana.json<Category>('/api/categories', { method: 'POST', body: JSON.stringify(body) })

const despesas = (todas: Category[]) =>
  todas.filter((item) => item.kind === 'expense' && !item.parentId).map((item) => item.name)

describe('cor livre e ícones', () => {
  it('aceita qualquer cor em hexadecimal', async () => {
    const resposta = await criar({
      name: 'Bicicletaria',
      kind: 'expense',
      icon: 'bike',
      color: '#3D9A7B',
    })
    expect(resposta.status).toBe(201)
    // Guarda em minúsculo, para duas escritas da mesma cor não virarem cores diferentes
    expect(resposta.body.color).toBe('#3d9a7b')
  })

  it('recusa cor que não é hexadecimal', async () => {
    const resposta = await criar({ name: 'Errada', kind: 'expense', icon: 'tag', color: 'verde' })
    expect(resposta.status).toBe(400)
    const erro = resposta.body as unknown as { field: string }
    expect(erro.field).toBe('color')
  })

  it('aceita os ícones novos, e recusa um que não existe', async () => {
    const bom = await criar({ name: 'Praia', kind: 'expense', icon: 'tree-palm', color: '#0ea5e9' })
    expect(bom.status).toBe(201)
    const ruim = await criar({ name: 'Nada', kind: 'expense', icon: 'dragão', color: '#0ea5e9' })
    expect(ruim.status).toBe(400)
  })
})

describe('ordem das categorias', () => {
  it('a categoria nova entra no fim da lista', async () => {
    const antes = despesas(await listar())
    await criar({
      name: 'Aaaa primeira no alfabeto',
      kind: 'expense',
      icon: 'tag',
      color: '#71717a',
    })
    const depois = despesas(await listar())
    expect(depois.at(-1)).toBe('Aaaa primeira no alfabeto')
    expect(depois.length).toBe(antes.length + 1)
  })

  it('arrastar grava a nova ordem, e ela vale para todo mundo do grupo', async () => {
    const todas = await listar()
    const atuais = todas.filter((item) => item.kind === 'expense' && !item.parentId)
    // Inverte a ordem das três primeiras
    const invertidas = [...atuais.slice(0, 3)].reverse()
    const ids = [...invertidas, ...atuais.slice(3)].map((item) => item.id)

    const resposta = await ana.request('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
    expect(resposta.status).toBe(204)

    const depois = despesas(await listar())
    expect(depois.slice(0, 3)).toEqual(invertidas.map((item) => item.name))
  })

  it('as subcategorias têm ordem própria, dentro da principal', async () => {
    const todas = await listar()
    const alimentacao = todas.find((item) => item.name === 'Alimentação fora')
    const filhas = todas.filter((item) => item.parentId === alimentacao?.id)
    expect(filhas.length).toBeGreaterThan(1)

    const invertidas = [...filhas].reverse()
    const resposta = await ana.request('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: invertidas.map((item) => item.id) }),
    })
    expect(resposta.status).toBe(204)

    const depois = await listar()
    const ordemFinal = depois
      .filter((item) => item.parentId === alimentacao?.id)
      .map((item) => item.name)
    expect(ordemFinal).toEqual(invertidas.map((item) => item.name))
  })

  it('arrastar uma subcategoria para outra principal muda a mãe dela', async () => {
    const todas = await listar()
    const alimentacao = todas.find((item) => item.name === 'Alimentação fora')
    const mercado = todas.find((item) => item.name === 'Mercado')
    const delivery = todas.find((item) => item.parentId === alimentacao?.id)
    if (!mercado || !delivery) throw new Error('faltou categoria para o teste')

    const daquela = todas.filter((item) => item.parentId === mercado.id).map((item) => item.id)
    const resposta = await ana.request('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: [...daquela, delivery.id], parentId: mercado.id }),
    })
    expect(resposta.status).toBe(204)

    const depois = await listar()
    const movida = depois.find((item) => item.id === delivery.id)
    expect(movida?.parentId).toBe(mercado.id)
    // A subcategoria segue o tipo da nova mãe
    expect(movida?.kind).toBe(mercado.kind)
  })

  it('recusa levar para uma principal que já tem subcategoria com o mesmo nome', async () => {
    const todas = await listar()
    const mercado = todas.find((item) => item.name === 'Mercado')
    const saude = todas.find((item) => item.name === 'Saúde')
    if (!mercado || !saude) throw new Error('faltou categoria para o teste')

    // Cria "Feira" nos dois grupos e tenta juntar
    const aqui = await criar({ name: 'Feira', parentId: mercado.id })
    await criar({ name: 'Feira', parentId: saude.id })
    const daOutra = (await listar()).filter(
      (item) => item.parentId === saude.id && item.name === 'Feira',
    )
    const resposta = await ana.json<{ error: string }>('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({
        ids: [aqui.body.id, daOutra[0]?.id],
        parentId: mercado.id,
      }),
    })
    expect(resposta.status).toBe(409)
    expect(resposta.body.error).toContain('já tem uma subcategoria')
  })

  it('recusa jogar dentro de uma subcategoria (só existe um nível)', async () => {
    const todas = await listar()
    const filha = todas.find((item) => item.parentId !== null)
    const outra = todas.find((item) => item.parentId !== null && item.id !== filha?.id)
    const resposta = await ana.request('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: [outra?.id], parentId: filha?.id }),
    })
    expect(resposta.status).toBe(400)
  })

  it('transforma uma principal vazia em subcategoria de outra', async () => {
    const criada = await ana.json<{ id: string }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Streaming', kind: 'expense', icon: 'tag', color: '#8b5cf6' }),
    })
    const todas = await listar()
    const destino = todas.find((item) => item.parentId === null && item.id !== criada.body.id)

    const resposta = await ana.request('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: [criada.body.id], parentId: destino?.id }),
    })
    expect(resposta.status).toBe(204)

    const depois = await listar()
    expect(depois.find((item) => item.id === criada.body.id)?.parentId).toBe(destino?.id)
  })

  it('recusa transformar em subcategoria uma principal que tem filhas', async () => {
    const todas = await listar()
    const comFilhas = todas.find(
      (item) => item.parentId === null && todas.some((outra) => outra.parentId === item.id),
    )
    const destino = todas.find((item) => item.parentId === null && item.id !== comFilhas?.id)

    const resposta = await ana.json<{ error: string }>('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: [comFilhas?.id], parentId: destino?.id }),
    })
    expect(resposta.status).toBe(400)
    expect(resposta.body.error).toContain('subcategorias')
  })

  it('recusa reordenar categoria de outro grupo', async () => {
    const bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
    const minhas = await listar()
    const resposta = await bruno.request('/api/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: [minhas[0]?.id] }),
    })
    expect(resposta.status).toBe(404)
  })
})
