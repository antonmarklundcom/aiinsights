import { env } from "@/lib/env";
import type { TelegramPhotoSize } from "./telegram";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Telegram sends each photo as several resized JPEGs. The largest one at or
 * under this width keeps on-screen text legible without asking Claude to
 * chew through Telegram's full-resolution original (plan §6.3).
 */
const MAX_PHOTO_WIDTH = 1600;

/**
 * Picks the best `message.photo` entry to save: the largest size at or under
 * `MAX_PHOTO_WIDTH`. If every size exceeds it (unusual — Telegram's own
 * resizing rarely goes over 1280px), falls back to the smallest one rather
 * than downloading the biggest available.
 */
export function selectPhotoSize(sizes: TelegramPhotoSize[]): TelegramPhotoSize | undefined {
  if (sizes.length === 0) return undefined;

  const withinLimit = sizes.filter((s) => s.width <= MAX_PHOTO_WIDTH);
  if (withinLimit.length > 0) {
    return withinLimit.reduce((largest, s) => (s.width > largest.width ? s : largest));
  }
  return sizes.reduce((smallest, s) => (s.width < smallest.width ? s : smallest));
}

export type TelegramImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const EXTENSION_MEDIA_TYPES: Record<string, TelegramImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/** Telegram photos are re-encoded to JPEG; this only matters for the rare non-JPEG file_path. */
function mediaTypeFromPath(filePath: string): TelegramImageMediaType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MEDIA_TYPES[ext] ?? "image/jpeg";
}

export interface DownloadedTelegramPhoto {
  base64: string;
  mediaType: TelegramImageMediaType;
}

/**
 * Downloads a Telegram-hosted photo by `file_id`: `getFile` resolves the
 * storage path, then the file bytes are fetched and base64-encoded for a
 * Claude vision content block (plan §6.3).
 */
export async function downloadTelegramPhoto(fileId: string): Promise<DownloadedTelegramPhoto> {
  const getFileRes = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  if (!getFileRes.ok) {
    throw new Error(`Telegram getFile failed (HTTP ${getFileRes.status})`);
  }

  const getFileBody = (await getFileRes.json()) as {
    ok?: boolean;
    description?: string;
    result?: { file_path?: string };
  };
  const filePath = getFileBody.result?.file_path;
  if (!getFileBody.ok || !filePath) {
    throw new Error(`Telegram getFile failed: ${getFileBody.description ?? "no file_path in response"}`);
  }

  const fileRes = await fetch(`${TELEGRAM_API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!fileRes.ok) {
    throw new Error(`Telegram file download failed (HTTP ${fileRes.status})`);
  }

  const bytes = await fileRes.arrayBuffer();
  return { base64: Buffer.from(bytes).toString("base64"), mediaType: mediaTypeFromPath(filePath) };
}
