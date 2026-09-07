import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Unit tests only. Playwright owns tests/ and must not be picked up here.
    include: ["src/**/*.test.ts"],
    environment: "node",
    reporters: "default",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` is supplied by the Next.js compiler, not by node_modules, so
      // Vite cannot resolve it. Stubbing it lets server-only libs be unit tested;
      // the real guard still applies at build time, where it actually matters.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
});
