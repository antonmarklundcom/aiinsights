import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramPhotoSize } from "./telegram";

vi.mock("@/lib/env", () => ({ env: { TELEGRAM_BOT_TOKEN: "bot-token" } }));

const { selectPhotoSize, downloadTelegramPhoto } = await import("@/lib/telegram-files");

function size(width: number, height = width): TelegramPhotoSize {
  return { file_id: `f${width}`, width, height };
}

describe("selectPhotoSize", () => {
  it("returns undefined for an empty list", () => {
    expect(selectPhotoSize([])).toBeUndefined();
  });

  it("picks the largest size at or under 1,600px, Telegram's smallest-first order", () => {
    const sizes = [size(90), size(320), size(800), size(1280)];
    expect(selectPhotoSize(sizes)?.width).toBe(1280);
  });

  it("picks the largest size at or under 1,600px regardless of array order", () => {
    const sizes = [size(1280), size(90), size(1600), size(320)];
    expect(selectPhotoSize(sizes)?.width).toBe(1600);
  });

  it("excludes sizes over 1,600px even when they are the largest available", () => {
    const sizes = [size(320), size(1280), size(2048)];
    expect(selectPhotoSize(sizes)?.width).toBe(1280);
  });

  it("falls back to the smallest size when every size exceeds 1,600px", () => {
    const sizes = [size(2048), size(4096), size(1800)];
    expect(selectPhotoSize(sizes)?.width).toBe(1800);
  });

  it("returns the only size when there is just one", () => {
    expect(selectPhotoSize([size(640)])?.width).toBe(640);
  });
});

describe("downloadTelegramPhoto", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** A real (non-shared) ArrayBuffer, since TS's BodyInit rejects the wider ArrayBufferLike. */
  function toArrayBuffer(bytes: number[]): ArrayBuffer {
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    return buf;
  }

  function mockResponses(filePath: string, bytes: number[]) {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { file_path: filePath } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(toArrayBuffer(bytes), { status: 200 }));
  }

  it("resolves the file path via getFile, then downloads and base64-encodes it", async () => {
    mockResponses("photos/file_1.jpg", [1, 2, 3]);

    const result = await downloadTelegramPhoto("abc");

    expect(result.base64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(result.mediaType).toBe("image/jpeg");

    const [getFileCall, downloadCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(getFileCall[0]).toContain("bot-token/getFile");
    expect(getFileCall[0]).toContain("file_id=abc");
    expect(downloadCall[0]).toContain("/file/botbot-token/photos/file_1.jpg");
  });

  it("derives the media type from the file extension", async () => {
    mockResponses("photos/file_2.png", [9]);
    const result = await downloadTelegramPhoto("xyz");
    expect(result.mediaType).toBe("image/png");
  });

  it("throws when getFile reports failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, description: "file not found" }), { status: 200 })
    );
    await expect(downloadTelegramPhoto("missing")).rejects.toThrow(/file not found/i);
  });

  it("throws on a non-2xx from getFile", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(downloadTelegramPhoto("x")).rejects.toThrow(/HTTP 500/);
  });

  it("throws on a non-2xx file download", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { file_path: "p.jpg" } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(downloadTelegramPhoto("x")).rejects.toThrow(/HTTP 404/);
  });
});
