import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Minimal config: it exists only so Vitest resolves the `@/*` tsconfig alias.
 * Modules under test (`@/db`, `@/lib/env`, ...) import through it, so without
 * this `vi.mock("@/db")` cannot resolve — see `docs/log/O1.md` "Known issues".
 *
 * S2 owns this file (plan phase table) and should extend it; O2 created it
 * because its own exit criteria require DB-mocked tests. Keep the alias.
 *
 * `.mts`, not `.ts`: Vite's native config loader warns on ESM syntax in a file
 * it loads as CommonJS, and this package has no `"type": "module"`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
