import type { AuditAction, AuditEntity, AuditEntry, AuditField } from '@bolso/shared'
import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { auditLog, user } from '../db/schema'

/*
 * O rastro do que se faz no Bolso.
 *
 * Duas pessoas mexendo no mesmo orçamento precisam conseguir responder "quem mudou isso?"
 * sem desconfiar uma da outra. Guardamos o que mudou — campo, de, para — e quem mudou, e a
 * tela conta a história em português.
 *
 * O registro nunca derruba a operação: se falhar ao gravar o rastro, o lançamento continua
 * salvo. Perder o histórico é ruim; perder o lançamento da pessoa é pior.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database

type Registro = {
  groupId: string
  entity: AuditEntity
  entityId: string
  action: AuditAction
  actorId: string
  /** Como a coisa se chamava na hora ("Feira da semana"), para o histórico não ficar mudo */
  label?: string
  changes?: AuditField[]
}

export async function registrar(tx: Tx, registro: Registro) {
  try {
    await tx.insert(auditLog).values({
      groupId: registro.groupId,
      entity: registro.entity,
      entityId: registro.entityId,
      action: registro.action,
      label: registro.label ?? '',
      changes: registro.changes ?? [],
      actorId: registro.actorId,
    })
  } catch (error) {
    console.error('rastro', registro.entity, registro.entityId, error)
  }
}

/*
 * O que mudou entre duas versões, só dos campos que interessam contar. Comparação rasa e por
 * igualdade simples: os campos são valores (texto, número, data em texto), não objetos.
 */
export function diferencas<T extends Record<string, unknown>>(
  antes: T,
  depois: T,
  campos: (keyof T & string)[],
): AuditField[] {
  const mudou: AuditField[] = []
  for (const campo of campos) {
    const de = antes[campo] ?? null
    const para = depois[campo] ?? null
    if (de !== para) mudou.push({ field: campo, from: de, to: para })
  }
  return mudou
}

/** O histórico de uma coisa, do mais recente para o mais antigo */
export async function historicoDe(
  db: Database,
  groupId: string,
  entity: AuditEntity,
  entityId: string,
): Promise<AuditEntry[]> {
  const rows = await db
    .select({ log: auditLog, actorName: user.name })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.groupId, groupId),
        eq(auditLog.entity, entity),
        eq(auditLog.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(100)

  return rows.map(({ log, actorName }) => ({
    id: log.id,
    entity: log.entity as AuditEntity,
    entityId: log.entityId,
    action: log.action as AuditAction,
    label: log.label,
    changes: log.changes ?? [],
    actorName,
    createdAt: log.createdAt.toISOString(),
  }))
}
