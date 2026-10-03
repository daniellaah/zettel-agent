import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["eval/local-quality.run.ts"], testTimeout: 3_600_000, fileParallelism: false },
});
