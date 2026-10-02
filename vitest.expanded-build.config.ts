import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["eval/expanded.build.ts"] } });
