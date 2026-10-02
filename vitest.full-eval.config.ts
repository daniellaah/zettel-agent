import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["eval/full.run.ts"], reporters: ["dot"], env: { EVAL_SUITE: "expanded" } },
});
