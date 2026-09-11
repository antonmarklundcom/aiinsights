import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  boolean,
  jsonb,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The closed set of categories Claude may pick from (plan §2). Exported as a
 * plain array so the summarizer's tool schema and the dashboard filter import
 * the same list instead of drifting apart.
 */
export const ITEM_CATEGORIES = [
  "ai-coding-tool",
  "ai-model-or-api",
  "agent-or-automation",
  "self-hosting",
  "dev-workflow",
  "productivity",
  "browser-extension",
  "design-or-ui",
  "learning-resource",
  "data-or-scraping",
  "other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/**
 * The Postgres enum type backing `items.category`. O1 created the type; O2's
 * hand-written `drizzle/0002` maps the legacy free-text values onto it and
 * casts the column (plan §5.2).
 */
export const itemCategoryEnum = pgEnum("item_category", ITEM_CATEGORIES);

/** Pipeline states an item moves through. */
export const ITEM_STATUSES = ["pending", "processing", "done", "needs_note", "failed"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),

    // Source
    url: text("url").notNull(),
    platform: varchar("platform", { length: 20 }).notNull(), // instagram | youtube | other
    sourceCaption: text("source_caption"), // original caption/description if fetched
    transcript: text("transcript"), // captions/transcript text if we got one
    userNote: text("user_note"), // quick note the user typed when forwarding

    // Extracted repo / link
    repoUrl: text("repo_url"), // detected GitHub (or other) repo link
    repoReadme: text("repo_readme"), // fetched README snippet, for grounding the summary

    // A screenshot forwarded with the link — Telegram file_id, fetched on demand (S3)
    imageFileId: text("image_file_id"),

    // AI output
    title: text("title"),
    summary: text("summary"), // 2-4 sentence "what is this"
    category: itemCategoryEnum("category"), // legacy free-text values mapped by drizzle/0002 (plan §2)
    tags: jsonb("tags").$type<string[]>().default([]),
    howToStart: jsonb("how_to_start").$type<string[]>().default([]), // step-by-step getting-started list

    // What the summary cost us, so the dashboard can show it
    aiModel: varchar("ai_model", { length: 60 }),
    aiInputTokens: integer("ai_input_tokens"),
    aiOutputTokens: integer("ai_output_tokens"),

    // Pipeline / user state
    status: varchar("status", { length: 20 }).notNull().default("pending"), // ITEM_STATUSES
    implemented: boolean("implemented").notNull().default(false),
    processingError: text("processing_error"),
    attempts: integer("attempts").notNull().default(0), // incremented per processing run
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),

    // Telegram origin, so the bot can reply/edit later and dedupe
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Telegram retries webhook deliveries; the same message must never create
    // a second row (plan §1.4).
    uniqueIndex("items_telegram_message_idx").on(table.telegramChatId, table.telegramMessageId),
    // Re-forwarding a link we already have is looked up by URL on every insert.
    index("items_url_idx").on(table.url),
  ]
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
