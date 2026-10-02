import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["eval/regrade.run.ts"], reporters: ["dot"], silent: false },
});
