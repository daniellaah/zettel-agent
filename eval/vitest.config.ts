import { defineConfig } from "vitest/config";

// Evaluations measure quality instead of asserting it. Each `npm run eval:*` script selects one
// project with `--project`; long runs set their own timeouts in code.
const entries: Record<string, string> = {
  retrieval: "eval/**/*.eval.ts",
  embed: "eval/embed.run.ts",
};

// Entries take minutes, call the local Ollama or write reports: never run them all.
if (!process.argv.some((arg) => arg === "--project" || arg.startsWith("--project=")))
  throw new Error("Select one evaluation with --project; see the eval:* scripts in package.json.");

export default defineConfig({
  test: {
    reporters: ["dot"],
    projects: Object.entries(entries).map(([name, include]) => ({
      test: { name, include: [include] },
    })),
  },
});
