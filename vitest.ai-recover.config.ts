import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["eval/ai-recover.run.ts"], reporters: ["dot"] } });
