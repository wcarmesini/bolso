ALTER TABLE "bank_connections" ADD COLUMN "integration_key_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_integration_key_id_integration_keys_id_fk" FOREIGN KEY ("integration_key_id") REFERENCES "public"."integration_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
/* As conexões que já existiam nasceram da única chave que o grupo tinha */
UPDATE "bank_connections" c
SET "integration_key_id" = (
  SELECT k."id" FROM "integration_keys" k
  WHERE k."group_id" = c."group_id" AND k."provider" = 'pluggy'
  ORDER BY k."created_at" LIMIT 1
)
WHERE c."integration_key_id" IS NULL;
