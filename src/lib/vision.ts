import type Anthropic from "@anthropic-ai/sdk";
import { downloadTelegramPhoto } from "./telegram-files";

/**
 * What Claude is told about a forwarded screenshot, so it reads on-screen
 * text (repo names, captions, commands) rather than treating the image as
 * decorative (plan §6.3).
 */
export const SCREENSHOT_INSTRUCTION =
  "This screenshot was taken by the user of the content; read any visible text (repo names, captions, commands) and use it.";

/**
 * Fetches a forwarded Telegram screenshot and shapes it as the image content
 * block for a Claude vision request. Fetched at summarize time, never
 * stored (plan §6.3).
 */
export async function buildScreenshotImageBlock(
  fileId: string
): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const { base64, mediaType } = await downloadTelegramPhoto(fileId);
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}
