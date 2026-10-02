import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["eval/indexed.run.ts"], reporters: ["dot"] } });
