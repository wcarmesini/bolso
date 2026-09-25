import {
  accountTypes,
  categoryKinds,
  contactKinds,
  integrationProviders,
  transactionOrigins,
  transactionTypes,
} from '@bolso/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  date,
  index,
  integer,
  jsonb,
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
export const accountTypeEnum = pgEnum('account_type', accountTypes)
export const integrationProviderEnum = pgEnum('integration_provider', integrationProviders)
export const transactionTypeEnum = pgEnum('transaction_type', transactionTypes)
export const transactionOriginEnum = pgEnum('transaction_origin', transactionOrigins)
export const contactKindEnum = pgEnum('contact_kind', contactKinds)

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
    /*
     * Texto, não enum: o ícone é escolhido numa lista que cresce sempre, e a cor virou livre
     * (#rrggbb). Quem valida é o schema do `packages/shared`, que front e API compartilham.
     */
    icon: text('icon'),
    color: text('color'),
    /** Ordem escolhida arrastando na tela; empata pelo nome */
    position: integer('position').notNull().default(0),
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
    /** Parte pública das chaves de Open Finance (Client ID); vazio nos outros serviços */
    clientId: text('client_id').notNull().default(''),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretLast4: text('secret_last4').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('integration_keys_group_idx').on(table.groupId)],
)

/*
 * Chave da API do Bolso, para outro programa entrar no lugar da pessoa. Guardamos só o hash:
 * a chave inteira aparece uma vez, na criação, e some.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    name: text('name').notNull(),
    scope: text('scope').notNull().default('read'),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('api_keys_group_idx').on(table.groupId),
    uniqueIndex('api_keys_hash_unique').on(table.tokenHash),
  ],
)

/*
 * Conexão com o banco (Open Finance). Uma linha por conta do banco ligada a uma conta do
 * Bolso: o `item` do Pluggy pode trazer várias contas, e cada uma vira o seu próprio canal.
 */
export const bankConnections = pgTable(
  'bank_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    /** Conexão lá no Pluggy (item) */
    itemId: text('item_id').notNull(),
    connectorName: text('connector_name').notNull().default(''),
    connectorImageUrl: text('connector_image_url'),
    status: text('status').notNull().default('UPDATING'),
    statusMessage: text('status_message'),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    externalAccountId: text('external_account_id').notNull(),
    externalAccountName: text('external_account_name').notNull().default(''),
    /** Não buscar lançamentos antes desta data */
    startDate: date('start_date').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('bank_connections_group_idx').on(table.groupId),
    uniqueIndex('bank_connections_account_unique').on(table.groupId, table.externalAccountId),
  ],
)

/*
 * Caixa de entrada: o que o banco mandou e ainda não virou lançamento.
 *
 * O Bolso busca sozinho, de tempos em tempos, e guarda aqui. Só sai daqui quando alguém
 * aprova (vira lançamento), concilia (gruda num lançamento que já existia) ou dispensa.
 * Dispensado fica na tabela, marcado, para não voltar na próxima busca.
 */
export const pendingTransactions = pgTable(
  'pending_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** Identificador do lançamento lá no banco: é o que impede trazer duas vezes */
    externalId: text('external_id').notNull(),
    date: date('date').notNull(),
    /** Negativo = saída, como vem do banco */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    description: text('description').notNull(),
    kind: text('kind'),
    /** pending | dismissed */
    status: text('status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [
    index('pending_transactions_group_idx').on(table.groupId, table.status),
    uniqueIndex('pending_transactions_external_unique').on(table.groupId, table.externalId),
  ],
)

/*
 * Cada aprovação (ou importação de extrato) vira um **lote**, com o que ela fez.
 *
 * É o que permite desfazer: sem isso, o "aprovei tudo sem olhar" só se conserta apagando
 * lançamento por lançamento na mão. O lote guarda o resumo; os itens guardam o suficiente
 * para andar para trás — qual lançamento nasceu, qual foi conciliado, qual foi dispensado.
 */
export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    /** bank | ofx */
    source: text('source').notNull(),
    connectionId: uuid('connection_id').references(() => bankConnections.id, {
      onDelete: 'set null',
    }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** O nome do arquivo, ou o do banco */
    label: text('label').notNull().default(''),
    createdCount: integer('created_count').notNull().default(0),
    linkedCount: integer('linked_count').notNull().default(0),
    transferredCount: integer('transferred_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    /** Preenchido quando o lote foi desfeito: ele some da fila, mas fica no histórico */
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('import_batches_group_idx').on(table.groupId, table.createdAt)],
)

