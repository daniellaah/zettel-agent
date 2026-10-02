import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["eval/continue.run.ts"], reporters: ["dot"] } });
