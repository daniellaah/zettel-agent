import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["eval/agent.run.ts"],
    reporters: ["dot"],
    silent: false,
    env: { EVAL_SUITE: process.env.EVAL_SUITE ?? "expanded" },
  },
});
