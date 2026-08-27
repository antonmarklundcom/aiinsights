import Anthropic from "@anthropic-ai/sdk";

export interface SummaryInput {
  url: string;
  platform: string;
  caption?: string | null;
  transcript?: string | null;
  userNote?: string | null;
  repoUrl?: string | null;
  repoReadme?: string | null;
}

export interface SummaryOutput {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  howToStart: string[];
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA: Anthropic.Tool = {
  name: "save_summary",
  description: "Structured summary of a saved piece of AI/dev content.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short descriptive title, max ~8 words" },
      summary: {
        type: "string",
        description: "2-4 sentence plain-language summary of what this is and why it's useful",
      },
      category: {
        type: "string",
        description:
          "One short category, e.g. 'AI coding tool', 'self-hosting', 'automation', 'dev workflow', 'productivity', 'AI model/API', 'browser extension', 'other'",
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

export async function summarizeItem(input: SummaryInput): Promise<SummaryOutput> {
  const parts: string[] = [`Source URL: ${input.url}`, `Platform: ${input.platform}`];
  if (input.userNote) parts.push(`User's own note about it: ${input.userNote}`);
  if (input.caption) parts.push(`Post caption/description:\n${input.caption}`);
  if (input.transcript) parts.push(`Video transcript (may be partial/noisy):\n${input.transcript.slice(0, 8000)}`);
  if (input.repoUrl) parts.push(`Linked repo: ${input.repoUrl}`);
  if (input.repoReadme) parts.push(`Repo README excerpt:\n${input.repoReadme}`);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    tools: [SCHEMA],
    tool_choice: { type: "tool", name: "save_summary" },
    messages: [
      {
        role: "user",
        content: [
          "You help someone build a personal knowledge base of AI tools, open-source repos, and dev tricks they saw on Instagram/YouTube and want to actually use later.",
          "Given the information below about one saved item, produce a structured summary: a clear title, a short summary of what it is/does and why someone would want it, a category, tags, and concrete step-by-step instructions to actually get started using it (assume a developer comfortable with the terminal, npm, git etc).",
          "If the linked repo's README is provided, ground the summary and steps in it. If there's barely any information (e.g. only a bare URL, no caption/transcript/note), say so honestly in the summary and make howToStart a single step asking the user to add a quick note about what the content covered.",
          "",
          parts.join("\n\n"),
        ].join("\n"),
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a structured summary");
  }

  return toolUse.input as SummaryOutput;
}
