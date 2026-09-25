import type { Category, GroupMember, Me } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, listen, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
let bruno: TestUser
let anaGroupId: string
let brunoOwnGroupId: string

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
  anaGroupId = (await ana.json<Me>('/api/me')).body.activeGroup?.id ?? ''
  brunoOwnGroupId = (await bruno.json<Me>('/api/me')).body.activeGroup?.id ?? ''
})

afterAll(async () => {
  await api.close()
})

describe('grupos separados', () => {
  it('cada pessoa começa no próprio grupo', () => {
    expect(anaGroupId).not.toBe('')
    expect(brunoOwnGroupId).not.toBe(anaGroupId)
  })

  it('não dá para ver nem mexer no dado de outro grupo', async () => {
    const criada = await ana.json<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Viagem', kind: 'expense', icon: 'plane', color: '#0ea5e9' }),
    })

    const deBruno = await bruno.json<Category[]>('/api/categories')
    expect(deBruno.body.some((category) => category.name === 'Viagem')).toBe(false)

    const tentativaDeEditar = await bruno.request(`/api/categories/${criada.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Invadida', kind: 'expense', icon: 'plane', color: '#ef4444' }),
    })
    expect(tentativaDeEditar.status).toBe(404)

    const tentativaDeExcluir = await bruno.request(`/api/categories/${criada.body.id}`, {
      method: 'DELETE',
    })
    expect(tentativaDeExcluir.status).toBe(404)
  })
})

describe('convite', () => {
  it('convida pelo e-mail e gera um link para compartilhar', async () => {
    const convite = await ana.json<{ id: string; link: string }>(
      '/api/groups/current/invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'bruno@exemplo.com' }),
      },
    )
    expect(convite.status).toBe(201)
    expect(convite.body.link).toContain(`/convite/${convite.body.id}`)

    const pendentes = await ana.json<{ email: string }[]>('/api/groups/current/invitations')
    expect(pendentes.body.map((item) => item.email)).toContain('bruno@exemplo.com')
  })

  it('o convite só vale para o e-mail convidado', async () => {
    const convite = await ana.json<{ id: string }>('/api/groups/current/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'carla@exemplo.com' }),
    })
    const visto = await bruno.json<{ forYou: boolean; groupName: string }>(
      `/api/invitations/${convite.body.id}`,
    )
    expect(visto.body.forYou).toBe(false)
    expect(visto.body.groupName).toBe('Meu Bolso')

    const tentativa = await bruno.json<{ error: string }>(
      `/api/invitations/${convite.body.id}/accept`,
      { method: 'POST' },
    )
    expect(tentativa.status).toBeGreaterThanOrEqual(400)
    expect(tentativa.body.error).toContain('outro e-mail')
  })

  it('aceitar entra no grupo, troca o grupo ativo e mostra os dados de lá', async () => {
    const convites = await ana.json<{ id: string; email: string }[]>(
      '/api/groups/current/invitations',
    )
    const doBruno = convites.body.find((item) => item.email === 'bruno@exemplo.com')

    const aceito = await bruno.json<{ groupId: string }>(`/api/invitations/${doBruno?.id}/accept`, {
      method: 'POST',
    })
    expect(aceito.status).toBe(200)
    expect(aceito.body.groupId).toBe(anaGroupId)

    const me = await bruno.json<Me>('/api/me')
    expect(me.body.activeGroup?.id).toBe(anaGroupId)
    expect(me.body.groups.length).toBe(2)

    // Agora Bruno vê o que a Ana cadastrou
    const categorias = await bruno.json<Category[]>('/api/categories')
    expect(categorias.body.some((category) => category.name === 'Viagem')).toBe(true)

    const membros = await ana.json<GroupMember[]>('/api/groups/current/members')
    expect(membros.body.map((membro) => membro.name).sort()).toEqual(['Ana', 'Bruno'])
    expect(membros.body.find((membro) => membro.name === 'Bruno')?.role).toBe('member')
  })
})

describe('tempo real', () => {
  it('o que uma pessoa grava vira aviso para o grupo inteiro', async () => {
    const canal = listen(api.hub, anaGroupId)

    await bruno.request('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Presentes', kind: 'expense', icon: 'gift', color: '#ec4899' }),
    })
    await bruno.request('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Carteira',
        type: 'cash',
        initialBalanceCents: 5000,
        closingDay: null,
        dueDay: null,
        limitCents: null,
      }),
    })

    expect(canal.received).toEqual([
      { type: 'invalidate', resources: ['categories'], actorId: expect.any(String) },
      { type: 'invalidate', resources: ['accounts'], actorId: expect.any(String) },
    ])
    canal.unsubscribe()
  })

  it('o aviso não vaza para outro grupo', async () => {
    const canalDeOutroGrupo = listen(api.hub, brunoOwnGroupId)
    await ana.request('/api/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Livros',
        kind: 'expense',
        icon: 'graduation-cap',
        color: '#8b5cf6',
      }),
    })
    expect(canalDeOutroGrupo.received).toEqual([])
    canalDeOutroGrupo.unsubscribe()
  })

  it('trocar de grupo muda o que a pessoa enxerga', async () => {
    await bruno.request(`/api/groups/${brunoOwnGroupId}/activate`, { method: 'POST' })
    const me = await bruno.json<Me>('/api/me')
    expect(me.body.activeGroup?.id).toBe(brunoOwnGroupId)

    const categorias = await bruno.json<Category[]>('/api/categories')
    expect(categorias.body.some((category) => category.name === 'Viagem')).toBe(false)
  })
})
