import { describe, expect, it } from "vitest";
import { ScriptedProvider, text, call } from "../src/testing/scripted-provider";
import { runAgentCase } from "./agent-runner";
import { RecordedProvider } from "./model-recording";
import { judgeInput } from "./answer-scoring";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { insideArtifacts, regradeConfig, validateRegradeSource } from "./regrade";

describe("judge-only regrading boundaries", () => {
  it("defaults to offline, requires sources and explicit live credentials-independent config", () => {
    expect(() => regradeConfig({})).toThrow();
    const env = { EVAL_SOURCE_DIRS: '["eval/artifacts/source"]' };
    expect(regradeConfig(env)).toMatchObject({ mode: "smoke", maxRepairs: 2, live: null });
    expect(() => regradeConfig({ ...env, EVAL_MODE: "live" })).toThrow("ALLOW_API");
    expect(() => regradeConfig({ ...env, EVAL_MODE: "live", EVAL_ALLOW_API: "1" })).toThrow();
    expect(() => regradeConfig({ ...env, EVAL_JUDGE_REPAIRS: "3" })).toThrow();
    const judge = JSON.stringify({
      provider: "anthropic",
      model: "judge",
      rates: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    });
    expect(
      regradeConfig({
        ...env,
        EVAL_MODE: "live",
        EVAL_ALLOW_API: "1",
        EVAL_JUDGE_MODEL: judge,
        EVAL_MAX_USD: "1",
      }),
    ).toMatchObject({ live: { maxUsd: 1, judge: { model: "judge" } } });
  });

  it("requires resolved source paths strictly within the artifact root", () => {
    expect(insideArtifacts("/repo/eval/artifacts", "/repo/eval/artifacts/run")).toBe(true);
    expect(insideArtifacts("/repo/eval/artifacts", "/repo/eval/artifacts")).toBe(false);
    expect(insideArtifacts("/repo/eval/artifacts", "/repo/eval/artifacts-other/run")).toBe(false);
    expect(insideArtifacts("/repo/eval/artifacts", "/repo/private")).toBe(false);
  });

  it("rejects changed annotations, answers, deliveries, identity and incomplete follow-ups", async () => {
    const item = loadEvaluationData().answers.items[0]!;
    const run = await runAgentCase({
      item,
      corpus: loadFixtureCorpus(),
      provider: new ScriptedProvider([[text("No.")]]),
      trial: 1,
      mode: "scripted",
    });
    const expected = {
      corpusId: "frozen",
      corpusHash: "a".repeat(64),
      sourceAuditSha256: "b".repeat(64),
      answersSha256: "c".repeat(64),
    };
    const source = { ...expected, implementation: { "src/agent/loop.ts": "d".repeat(64) } };
    const input = judgeInput(item, run);
    expect(validateRegradeSource(item, run, source, expected, input)).toEqual([]);
    expect(
      validateRegradeSource(
        item,
        run,
        { ...source, answersSha256: "e".repeat(64) },
        expected,
        input,
      ),
    ).toContain("Source binding changed: answersSha256");
    const changed = structuredClone(run);
    changed.turns[0]!.result.answer = "Tampered.";
    expect(validateRegradeSource(item, changed, source, expected, input)).toContain(
      "Source answer or deliveries differ from the recorded judge input",
    );
    expect(validateRegradeSource(item, { ...run, trial: 0 }, source, expected, input)).toContain(
      "Source run identity is invalid",
    );
    expect(
      validateRegradeSource(item, { ...run, mode: "replay" }, source, expected, input),
    ).toContain("Source must be an original live or smoke run");
    expect(
      validateRegradeSource({ ...item, question: "Follow-up" }, run, source, expected, input),
    ).toContain("Target question was not reached");
    const changedDelivery = structuredClone(run);
    changedDelivery.turns[0]!.calls.push({
      id: "tampered",
      name: "list",
      input: {},
      request: 1,
      startedMs: 0,
      durationMs: 0,
      exposures: [],
      outcome: {
        content: "unseen text",
        isError: false,
        summary: "",
        evidenceIds: [],
        newEvidence: 0,
      },
    });
    expect(validateRegradeSource(item, changedDelivery, source, expected, input)).toContain(
      "Source answer or deliveries differ from the recorded judge input",
    );
  });

  it("recovers legacy zero-id/error outputs only when the agent recording proves their delivery", async () => {
    const item = loadEvaluationData().answers.items[0]!;
    const provider = new RecordedProvider(
      new ScriptedProvider([
        [call("match", { pattern: "not-present" }), call("read", { target: "missing-note" })],
        [text("No matching evidence.")],
      ]),
    );
    const run = await runAgentCase({
      item,
      corpus: loadFixtureCorpus(),
      provider,
      trial: 1,
      mode: "scripted",
    });
    const expected = {
      corpusId: "frozen",
      corpusHash: "a".repeat(64),
      sourceAuditSha256: "b".repeat(64),
      answersSha256: "c".repeat(64),
    };
    const source = { ...expected, implementation: {} };
    const input = JSON.parse(judgeInput(item, run)) as { actualDeliveriesOnly: unknown[] };
    input.actualDeliveriesOnly = [];
    const legacy = JSON.stringify(input);
    expect(validateRegradeSource(item, run, source, expected, legacy)).toContain(
      "Source answer or deliveries differ from the recorded judge input",
    );
    expect(validateRegradeSource(item, run, source, expected, legacy, provider.exchanges)).toEqual(
      [],
    );
    const changed = structuredClone(run);
    changed.turns[0]!.calls[0]!.outcome!.content = "Invented zero matches.";
    expect(
      validateRegradeSource(item, changed, source, expected, legacy, provider.exchanges),
    ).toContain("Source answer or deliveries differ from the recorded judge input");
  });
});
