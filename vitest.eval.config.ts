import { defineConfig } from "vitest/config";

// Evaluations measure quality instead of asserting it; run them with `npm run eval`.
export default defineConfig({
  test: {
    include: ["eval/**/*.eval.ts"],
    reporters: ["dot"],
    silent: false,
    env: { EVAL_SUITE: process.env.EVAL_SUITE ?? "expanded" },
  },
});
