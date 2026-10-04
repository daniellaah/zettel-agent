import { describe, expect, it } from "vitest";
import { EvidenceLedger } from "../src/agent/evidence";
import { answerProvenance } from "../src/session/provenance";
import { call, text } from "../src/testing/scripted-provider";
import {
  compareDiagnoses,
  diagnoseTrace,
  noteSupport,
  summarizeDiagnoses,
  unitFailure,
  type TraceDiagnosis,
  type UnitFailure,
} from "./trace-diagnosis";
import { ITEM, PRECISION, STORAGE, judgmentFor, scriptedRecord } from "./trace-fixture";

const diagnose = async (...args: Parameters<typeof scriptedRecord>) => {
  const { record, exchanges } = await scriptedRecord(...args);
  return diagnoseTrace({ job: "j", item: ITEM, record, exchanges, grading: "model" });
};

const PASSING = "Storage differs from compute [E1].";
const FAILING =
  "An uncited opening summary.\n\nA stretched detail [E1].\n\nAn invented source [E9].";

describe("trace diagnosis", () => {
  it("reports a passing run with delivered support and a read, in-context citation", async () => {
    const row = await diagnose(
      [[call("read", { target: STORAGE })], [text(PASSING)]],
      judgmentFor([{ quote: PASSING, cite: { E1: "supporting" } }]),
    );
    expect(row).toMatchObject({ pass: true, failures: [], grading: "model" });
    expect(row.points.map((p) => p.supportDelivered)).toEqual([true, true]);
    expect(row.units).toEqual([
      expect.objectContaining({
        unit: 0,
        failure: null,
        opening: true,
        citations: [{ id: "E1", verdict: "supporting", bodyRead: true, inFinalContext: true }],
      }),
    ]);
    expect(row.process).toMatchObject({ stop: "answered", requests: 2, toolCalls: 1 });
  });

  it("separates retrieval from synthesis misses and classifies each failing unit", async () => {
    const row = await diagnose(
      [[call("read", { target: PRECISION })], [text(FAILING)]],
      judgmentFor(
        [
          { quote: "An uncited opening summary.", verdict: "unsupported" },
          { quote: "A stretched detail [E1].", verdict: "partial", cite: { E1: "supporting" } },
          { quote: "An invented source [E9].", verdict: "unsupported", cite: { E9: "unknown" } },
        ],
        { missing: ["usual-types"] },
      ),
    );
    expect(row.pass).toBe(false);
    expect(row.failures).toEqual(["missed-point", "ungrounded-claim", "bad-citation"]);
    expect(row.points).toEqual([
      { id: "storage-compute", status: "covered", supportDelivered: true },
      { id: "usual-types", status: "missing", supportDelivered: false },
    ]);
    expect(row.units.map((u) => [u.unit, u.failure, u.opening])).toEqual([
      [0, "uncited", true],
      [1, "partial", false],
      [2, "unsupported", false],
    ]);
    expect(row.units[2]!.citations[0]).toMatchObject({ bodyRead: false, inFinalContext: false });
    expect(row.process.unknownCitations).toBe(1);
  });

  it("mirrors every strict-gate condition", async () => {
    const answer = "Answer [E1].";
    const steps = () => [[call("read", { target: STORAGE })], [text(answer)]];
    const unit = { quote: answer, cite: { E1: "supporting" as const } };
    const failures = async (...args: Parameters<typeof judgmentFor>) =>
      (await diagnose(steps(), judgmentFor(...args))).failures;
    expect(await failures([unit], { forbidden: [0] })).toEqual(["forbidden"]);
    expect(await failures([unit], { abstention: "inappropriate" })).toEqual(["abstention"]);
    expect(await failures([{ ...unit, kind: "general" }])).toEqual(["no-note-claim"]);
    const stopped = await diagnose(
      [[call("read", { target: STORAGE })], new Error("dispatch failed")],
      judgmentFor([unit]),
    );
    expect([stopped.pass, stopped.failures]).toEqual([false, ["incomplete"]]);
    const ungraded = await diagnose(steps());
    expect([ungraded.pass, ungraded.failures, ungraded.units]).toEqual([null, [], []]);
    expect(ungraded.points.map((p) => p.status)).toEqual([null, null]);
  });

  it("flags excerpt-only citations, repeated calls and tool errors", async () => {
    const row = await diagnose(
      [
        [call("search", { query: ITEM.question })],
        [call("read", { target: "missing.md" }), call("read", { target: "missing.md" })],
        [text(PASSING)],
      ],
      judgmentFor([{ quote: PASSING, cite: { E1: "supporting" } }]),
    );
    expect(row.units[0]!.citations[0]).toMatchObject({ bodyRead: false, inFinalContext: true });
    expect(row.process).toMatchObject({ toolCalls: 3, toolErrors: 2, repeatedCalls: 1 });
  });

  it("checks citations against the final request's context", async () => {
    const { record, exchanges } = await scriptedRecord(
      [[call("read", { target: STORAGE })], [text(PASSING)]],
      judgmentFor([{ quote: PASSING, cite: { E1: "supporting" } }]),
    );
    const at = (recorded: typeof exchanges) =>
      diagnoseTrace({ job: "j", item: ITEM, record, exchanges: recorded, grading: "none" })
        .units[0]!.citations[0]!.inFinalContext;
    expect(at(exchanges)).toBe(true);
    expect(at(exchanges.slice(0, 1))).toBe(false);
    expect(at([])).toBeNull();
  });

  it("agrees with the chat pane's Sources on which cited bodies were read", async () => {
    // Historical v1 traces lack delivery contracts, so diagnosis keeps its own parser; on
    // current traces both definitions must give the same answer.
    const answer = "Storage and compute differ [E1][E2][E3].";
    const { record, exchanges } = await scriptedRecord(
      [
        [call("search", { query: ITEM.question })],
        [call("read", { target: STORAGE })],
        [text(answer)],
      ],
      judgmentFor([
        { quote: answer, cite: { E1: "supporting", E2: "supporting", E3: "supporting" } },
      ]),
    );
    const row = diagnoseTrace({ job: "j", item: ITEM, record, exchanges, grading: "model" });
    const transcript = record.run.transcript;
    const pane = answerProvenance({
      history: transcript,
      turnStart: 0,
      turnEnd: transcript.length,
      cited: ["E1", "E2", "E3"],
      ledger: new EvidenceLedger(record.run.evidence),
    });
    const diagnosis = row.units[0]!.citations.map((c) => [c.id, c.bodyRead]);
    expect(diagnosis).toEqual(pane.cited.map((s) => [s.id, s.seen === "body"]));
    expect(diagnosis.some(([, read]) => read)).toBe(true);
    expect(diagnosis.some(([, read]) => !read)).toBe(true);
  });

  it("names unit failures by verdict and citations", () => {
    const claim = { id: "u0", answerQuote: "q", kind: "note" as const, support: [], reason: "r" };
    const cite = [{ id: "E1", verdict: "supporting" as const, reason: "r" }];
    expect(unitFailure({ ...claim, verdict: "supported", citations: [] })).toBeNull();
    expect(unitFailure({ ...claim, verdict: "contradicted", citations: cite })).toBe(
      "contradicted",
    );
    expect(unitFailure({ ...claim, verdict: "partial", citations: [] })).toBe("uncited");
    expect(unitFailure({ ...claim, verdict: "partial", citations: cite })).toBe("partial");
    expect(unitFailure({ ...claim, verdict: "unsupported", citations: cite })).toBe("unsupported");
  });
});

