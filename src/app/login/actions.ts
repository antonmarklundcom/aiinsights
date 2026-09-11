"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  authDisabled,
  newSessionExpiry,
  passwordMatches,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth";

/** Slows down guessing without holding a connection open for long (plan §5.3). */
const WRONG_PASSWORD_DELAY_MS = 500;

export type LoginState = { error?: string };

/**
 * Only ever redirect within this app: an absolute URL, a protocol-relative
 * `//evil.example` or a backslash variant would turn the login into an open
 * redirect.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const next = safeNext(formData.get("next"));
  const password = formData.get("password");

  // No password configured outside production: there is nothing to check, and
  // the proxy is letting everyone through anyway.
  if (!authDisabled()) {
    if (typeof password !== "string" || !(await passwordMatches(password))) {
      await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
      return { error: "Wrong password." };
    }

    const expiresAt = newSessionExpiry();
    const store = await cookies();
    store.set(SESSION_COOKIE, await signSession(expiresAt), sessionCookieOptions(expiresAt));
  }

  redirect(next);
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  redirect("/login");
}
