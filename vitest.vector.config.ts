import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["eval/vector.run.ts"], reporters: ["dot"] } });
