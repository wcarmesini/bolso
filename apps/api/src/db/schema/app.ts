import {
  accountTypes,
  categoryColors,
  categoryIconNames,
  categoryKinds,
  integrationProviders,
  transactionTypes,
} from '@bolso/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { organization, user } from './auth'

/*
 * Tabelas do Bolso. Regras de base:
 * - Tudo pertence a um grupo (group_id = organização do Better Auth). Toda consulta filtra por ele.
 * - Valores em centavos inteiros (bigint), nunca float.
 * - Nomes repetidos são barrados pelo próprio banco, via `name_key` (nome sem acento e minúsculo)
 *   e índices únicos. A API também checa antes, para dar uma mensagem clara; o índice
 *   protege contra duas pessoas criando o mesmo nome ao mesmo tempo.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

const groupId = () =>
  text('group_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' })

export const categoryKindEnum = pgEnum('category_kind', categoryKinds)
export const categoryColorEnum = pgEnum('category_color', categoryColors)
export const categoryIconEnum = pgEnum('category_icon', categoryIconNames)
export const accountTypeEnum = pgEnum('account_type', accountTypes)
export const integrationProviderEnum = pgEnum('integration_provider', integrationProviders)
export const transactionTypeEnum = pgEnum('transaction_type', transactionTypes)

// Categoria principal (parent_id nulo, com ícone e cor) ou subcategoria (um nível só)
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'cascade',
    }),
    kind: categoryKindEnum('kind').notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    icon: categoryIconEnum('icon'),
    color: categoryColorEnum('color'),
    ...timestamps,
  },
  (table) => [
    index('categories_group_idx').on(table.groupId),
    uniqueIndex('categories_top_name_unique')
      .on(table.groupId, table.kind, table.nameKey)
      .where(sql`${table.parentId} is null`),
    uniqueIndex('categories_sub_name_unique')
      .on(table.parentId, table.nameKey)
      .where(sql`${table.parentId} is not null`),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    type: accountTypeEnum('type').notNull(),
    initialBalanceCents: bigint('initial_balance_cents', { mode: 'number' }).notNull().default(0),
    // Só cartão de crédito: dia em que a fatura fecha e em que vence, e o limite
    closingDay: smallint('closing_day'),
    dueDay: smallint('due_day'),
    limitCents: bigint('limit_cents', { mode: 'number' }),
    ...timestamps,
  },
  (table) => [uniqueIndex('accounts_name_unique').on(table.groupId, table.nameKey)],
)

// A chave fica criptografada (AES-256-GCM); a API só devolve os 4 últimos caracteres
export const integrationKeys = pgTable(
  'integration_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    provider: integrationProviderEnum('provider').notNull(),
    customProvider: text('custom_provider').notNull().default(''),
    label: text('label').notNull().default(''),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretLast4: text('secret_last4').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('integration_keys_group_idx').on(table.groupId)],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    type: transactionTypeEnum('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    description: text('description').notNull().default(''),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    // Competência: em que mês o gasto conta no orçamento
    purchaseDate: date('purchase_date', { mode: 'string' }).notNull(),
    // Caixa: quando o dinheiro sai (no cartão, o vencimento da fatura). Nulo = ainda não pago
    paymentDate: date('payment_date', { mode: 'string' }),
    // Cartão de crédito: fatura em que a compra caiu, pelo mês do vencimento ("2026-10")
    statementMonth: text('statement_month'),
    // Compra parcelada: as parcelas compartilham o grupo e sabem qual são ("3 de 10")
    installmentGroupId: uuid('installment_group_id'),
    installmentNumber: smallint('installment_number'),
    installmentCount: smallint('installment_count'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('transactions_group_date_idx').on(table.groupId, table.purchaseDate),
    index('transactions_statement_idx').on(table.accountId, table.statementMonth),
    index('transactions_installment_idx').on(table.installmentGroupId),
  ],
)

/**
 * As partes de um lançamento, uma por categoria. Um lançamento comum tem uma parte só;
 * um lançamento "desmembrado" tem várias, e a soma delas é sempre o valor do lançamento.
 * Relatórios e orçamento somam as partes: é daqui que sai "quanto foi para cada categoria".
 */
export const transactionSplits = pgTable(
  'transaction_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    // Nulo = sem categoria (a categoria excluída também cai aqui)
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('transaction_splits_transaction_idx').on(table.transactionId),
    index('transaction_splits_group_category_idx').on(table.groupId, table.categoryId),
  ],
)

// Limite por categoria principal, valendo do mês (AAAA-MM) em diante até ser trocado.
// limit_cents nulo = "sem limite a partir deste mês".
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    limitCents: bigint('limit_cents', { mode: 'number' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('budgets_category_month_unique').on(table.groupId, table.categoryId, table.month),
  ],
)