describe("diagnosis summary", () => {
  it("counts gate failures, missed points by stage, units and citation reading", async () => {
    const passing = await diagnose(
      [[call("read", { target: STORAGE })], [text(PASSING)]],
      judgmentFor([{ quote: PASSING, cite: { E1: "supporting" } }]),
    );
    const failing = await diagnose(
      [[call("read", { target: PRECISION })], [text(FAILING)]],
      judgmentFor(
        [
          { quote: "An uncited opening summary.", verdict: "unsupported" },
          { quote: "A stretched detail [E1].", verdict: "partial", cite: { E1: "supporting" } },
          { quote: "An invented source [E9].", verdict: "unsupported", cite: { E9: "unknown" } },
        ],
        { missing: ["usual-types"] },
      ),
    );
    const summary = summarizeDiagnoses([passing, failing]);
    expect(summary).toMatchObject({
      jobs: 2,
      graded: 2,
      passes: 1,
      gate: { "missed-point": 1, "ungrounded-claim": 1, "bad-citation": 1, forbidden: 0 },
      missedPoints: { total: 1, supportNotDelivered: 1, supportDelivered: 0 },
      opening: { opening: { units: 2, failing: 1 }, later: { units: 2, failing: 2 } },
      citedUnits: {
        everyBodyRead: { units: 2, failing: 1 },
        someBodyUnread: { units: 1, failing: 1 },
        someOutsideFinalContext: { units: 1, failing: 1 },
      },
      citations: { supporting: 2, irrelevant: 0, unknown: 1 },
      process: { medianRequests: 2, unknownCitations: 1 },
    });
    expect(summary.unitsByKind.note).toEqual({
      supported: 1,
      uncited: 1,
      partial: 1,
      unsupported: 1,
      contradicted: 0,
    });
  });
});

