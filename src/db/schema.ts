import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  boolean,
  jsonb,
  bigint,
} from "drizzle-orm/pg-core";

export const items = pgTable("items", {
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

  // AI output
  title: text("title"),
  summary: text("summary"), // 2-4 sentence "what is this"
  category: varchar("category", { length: 60 }), // e.g. "AI tooling", "dev workflow", "self-hosting"
  tags: jsonb("tags").$type<string[]>().default([]),
  howToStart: jsonb("how_to_start").$type<string[]>().default([]), // step-by-step getting-started list

  // Pipeline / user state
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | processing | done | needs_note | failed
  implemented: boolean("implemented").notNull().default(false),
  processingError: text("processing_error"),

  // Telegram origin, so the bot can reply/edit later and dedupe
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
  telegramMessageId: bigint("telegram_message_id", { mode: "number" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
