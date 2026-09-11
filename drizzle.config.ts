import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` diffs the schema file against the snapshot in
 * `drizzle/meta` and never talks to a database, so it must work with no
 * DATABASE_URL set (CI and every build session). Only the commands that
 * actually connect require it (plan §5.1).
 */
const DB_COMMANDS = new Set(["push", "pull", "migrate", "studio", "up", "drop", "check"]);
const needsDatabase = process.argv.slice(2).some((arg) => DB_COMMANDS.has(arg));

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url && needsDatabase) {
    throw new Error(
      "DATABASE_URL is not set — required for drizzle-kit commands that connect to the database."
    );
  }
  return url ?? "";
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
  strict: true,
});
