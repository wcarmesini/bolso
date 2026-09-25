/*
 * A competência de uma parcela passa a ser a **data da compra**, não o mês em que ela cai.
 * As séries que já existiam foram criadas com a data andando mês a mês; aqui todas as
 * parcelas de cada série recebem a data da primeira. O caixa (fatura e data de pagamento)
 * fica como está: ele já andava mês a mês, que é o certo.
 */
UPDATE "transactions" t
SET "purchase_date" = primeira."purchase_date"
FROM (
  SELECT "installment_group_id", min("purchase_date") AS "purchase_date"
  FROM "transactions"
  WHERE "installment_group_id" IS NOT NULL
  GROUP BY "installment_group_id"
) AS primeira
WHERE t."installment_group_id" = primeira."installment_group_id"
  AND t."purchase_date" <> primeira."purchase_date";
