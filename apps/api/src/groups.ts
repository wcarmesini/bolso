import { randomUUID } from 'node:crypto'
import { defaultCategories, nameKey } from '@bolso/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from './db/client'
import { categories, member, organization } from './db/schema'

// Grupo = organização do Better Auth. Toda pessoa começa com o próprio grupo.

export async function seedDefaultCategories(db: Database, groupId: string) {
  // A ordem em que são criadas já é a ordem da tela; arrastar muda daí em diante
  const posicao = { expense: 0, income: 0 }
  for (const { subcategories = [], ...values } of defaultCategories) {
    posicao[values.kind] += 1
    const [parent] = await db
      .insert(categories)
      .values({
        ...values,
        groupId,
        nameKey: nameKey(values.name),
        position: posicao[values.kind],
      })
      .returning({ id: categories.id })
    if (!parent || subcategories.length === 0) continue
    await db.insert(categories).values(
      subcategories.map((name, index) => ({
        groupId,
        parentId: parent.id,
        kind: values.kind,
        name,
        nameKey: nameKey(name),
        position: index + 1,
      })),
    )
  }
}

// Grupo pessoal criado no primeiro login, já com as categorias iniciais
export async function createPersonalGroup(db: Database, userId: string) {
  const groupId = randomUUID()
  const now = new Date()
  await db.insert(organization).values({
    id: groupId,
    name: 'Meu Bolso',
    slug: `bolso-${groupId}`,
    createdAt: now,
  })
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: groupId,
    userId,
    role: 'owner',
    createdAt: now,
  })
  await seedDefaultCategories(db, groupId)
  return groupId
}

export async function findMembership(db: Database, userId: string, groupId: string) {
  const [row] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, groupId)))
    .limit(1)
  return row
}

// O grupo mais antigo da pessoa: usado quando a sessão não tem grupo ativo válido
export async function firstMembership(db: Database, userId: string) {
  const [row] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1)
  return row
}
