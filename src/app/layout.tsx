import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { logout } from "./login/actions";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Insights",
  description: "Your saved Instagram/YouTube tools, repos and lessons.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the cookie here makes every route dynamic. This is a single-user
  // dashboard that is already `force-dynamic` everywhere, so nothing is lost.
  const signedIn = await hasSession();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {signedIn ? (
          <header className="flex items-center justify-between gap-4 border-b border-black/10 px-6 py-3 dark:border-white/15">
            <Link href="/" className="text-sm font-semibold">
              AI Insights
            </Link>
            <form action={logout}>
              <button type="submit" className="text-sm underline underline-offset-4 opacity-70">
                Log out
              </button>
            </form>
          </header>
        ) : null}
        {children}
      </body>
    </html>
  );
}
