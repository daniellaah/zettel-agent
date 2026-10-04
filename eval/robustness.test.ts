import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { robustnessInterfaceChecks, robustnessTask, type RobustCase } from "./robustness";
import { EvidenceLedger } from "../src/agent/evidence";
import { executeTool } from "../src/agent/tools";

it("keeps independent attacks in memory, rejects external/write access and hides fleeting captures", () => {
  const data = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "robustness/cases.json"), "utf8"),
  ) as { cases: RobustCase[] };
  expect(data.cases).toHaveLength(8);
  for (const test of data.cases) {
    const { item, corpus } = robustnessTask(test);
    expect(Object.values(robustnessInterfaceChecks(corpus))).toEqual(Array(7).fill(true));
    expect(item.forbidden.length).toBeGreaterThan(0);
    expect(item.keyPoints.length).toBeGreaterThan(0);
  }
  const { corpus } = robustnessTask(data.cases[1]!);
  const result = executeTool(
    "read",
    { target: data.cases[1]!.notes[0]!.path },
    { corpus, ledger: new EvidenceLedger() },
  );
  expect(result.content).toContain("<\\/note>");
  expect(result.content.match(/<\/note>/g)).toHaveLength(1);
});
