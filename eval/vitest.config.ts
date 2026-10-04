import { defineConfig } from "vitest/config";

// Evaluations measure quality instead of asserting it. Each `npm run eval:*` script selects one
// project with `--project`; long runs set their own timeouts in code.
const entries: Record<string, string> = {
  retrieval: "eval/**/*.eval.ts",
  full: "eval/full.run.ts",
  "trace-report": "eval/trace-report.run.ts",
  embed: "eval/embed.run.ts",
  sweep: "eval/fusion-sweep.run.ts",
};

// Retrieval reads the expanded suite unless EVAL_SUITE says otherwise.
const expandedByDefault = new Set(["retrieval"]);

// Entries can call paid models, run for hours or rewrite reports: never run them all.
if (!process.argv.some((arg) => arg === "--project" || arg.startsWith("--project=")))
  throw new Error("Select one evaluation with --project; see the eval:* scripts in package.json.");

export default defineConfig({
  test: {
    reporters: ["dot"],
    projects: Object.entries(entries).map(([name, include]) => ({
      test: {
        name,
        include: [include],
        env: expandedByDefault.has(name)
          ? { EVAL_SUITE: process.env.EVAL_SUITE ?? "expanded" }
          : {},
      },
    })),
  },
});
