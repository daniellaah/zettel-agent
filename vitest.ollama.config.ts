import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["eval/ollama.run.ts"], testTimeout: 900_000, fileParallelism: false },
});
