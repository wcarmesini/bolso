CREATE TABLE "import_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"action" text NOT NULL,
	"transaction_id" uuid,
	"transfer_group_id" uuid,
	"pending_id" uuid,
	"external_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" text NOT NULL,
	"source" text NOT NULL,
	"connection_id" uuid,
	"account_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"linked_count" integer DEFAULT 0 NOT NULL,
	"transferred_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"undone_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_pending_id_pending_transactions_id_fk" FOREIGN KEY ("pending_id") REFERENCES "public"."pending_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_group_id_organization_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batch_items_batch_idx" ON "import_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_batches_group_idx" ON "import_batches" USING btree ("group_id","created_at");
--> statement-breakpoint
/*
 * O que já foi aprovado antes de existir histórico vira um lote só por conexão, para poder
 * ser desfeito também. Sem isso, a primeira leva de aprovações ficaria sem volta.
 */
INSERT INTO "import_batches" ("group_id", "source", "connection_id", "account_id", "label", "created_by", "created_at")
SELECT c."group_id", 'bank', c."id", c."account_id", c."connector_name", c."created_by", now()
FROM "bank_connections" c
WHERE EXISTS (
  SELECT 1 FROM "pending_transactions" p
  WHERE p."connection_id" = c."id" AND p."status" <> 'pending'
);--> statement-breakpoint
INSERT INTO "import_batch_items" ("batch_id", "action", "transaction_id", "transfer_group_id", "pending_id", "external_id")
SELECT b."id",
  CASE
    WHEN p."status" = 'dismissed' THEN 'skip'
    WHEN t."transfer_group_id" IS NOT NULL THEN 'transfer'
    WHEN t."origin" = 'bank' THEN 'create'
    WHEN t."id" IS NULL THEN 'skip'
    ELSE 'link'
  END,
  t."id", t."transfer_group_id", p."id", p."external_id"
FROM "pending_transactions" p
JOIN "import_batches" b ON b."connection_id" = p."connection_id"
LEFT JOIN "transactions" t ON t."group_id" = p."group_id" AND t."external_id" = p."external_id"
WHERE p."status" <> 'pending';--> statement-breakpoint
UPDATE "import_batches" b SET
  "created_count" = (SELECT count(*) FROM "import_batch_items" i WHERE i."batch_id" = b."id" AND i."action" = 'create'),
  "linked_count" = (SELECT count(*) FROM "import_batch_items" i WHERE i."batch_id" = b."id" AND i."action" = 'link'),
  "transferred_count" = (SELECT count(*) FROM "import_batch_items" i WHERE i."batch_id" = b."id" AND i."action" = 'transfer'),
  "skipped_count" = (SELECT count(*) FROM "import_batch_items" i WHERE i."batch_id" = b."id" AND i."action" = 'skip');
