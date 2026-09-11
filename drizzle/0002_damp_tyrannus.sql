-- Hand-written (plan §5.2). Two steps, both idempotent so a partial apply is safe:
--   1. map the legacy free-text `category` values onto the enum's values (plan §2)
--   2. cast the column from varchar to `item_category`
-- Step 1 must run first: the cast in step 2 fails on any value the enum
-- doesn't hold. Anything unrecognised becomes 'other' rather than blocking.

--> statement-breakpoint
UPDATE "items"
SET "category" = CASE
  -- Already one of the enum's values (including the ones no legacy rule
  -- produces — design-or-ui, learning-resource, data-or-scraping). This arm is
  -- also what makes re-running the migration a no-op.
  WHEN lower(btrim("category")) IN (
    'ai-coding-tool', 'ai-model-or-api', 'agent-or-automation', 'self-hosting',
    'dev-workflow', 'productivity', 'browser-extension', 'design-or-ui',
    'learning-resource', 'data-or-scraping', 'other'
  ) THEN lower(btrim("category"))
  WHEN lower("category") LIKE '%coding%' THEN 'ai-coding-tool'
  WHEN lower("category") LIKE '%model%' OR lower("category") LIKE '%api%' THEN 'ai-model-or-api'
  WHEN lower("category") LIKE '%automation%' OR lower("category") LIKE '%agent%' THEN 'agent-or-automation'
  WHEN lower("category") LIKE '%self-host%' THEN 'self-hosting'
  WHEN lower("category") LIKE '%workflow%' THEN 'dev-workflow'
  WHEN lower("category") LIKE '%productivity%' THEN 'productivity'
  WHEN lower("category") LIKE '%extension%' THEN 'browser-extension'
  ELSE 'other'
END
WHERE "category" IS NOT NULL
  AND pg_typeof("category")::text <> 'item_category';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'category'
      AND udt_name <> 'item_category'
  ) THEN
    ALTER TABLE "items" ALTER COLUMN "category" SET DATA TYPE "public"."item_category"
      USING "category"::"public"."item_category";
  END IF;
END $$;