describe("baseline comparison", () => {
  const row = (
    job: string,
    pass: boolean | null,
    failures: (UnitFailure | null)[],
    kind: "note" | "general" = "note",
  ): TraceDiagnosis => ({
    job,
    itemId: job.split("-")[0]!,
    trial: 1,
    grading: "model",
    pass,
    failures: pass === false ? ["ungrounded-claim"] : [],
    points: [],
    units: failures.map((failure, unit) => ({
      unit,
      kind,
      verdict: failure ? "partial" : "supported",
      failure,
      opening: unit === 0,
      citations: [],
      quote: "q",
      reason: "r",
    })),
    process: {
      stop: "answered",
      requests: 1,
      toolCalls: 0,
      toolErrors: 0,
      repeatedCalls: 0,
      unknownCitations: 0,
      omittedTurns: 0,
      elapsedMs: 1,
      inputTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
    },
  });

  it("measures note support per run", () => {
    expect(noteSupport(row("a-1", true, [null, null, "uncited", "partial"]))).toBe(0.5);
    expect(noteSupport(row("a-1", true, [null], "general"))).toBeNull();
  });

  it("pairs jobs, counts fixed and broken runs, and bootstraps deltas over items", () => {
    const baseline = [
      row("a-1", false, ["partial", null]),
      row("a-2", false, ["uncited", null]),
      row("b-1", true, [null]),
      row("c-1", false, ["partial"]),
      row("d-1", null, []),
    ];
    const candidate = [
      row("a-1", true, [null, null]),
      row("a-2", true, [null, null]),
      row("b-1", false, ["partial"]),
      row("c-1", false, ["partial"]),
      row("d-1", true, [null]),
      row("e-1", true, [null]),
    ];
    const result = compareDiagnoses(baseline, candidate);
    expect(result).toMatchObject({
      paired: 5,
      graded: 4,
      unpaired: ["e-1"],
      passes: { before: 1, after: 2 },
      fixed: ["a-1", "a-2"],
      broken: ["b-1"],
      gate: { before: { "ungrounded-claim": 3 }, after: { "ungrounded-claim": 2 } },
      units: {
        before: { supported: 3, partial: 2, uncited: 1 },
        after: { supported: 4, partial: 2, uncited: 0 },
      },
    });
    expect(result.passDelta).toMatchObject({ pairs: 4, clusters: 3, delta: 0.25 });
    expect(result.noteSupportDelta.delta).toBeCloseTo((0.5 + 0.5 - 1 + 0) / 4);
  });
});
