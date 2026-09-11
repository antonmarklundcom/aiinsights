CREATE TYPE "public"."item_category" AS ENUM('ai-coding-tool', 'ai-model-or-api', 'agent-or-automation', 'self-hosting', 'dev-workflow', 'productivity', 'browser-extension', 'design-or-ui', 'learning-resource', 'data-or-scraping', 'other');--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "image_file_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "ai_model" varchar(60);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "ai_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "ai_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "items_telegram_message_idx" ON "items" USING btree ("telegram_chat_id","telegram_message_id");--> statement-breakpoint
CREATE INDEX "items_url_idx" ON "items" USING btree ("url");