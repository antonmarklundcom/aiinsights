import type { Item } from "@/db/schema";
import type { InlineButton } from "@/lib/telegram";
import { escapeHtml } from "@/lib/telegram-format";

/**
 * The weekly "implement one thing" loop (N1). Pure functions only — the cron
 * route and the webhook do the I/O. The point of the app is that saved things
 * get used; Monday offers a few, Friday asks whether the chosen one happened.
 */

export const NUDGE_SIZE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** An item offered this recently is skipped so the offer rotates. */
export const RENUDGE_AFTER_MS = 14 * DAY_MS;
/** A commitment older than this is stale and no longer asked about. */
export const COMMIT_WINDOW_MS = 7 * DAY_MS;

type NudgeRow = Pick<
  Item,
  | "id"
  | "title"
  | "summary"
  | "url"
  | "status"
  | "implemented"
  | "committedAt"
  | "lastNudgedAt"
  | "dismissedAt"
  | "createdAt"
>;

/** Monday's offer: summarised, not done, not dismissed, not already chosen. */
export function pickMondayCandidates<T extends NudgeRow>(rows: T[], now: Date, n = NUDGE_SIZE): T[] {
  const t = now.getTime();
  return rows
    .filter(
      (r) =>
        r.status === "done" &&
        !r.implemented &&
        !r.dismissedAt &&
        !(r.committedAt && t - r.committedAt.getTime() < COMMIT_WINDOW_MS) &&
        !(r.lastNudgedAt && t - r.lastNudgedAt.getTime() < RENUDGE_AFTER_MS)
    )
    .sort((a, b) => {
      // Never-offered first, then least recently offered, then newest saved.
      const an = a.lastNudgedAt?.getTime() ?? -1;
      const bn = b.lastNudgedAt?.getTime() ?? -1;
      if (an !== bn) return an - bn;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, n);
}

/** Friday's follow-ups: chosen within the last week and not yet done. */
export function pickFridayFollowups<T extends NudgeRow>(rows: T[], now: Date): T[] {
  const t = now.getTime();
  return rows.filter(
    (r) =>
      !r.implemented &&
      !r.dismissedAt &&
      r.committedAt !== null &&
      t - r.committedAt.getTime() < COMMIT_WINDOW_MS
  );
}

const label = (r: Pick<Item, "title" | "url">) => r.title ?? r.url;

export function formatMonday(rows: NudgeRow[]): { text: string; buttons: InlineButton[][] } {
  const lines = rows.map(
    (r, i) =>
      `<b>${i + 1}. ${escapeHtml(label(r))}</b>\n${escapeHtml(r.summary ?? "")}`.trimEnd()
  );
  return {
    text: `🛠 <b>Pick one thing to implement this week</b>\n\n${lines.join("\n\n")}`,
    buttons: [
      rows.map((r, i) => ({ text: `Do #${i + 1}`, callback_data: `commit:${r.id}` })),
      rows.map((r, i) => ({ text: `Drop #${i + 1}`, callback_data: `drop:${r.id}` })),
    ],
  };
}

export function formatFriday(r: NudgeRow): { text: string; buttons: InlineButton[][] } {
  return {
    text: `✅ Did you implement <b>${escapeHtml(label(r))}</b> this week?`,
    buttons: [
      [
        { text: "Yes, done", callback_data: `done:${r.id}` },
        { text: "Next week", callback_data: `later:${r.id}` },
        { text: "Drop it", callback_data: `drop:${r.id}` },
      ],
    ],
  };
}

export type NudgeAction = "commit" | "done" | "later" | "drop";

export function parseNudgeCallback(data: string | undefined): { action: NudgeAction; id: number } | null {
  const m = /^(commit|done|later|drop):(\d+)$/.exec(data ?? "");
  return m ? { action: m[1] as NudgeAction, id: Number(m[2]) } : null;
}

/** Column changes for a button tap, plus the short toast shown to the user. */
export function applyNudgeAction(
  action: NudgeAction,
  now: Date
): { set: Partial<Pick<Item, "implemented" | "committedAt" | "dismissedAt">>; toast: string } {
  switch (action) {
    case "commit":
      return { set: { committedAt: now }, toast: "Locked in. I'll ask on Friday." };
    case "done":
      return { set: { implemented: true, committedAt: null }, toast: "Nice — marked implemented." };
    case "later":
      return { set: { committedAt: now }, toast: "OK, asking again next Friday." };
    case "drop":
      return { set: { dismissedAt: now, committedAt: null }, toast: "Dropped. I won't offer it again." };
  }
}
