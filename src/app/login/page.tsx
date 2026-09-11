import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Log in · AI Insights" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // Same rule as the action's `safeNext`: a hidden field is still attacker-
  // supplied, so never round-trip anything that could leave this origin.
  const raw = typeof params.next === "string" ? params.next : "/";
  const next =
    raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";

  if (await hasSession()) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">AI Insights</h1>
        <p className="text-sm opacity-70">Enter the dashboard password to continue.</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
