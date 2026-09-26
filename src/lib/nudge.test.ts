import { describe, expect, it } from "vitest";
import {
  applyNudgeAction,
  formatFriday,
  formatMonday,
  parseNudgeCallback,
  pickFridayFollowups,
  pickMondayCandidates,
} from "./nudge";

const NOW = new Date("2026-09-28T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function row(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    title: `Item ${id}`,
    summary: "A thing",
    url: `https://x/${id}`,
    status: "done",
    implemented: false,
    committedAt: null as Date | null,
    lastNudgedAt: null as Date | null,
    dismissedAt: null as Date | null,
    createdAt: daysAgo(id),
    ...over,
  };
}

describe("pickMondayCandidates", () => {
  it("skips implemented, dismissed, unfinished, recently committed and recently offered", () => {
    const rows = [
      row(1, { implemented: true }),
      row(2, { dismissedAt: daysAgo(1) }),
      row(3, { status: "failed" }),
      row(4, { committedAt: daysAgo(2) }),
      row(5, { lastNudgedAt: daysAgo(3) }),
      row(6),
    ];
    expect(pickMondayCandidates(rows, NOW).map((r) => r.id)).toEqual([6]);
  });

  it("offers never-offered first, then least recently offered, max three", () => {
    const rows = [row(1, { lastNudgedAt: daysAgo(20) }), row(2, { lastNudgedAt: daysAgo(40) }), row(3), row(4)];
    expect(pickMondayCandidates(rows, NOW).map((r) => r.id)).toEqual([3, 4, 2]);
  });

  it("offers an old commitment again once the week is over", () => {
    expect(pickMondayCandidates([row(1, { committedAt: daysAgo(8) })], NOW)).toHaveLength(1);
  });
});

describe("pickFridayFollowups", () => {
  it("asks only about this week's open commitments", () => {
    const rows = [
      row(1, { committedAt: daysAgo(4) }),
      row(2, { committedAt: daysAgo(9) }),
      row(3, { committedAt: daysAgo(1), implemented: true }),
      row(4),
    ];
    expect(pickFridayFollowups(rows, NOW).map((r) => r.id)).toEqual([1]);
  });
});

describe("messages and callbacks", () => {
  it("escapes HTML and builds one commit and one drop button per item", () => {
    const { text, buttons } = formatMonday([row(7, { title: "<script>" }), row(8)]);
    expect(text).toContain("&lt;script&gt;");
    expect(buttons[0].map((b) => b.callback_data)).toEqual(["commit:7", "commit:8"]);
    expect(buttons[1].map((b) => b.callback_data)).toEqual(["drop:7", "drop:8"]);
  });

  it("keeps callback data under Telegram's 64-byte limit", () => {
    const { buttons } = formatFriday(row(2_147_483_647));
    for (const b of buttons.flat()) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
  });

  it("parses only known actions", () => {
    expect(parseNudgeCallback("done:12")).toEqual({ action: "done", id: 12 });
    expect(parseNudgeCallback("rm:12")).toBeNull();
    expect(parseNudgeCallback("done:")).toBeNull();
    expect(parseNudgeCallback(undefined)).toBeNull();
  });

  it("maps each action to its column changes", () => {
    expect(applyNudgeAction("commit", NOW).set).toEqual({ committedAt: NOW });
    expect(applyNudgeAction("done", NOW).set).toEqual({ implemented: true, committedAt: null });
    expect(applyNudgeAction("drop", NOW).set).toEqual({ dismissedAt: NOW, committedAt: null });
  });
});
