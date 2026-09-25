ALTER TABLE "transactions" ADD COLUMN "transfer_group_id" uuid;--> statement-breakpoint
CREATE INDEX "transactions_transfer_idx" ON "transactions" USING btree ("transfer_group_id");