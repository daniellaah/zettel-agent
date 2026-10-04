import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { call, text } from "../src/testing/scripted-provider";
import { annotationHashes, readCompletedRun } from "./completed-run";
import type { PlannedJob } from "./full-plan";
import { smokeJudgment } from "./smoke";
import { ITEM, STORAGE, scriptedRecord } from "./trace-fixture";
import { sha256 } from "./validate";

const job = (name: string): PlannedJob => ({
  name,
  item: ITEM,
  variant: "agent",
  trial: 1,
  group: "dev",
  robust: null,
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "completed-run-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  return { path: file, sha256: sha256(readFileSync(file, "utf8")) };
}

/** Phase one solves and records; phase two inherits the result and regrades it. */
async function phases() {
  const { record, exchanges } = await scriptedRecord([
    [call("read", { target: STORAGE })],
    [text("Answer [E1].")],
  ]);
  const one = path.join(root, "one");
  const two = path.join(root, "two");
  const result = write(path.join(one, "a-result.json"), { record });
  const recording = write(path.join(one, "a-recording.json"), { agent: exchanges, judge: [] });
  return { record, exchanges, one, two, result, recording };
}

describe("reading a completed evaluation", () => {
  it("follows result and recording inheritance to the solver's steps", async () => {
    const { record, exchanges, two, result, recording } = await phases();
    write(path.join(two, "a-result.json"), { record, inherited: result });
    write(path.join(two, "b-result.json"), { record, inherited: result });
    write(path.join(two, "b-recording.json"), { agent: [], inheritedAgent: recording, judge: [] });
    const read = readCompletedRun(two, root, [job("a"), job("b"), job("c")]);
    expect(read.missing).toEqual(["c"]);
    expect(read.jobs.map((j) => [j.job.name, j.exchanges, j.grading])).toEqual([
      ["a", exchanges, "none"],
      ["b", exchanges, "none"],
    ]);
  });

  it("uses a validated AI repair for a failed grade and marks it", async () => {
    const { record, two, result } = await phases();
    write(path.join(two, "a-result.json"), { record, inherited: result });
    const judgment = smokeJudgment(ITEM);
    write(path.join(two, "ai-recovery", "validated", "a.json"), { judgment });
    const [entry] = readCompletedRun(two, root, [job("a")]).jobs;
    expect(entry!.grading).toBe("ai-repair");
    expect(entry!.record).toMatchObject({ judgment, gradingError: null });
  });

  it("refuses changed inherited files and files outside the artifacts", async () => {
    const { record, one, two, result } = await phases();
    write(path.join(two, "a-result.json"), { record, inherited: { ...result, sha256: "0" } });
    expect(() => readCompletedRun(two, root, [job("a")])).toThrow("changed");
    expect(() => readCompletedRun(one, path.join(root, "two"), [job("a")])).toThrow("Outside");
  });

  it("finds annotation hashes in original and nested phase bindings", () => {
    const hashes = { answersSha256: "a", robustnessSha256: "r" };
    expect(annotationHashes({ ...hashes, corpusHash: "c" })).toEqual(hashes);
    expect(annotationHashes({ original: hashes })).toEqual(hashes);
    expect(annotationHashes({ parent: { original: hashes }, finishSha256: "f" })).toEqual(hashes);
    expect(() => annotationHashes({ parent: {} })).toThrow();
  });
});
