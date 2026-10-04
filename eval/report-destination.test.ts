import { expect, it } from "vitest";
import { reportDestination } from "./report-destination";
it("defaults to versioned output and rejects historical/ancestor destinations", () => {
  expect(reportDestination("/project/eval")).toBe("/project/eval/reports/tool-v2");
  expect(reportDestination("/project/eval", "/tmp/new-v2")).toBe("/tmp/new-v2");
  expect(() => reportDestination("/project/eval", "/project/eval/reports")).toThrow("versioned");
  expect(() => reportDestination("/project/eval", "/project/eval")).toThrow("versioned");
});
