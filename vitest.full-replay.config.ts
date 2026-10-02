import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["eval/full-replay.run.ts"], reporters: ["dot"] } });
