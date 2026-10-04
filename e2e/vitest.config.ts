import { defineConfig } from "vitest/config";

// End-to-end tests drive the built plugin inside Obsidian (macOS) over the DevTools protocol.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    // agent.e2e.ts calls live model APIs and costs money; it runs only through `npm run e2e:live`.
    exclude: process.env.E2E_LIVE === "1" ? [] : ["e2e/agent.e2e.ts"],
    globalSetup: ["e2e/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 180_000,
    reporters: ["verbose"],
  },
});
