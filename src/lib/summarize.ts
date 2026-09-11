import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { ITEM_CATEGORIES, type ItemCategory } from "@/db/schema";
/* == S3 == */
import { SCREENSHOT_INSTRUCTION, buildScreenshotImageBlock } from "@/lib/vision";
/* == S3 == */

/** Current-generation model (plan §1.5). Exported so tests can assert it. */
export const SUMMARY_MODEL = "claude-opus-5";

/**
 * Opus 5 has a 1M-token context window, so the old 8,000-char slice threw away
 * most of a long transcript for no reason. The prompt states that this cap
 * exists so the model can say when it is working from a partial transcript.
 */
export const TRANSCRIPT_MAX_CHARS = 30_000;

export interface SummaryInput {
  url: string;
  platform: string;
  caption?: string | null;
  transcript?: string | null;
  userNote?: string | null;
  repoUrl?: string | null;
  repoReadme?: string | null;
  /* == S3 == */
  /** Telegram `file_id` of a forwarded screenshot, fetched at summarize time. */
  imageFileId?: string | null;
  /* == S3 == */
}

export interface SummaryOutput {
  title: string;
  summary: string;
  category: ItemCategory;
  tags: string[];
  howToStart: string[];
}

export interface SummaryUsage {
  /** The model that actually answered — may be a fallback, not `SUMMARY_MODEL`. */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface SummaryResult {
  output: SummaryOutput;
  usage: SummaryUsage;
}

/**
 * Identical on every call, so it is a cache breakpoint: the per-item content
 * goes in the user turn, below (plan §1.5, report §3).
 */
const SYSTEM_PROMPT = [
  "You help someone build a personal knowledge base of AI tools, open-source repos, and dev tricks they saved from Instagram, YouTube, GitHub and articles, and want to actually use later.",
  "",
  "Given the information about one saved item, call `save_summary` with: a clear title, a short summary of what it is and why someone would want it, one category, tags, and concrete ordered steps to actually get started (assume a developer comfortable with the terminal, npm and git).",
  "",
  "Rules:",
  "- Always write in English. If the caption, transcript or note is in Swedish, Spanish or any other language, still write every field in English.",
  `- A transcript may be truncated at ${TRANSCRIPT_MAX_CHARS.toLocaleString("en-US")} characters. If it ends mid-thought, summarize what is there and do not invent the rest.`,
  "- If a repo README is provided, ground the summary and the steps in it rather than guessing from the title.",
  "- If there is barely any information (a bare URL with no caption, transcript or note), say so honestly in the summary and make `howToStart` a single step asking for a quick note about what the content covered.",
].join("\n");

const SAVE_SUMMARY_TOOL: Anthropic.Beta.BetaTool = {
  name: "save_summary",
  description: "Structured summary of a saved piece of AI/dev content.",
  // Guarantees the arguments validate against the schema — in particular that
  // `category` really is one of ITEM_CATEGORIES, which the column now enforces.
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "Short descriptive title, max ~8 words" },
      summary: {
        type: "string",
        description: "2-4 sentence plain-language summary of what this is and why it's useful",
      },
      category: {
        type: "string",
        enum: [...ITEM_CATEGORIES],
        description: "The single best-fitting category. Use 'other' only when none of the rest fit.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "3-6 short lowercase tags (tech names, use case, etc.)",
      },
      howToStart: {
        type: "array",
        items: { type: "string" },
        description:
          "3-6 concrete, ordered getting-started steps. If there isn't enough information to give real steps, return a single step explaining what info is missing.",
      },
    },
    required: ["title", "summary", "category", "tags", "howToStart"],
  },
};

let client: Anthropic | undefined;

/** Lazy so that importing this module never touches `env` (which throws when unset). */
function anthropic(): Anthropic {
  return (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
}

function buildUserContent(input: SummaryInput): string {
  const parts: string[] = [`Source URL: ${input.url}`, `Platform: ${input.platform}`];
  if (input.userNote) parts.push(`User's own note about it: ${input.userNote}`);
  if (input.caption) parts.push(`Post caption/description:\n${input.caption}`);
  if (input.transcript) {
    const transcript = input.transcript.slice(0, TRANSCRIPT_MAX_CHARS);
    const truncated = input.transcript.length > TRANSCRIPT_MAX_CHARS ? " (truncated)" : "";
    parts.push(`Video transcript (may be partial/noisy)${truncated}:\n${transcript}`);
  }
  if (input.repoUrl) parts.push(`Linked repo: ${input.repoUrl}`);
  if (input.repoReadme) parts.push(`Repo README excerpt:\n${input.repoReadme}`);
  return parts.join("\n\n");
}

function isItemCategory(value: unknown): value is ItemCategory {
  return typeof value === "string" && (ITEM_CATEGORIES as readonly string[]).includes(value);
}

export async function summarizeItem(input: SummaryInput): Promise<SummaryResult> {
  /* == S3 == */
  // A screenshot goes in as an image block before the text block, per plan §6.3.
  const userContent: string | Array<Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaTextBlockParam> =
    input.imageFileId
      ? [
          await buildScreenshotImageBlock(input.imageFileId),
          { type: "text", text: `${SCREENSHOT_INSTRUCTION}\n\n${buildUserContent(input)}` },
        ]
      : buildUserContent(input);
  /* == S3 == */

  const message = await anthropic().beta.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 16000,
    // Extraction, not reasoning — adaptive thinking stays on (it is the Opus 5
    // default and `thinking` is deliberately not passed), just held short.
    output_config: { effort: "low" },
    // A rare policy decline is re-run on a fallback model inside the same call
    // instead of costing the item its summary.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [SAVE_SUMMARY_TOOL],
    tool_choice: { type: "tool", name: "save_summary" },
    messages: [{ role: "user", content: userContent }],
  });

  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unspecified";
    throw new Error(
      `Claude declined to summarize this item (${category}). The link is saved; the summary is not.`
    );
  }

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a structured summary");
  }

  const raw = toolUse.input as Partial<SummaryOutput>;
  const output: SummaryOutput = {
    title: raw.title ?? "Saved item",
    summary: raw.summary ?? "",
    // `strict: true` already constrains this; the guard keeps a surprise from
    // reaching a column that is now a Postgres enum.
    category: isItemCategory(raw.category) ? raw.category : "other",
    tags: raw.tags ?? [],
    howToStart: raw.howToStart ?? [],
  };

  return {
    output,
    usage: {
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
