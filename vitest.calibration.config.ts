import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["eval/calibration.run.ts"], reporters: ["dot"], silent: false },
});
