import { describe, expect, it } from "vitest";
import { EvidenceLedger } from "../src/agent/evidence";
import { executeTool } from "../src/agent/tools";
import { Corpus } from "../src/retrieval/corpus";
import { ScriptedProvider, call, text } from "../src/testing/scripted-provider";
import {
  deliveredEvidence,
  describeExposures,
  runAgentCase,
  type AnswerItem,
  type ToolTrace,
} from "./agent-runner";

const file = "02-Zettelkasten/Permanent/Training memory.md";
const item: AnswerItem = {
  id: "test",
  family: "memory",
  split: "dev",
  origin: "synthetic",
  lang: "en",
  question: "Explain training memory.",
  kind: "lookup",
  answerability: "answerable",
  history: [],
  activeNote: file,
  evidence: { gold: { path: file, basis: "permanent-inference", excerpt: "GOLD MUST NOT LEAK" } },
  keyPoints: [{ id: "memory", text: "GOLD ANSWER", supportSets: [["gold"]] }],
  forbidden: ["FORBIDDEN"],
  graphChecks: [],
  notes: "test",
};

function corpus() {
  const result = new Corpus({ stageForPath: () => "permanent" });
  result.upsert(
    file,
    `# Training memory\n\nTraining memory includes saved states.\n\n${"More details. ".repeat(100)}`,
  );
  return result;
}

describe("headless production runner", () => {
  it("records exact outputs and label-to-body exposure without leaking gold", async () => {
    const provider = new ScriptedProvider([
      [call("list", {})],
      [call("read", { target: "E1" })],
      [text("Saved states [E1].")],
    ]);
    const run = await runAgentCase({
      item,
      corpus: corpus(),
      provider,
      trial: 1,
      mode: "scripted",
    });
    const tools = run.turns[0]!.calls;
    expect(tools[0]!.exposures[0]).toMatchObject({ scope: "title", wholeSectionDelivered: false });
    expect(tools[1]!.exposures[0]).toMatchObject({
      id: "E1",
      scope: "read-body",
      wholeSectionDelivered: true,
    });
    expect(deliveredEvidence(run).map((delivery) => delivery.content)).toEqual(
      tools.map((entry) => entry.outcome!.content),
    );
    expect(JSON.stringify(provider.requests)).not.toMatch(/GOLD|FORBIDDEN/);
    expect(run.turns[0]!.result.citations).toEqual({ valid: ["E1"], unknown: [] });
    expect(run.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(run.turns[0]!.timeToFirstTextMs).not.toBeNull();
  });

  it("runs actual history questions, shares evidence, and resets between trials", async () => {
    const followup = { ...item, history: ["First explain saved states."] };
    const provider = new ScriptedProvider([
      [call("read", { target: file })],
      [text("Earlier answer [E1].")],
      [text("Follow-up [E1].")],
    ]);
    const run = await runAgentCase({
      item: followup,
      corpus: corpus(),
      provider,
      trial: 2,
      mode: "scripted",
    });
    expect(run.turns).toHaveLength(2);
    expect(run.turns[1]!.result.citations.valid).toEqual(["E1"]);
    expect(provider.requests.at(-1)!.messages).toHaveLength(5);
    const fresh = await runAgentCase({
      item,
      corpus: corpus(),
      provider: new ScriptedProvider([[text("[E1]")]]),
      trial: 3,
      mode: "scripted",
    });
    expect(fresh.evidence).toEqual([]);
    expect(fresh.turns[0]!.result.citations.unknown).toEqual(["E1"]);
  });

  it("retains failures and stops failed setup before asking the target question", async () => {
    const run = await runAgentCase({
      item: { ...item, history: ["setup"] },
      corpus: corpus(),
      provider: new ScriptedProvider([new Error("offline")]),
      trial: 1,
      mode: "scripted",
    });
    expect(run.turns).toHaveLength(1);
    expect(run.turns[0]!.result.error).toBe("offline");
    expect(run.turns[0]!.timeToFirstTextMs).toBeNull();
    expect(deliveredEvidence(run)).toEqual([]);
  });

  it("delivers zero-match and tool-error results to the judge without inventing evidence ids", async () => {
    const run = await runAgentCase({
      item,
      corpus: corpus(),
      provider: new ScriptedProvider([
        [call("match", { pattern: "not-present" }), call("read", { target: "missing-note" })],
        [text("No matching evidence.")],
      ]),
      trial: 1,
      mode: "scripted",
    });
    const deliveries = deliveredEvidence(run);
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toMatchObject({ isError: false, exposures: [] });
    expect(deliveries[1]).toMatchObject({ isError: true, exposures: [] });
    expect(deliveries.map((delivery) => delivery.content)).toEqual(
      run.turns[0]!.calls.map((entry) => entry.outcome!.content),
    );
  });

  it("classifies preview, match and graph conservatively and rejects missing ids", () => {
    const context = { corpus: corpus(), ledger: new EvidenceLedger() };
    const trace = (name: string, input: unknown): ToolTrace => ({
      id: "c1",
      name,
      input,
      request: 1,
      startedMs: 0,
      durationMs: 0,
      outcome: executeTool(name, input, context),
      exposures: [],
    });
    expect(
      describeExposures(trace("list", { preview: true }), context.corpus, context.ledger)[0]!.scope,
    ).toBe("preview");
    expect(
      describeExposures(trace("match", { pattern: "saved" }), context.corpus, context.ledger)[0]!
        .scope,
    ).toBe("match-lines");
    expect(
      describeExposures(trace("links", { target: file }), context.corpus, context.ledger)[0],
    ).toMatchObject({ scope: "graph", wholeSectionDelivered: false });
    expect(
      describeExposures(trace("search", { query: "states" }), context.corpus, context.ledger)[0],
    ).toMatchObject({ scope: "search-excerpt", wholeSectionDelivered: false });
    expect(
      describeExposures({ ...trace("read", {}), outcome: null }, context.corpus, context.ledger),
    ).toEqual([]);
    const missing = trace("list", {});
    missing.outcome!.evidenceIds.push("E99");
    expect(() => describeExposures(missing, context.corpus, context.ledger)).toThrow(
      "missing from ledger",
    );
  });
});
