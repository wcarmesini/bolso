/*
 * Conserto: refaz as provas de conciliação perdidas.
 *
 * O que aconteceu: a conciliação saiu do campo `transactions.external_id` e passou para a
 * tabela `transaction_sources`. Entre a coluna ser removida do banco e o código novo passar a
 * gravar na tabela, houve uma janela em que conciliar **respondia sucesso e não gravava nada**
 * — a atualização apontava para uma coluna que não existia mais. Quem conciliou nessa janela
 * ficou com o lançamento certo e sem a prova.
 *
 * Dá para refazer sem adivinhar: cada importação guarda, em `import_batch_items`, o lançamento
 * e o identificador do banco de cada linha que ela resolveu. É daí que as provas voltam —
 * exatamente as mesmas ligações, não um palpite por valor e data.
 *
 * Lotes desfeitos ficam de fora (a pessoa decidiu que aquilo não valia), e o `on conflict`
 * cuida do que já tem prova.
 */

-- Criar e conciliar: o item guarda o próprio lançamento
INSERT INTO "transaction_sources" ("group_id", "transaction_id", "source", "external_id", "label", "reconciled_by", "created_at")
SELECT b."group_id", i."transaction_id",
       CASE WHEN b."source" = 'ofx' THEN 'ofx' ELSE 'pluggy' END,
       i."external_id", t."description", b."created_by", b."created_at"
FROM "import_batch_items" i
JOIN "import_batches" b ON b."id" = i."batch_id"
JOIN "transactions" t ON t."id" = i."transaction_id"
WHERE b."undone_at" IS NULL
  AND i."action" IN ('create', 'link')
  AND i."external_id" <> ''
  AND t."deleted_at" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Transferência: o item guarda a transferência, e a prova é da perna da conta do extrato
INSERT INTO "transaction_sources" ("group_id", "transaction_id", "source", "external_id", "label", "reconciled_by", "created_at")
SELECT b."group_id", t."id",
       CASE WHEN b."source" = 'ofx' THEN 'ofx' ELSE 'pluggy' END,
       i."external_id", t."description", b."created_by", b."created_at"
FROM "import_batch_items" i
JOIN "import_batches" b ON b."id" = i."batch_id"
JOIN "transactions" t ON t."transfer_group_id" = i."transfer_group_id"
  AND t."account_id" = b."account_id"
WHERE b."undone_at" IS NULL
  AND i."action" = 'transfer'
  AND i."external_id" <> ''
  AND t."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
