/*
 * O rascunho da decisão de cada linha da caixa de entrada.
 *
 * (A migração gerada vinha com um `DROP COLUMN external_id` repetido: aquela coluna já saiu
 * na 0015, escrita à mão, e o retrato do schema não tinha aprendido. Repetir quebraria a
 * subida do servidor.)
 */
ALTER TABLE "pending_transactions" ADD COLUMN "decision" jsonb;