/** Uma linha do lote: o que aconteceu com ela e por onde desfazer */
export const importBatchItems = pgTable(
  'import_batch_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    /** create | link | transfer | skip */
    action: text('action').notNull(),
    /*
     * O lançamento envolvido. No "create" é o que nasceu (apagar desfaz); no "link" é o que
     * já existia (desfazer só tira o identificador do banco, o lançamento fica).
     */
    transactionId: uuid('transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    /** No "transfer": as duas pernas, que somem juntas */
    transferGroupId: uuid('transfer_group_id'),
    /** A linha da caixa de entrada, para ela voltar a esperar aprovação */
    pendingId: uuid('pending_id').references(() => pendingTransactions.id, {
      onDelete: 'set null',
    }),
    externalId: text('external_id').notNull(),
    /*
     * Quanto o lançamento valia antes: só é preenchido quando conciliar teve de **dividir**
     * um lançamento em partes (uma compra que o banco cobrou em duas). Desfazer devolve o
     * valor original a ele, depois de apagar as outras partes.
     */
    previousAmountCents: bigint('previous_amount_cents', { mode: 'number' }),
  },
  (table) => [index('import_batch_items_batch_idx').on(table.batchId)],
)

/*
 * Rastro de tudo: quem fez o quê, quando, e o que mudou.
 *
 * É o que permite abrir um lançamento e ver "você criou, a Débora trocou a descrição na
 * terça". Guarda só o que mudou (campo, de, para), não a linha inteira — o suficiente para
 * contar a história sem duplicar o banco.
 *
 * Nada some de verdade: excluir marca `deleted_at` e vira um registro 'delete' aqui, que a
 * lixeira sabe desfazer.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    /** transaction | transfer | category | account | contact | budget */
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    /** create | update | delete | restore */
    action: text('action').notNull(),
    /** O que mudou: [{ field, from, to }] — vazio no create e no delete */
    changes: jsonb('changes').$type<{ field: string; from: unknown; to: unknown }[]>(),
    /** Como a linha se chamava na hora, para o histórico continuar legível depois */
    label: text('label').notNull().default(''),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.groupId, table.entity, table.entityId),
    index('audit_log_group_idx').on(table.groupId, table.createdAt),
  ],
)

/** Quem recebe ou paga: o mercado, o senhorio, o cliente */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    kind: contactKindEnum('kind').notNull(),
    document: text('document').notNull().default(''),
    notes: text('notes').notNull().default(''),
    ...timestamps,
  },
  (table) => [uniqueIndex('contacts_name_unique').on(table.groupId, table.nameKey)],
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
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
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
    // De onde veio o lançamento e o identificador dele no extrato do banco (FITID)
    origin: transactionOriginEnum('origin').notNull().default('manual'),
    /*
     * Transferência entre contas: as duas pernas (saída na origem, entrada no destino)
     * compartilham este id. Quem tem isso preenchido fica fora de orçamento e relatórios.
     */
    transferGroupId: uuid('transfer_group_id'),
    externalId: text('external_id'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /*
     * Excluir não apaga: marca a data aqui. O lançamento some de todas as telas e de todos
     * os relatórios, mas continua no banco — dá para ver quem excluiu e trazer de volta.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('transactions_group_date_idx').on(table.groupId, table.purchaseDate),
    // O mesmo lançamento do banco não entra duas vezes, mesmo importando o arquivo de novo
    uniqueIndex('transactions_external_unique')
      .on(table.groupId, table.accountId, table.externalId)
      .where(sql`${table.externalId} is not null and ${table.deletedAt} is null`),
    index('transactions_statement_idx').on(table.accountId, table.statementMonth),
    index('transactions_installment_idx').on(table.installmentGroupId),
    index('transactions_transfer_idx').on(table.transferGroupId),
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

// Orçamento de uma categoria (principal ou sub, de saída ou de entrada), valendo do mês
// (AAAA-MM) em diante até ser trocado. limit_cents nulo = "sem orçamento a partir deste mês".
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

/**
 * Detalhamento do orçamento: "Salário Débora", "Salário Wilson". Quando existem itens,
 * o valor do orçamento é a soma deles.
 */
export const budgetItems = pgTable(
  'budget_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: groupId(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    position: smallint('position').notNull().default(0),
  },
  (table) => [index('budget_items_budget_idx').on(table.budgetId)],
)
