import { defineConfig } from "vitest/config";

// Evaluations measure quality instead of asserting it. Each `npm run eval:*` script selects one
// project with `--project`; long runs set their own timeouts in code.
const entries: Record<string, string> = {
  retrieval: "eval/**/*.eval.ts",
  agent: "eval/agent.run.ts",
  calibrate: "eval/calibration.run.ts",
  regrade: "eval/regrade.run.ts",
  full: "eval/full.run.ts",
  build: "eval/expanded.build.ts",
  continue: "eval/continue.run.ts",
  indexed: "eval/indexed.run.ts",
  finish: "eval/finish.run.ts",
  "ai-recover": "eval/ai-recover.run.ts",
  "full-replay": "eval/full-replay.run.ts",
  vector: "eval/vector.run.ts",
  ollama: "eval/ollama.run.ts",
  "agentic-rag": "eval/agentic-rag.run.ts",
  "local-quality": "eval/local-quality.run.ts",
};

// Calibration and regrading read the pilot suite unless EVAL_SUITE says otherwise.
const expandedByDefault = new Set(["retrieval", "agent"]);

// Entries can call paid models, run for hours or rewrite committed reports: never run them all.
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
