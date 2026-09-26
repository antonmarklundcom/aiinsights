ALTER TABLE "items" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "last_nudged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "dismissed_at" timestamp with time zone;