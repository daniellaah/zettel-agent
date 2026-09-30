import { defineConfig } from "vitest/config";

// End-to-end tests drive the real plugin inside Obsidian (macOS). See e2e/README.md.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    globalSetup: ["e2e/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 180_000,
    reporters: ["verbose"],
  },
});
