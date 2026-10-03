import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["eval/agentic-rag.run.ts"], testTimeout: 7_200_000 },
});
