CREATE TABLE "transaction_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"reconciled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_sources" ADD CONSTRAINT "transaction_sources_group_id_organization_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_sources" ADD CONSTRAINT "transaction_sources_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_sources" ADD CONSTRAINT "transaction_sources_reconciled_by_user_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_sources_transaction_idx" ON "transaction_sources" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_sources_unique" ON "transaction_sources" USING btree ("group_id","source","external_id");--> statement-breakpoint
/*
 * As conciliações que já existiam viram provas. A origem sai de onde o identificador
 * aparece: se ele está na caixa de entrada, veio do Open Finance; senão, do extrato OFX.
 */
INSERT INTO "transaction_sources" ("group_id", "transaction_id", "source", "external_id", "label", "reconciled_by", "created_at")
SELECT t."group_id", t."id",
  CASE WHEN EXISTS (
    SELECT 1 FROM "pending_transactions" p
    WHERE p."group_id" = t."group_id" AND p."external_id" = t."external_id"
  ) THEN 'pluggy' ELSE 'ofx' END,
  t."external_id", t."description", t."created_by", t."created_at"
FROM "transactions" t
WHERE t."external_id" IS NOT NULL;--> statement-breakpoint
/* O campo antigo sai: a prova agora mora em transaction_sources, e um lugar só evita que
   as duas versões da verdade discordem um dia. */
DROP INDEX IF EXISTS "transactions_external_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "external_id";
