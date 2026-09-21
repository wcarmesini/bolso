CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid,
	"amount_cents" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "limit_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "closing_day" smallint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_day" smallint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "limit_cents" bigint;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "statement_month" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_group_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_number" smallint;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_count" smallint;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_group_id_organization_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_splits_transaction_idx" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_group_category_idx" ON "transaction_splits" USING btree ("group_id","category_id");--> statement-breakpoint
CREATE INDEX "transactions_statement_idx" ON "transactions" USING btree ("account_id","statement_month");--> statement-breakpoint
CREATE INDEX "transactions_installment_idx" ON "transactions" USING btree ("installment_group_id");--> statement-breakpoint
-- Dados existentes: cada lançamento vira uma parte só, com a categoria e o valor dele.
-- A coluna transactions.category_id só é removida na migration seguinte, depois desta cópia.
INSERT INTO "transaction_splits" ("group_id", "transaction_id", "category_id", "amount_cents")
SELECT "group_id", "id", "category_id", "amount_cents" FROM "transactions";
