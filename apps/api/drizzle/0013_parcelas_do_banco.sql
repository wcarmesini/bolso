ALTER TABLE "pending_transactions" ADD COLUMN "installment_number" smallint;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD COLUMN "installment_count" smallint;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD COLUMN "purchase_date" date;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD COLUMN "merchant" text;