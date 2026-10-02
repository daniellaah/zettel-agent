import { describe, expect, it } from "vitest";
import { Corpus } from "../src/retrieval/corpus";
import { ScriptedProvider, call, text } from "../src/testing/scripted-provider";
import { runAgentCase, type AnswerItem } from "./agent-runner";
import { RecordedProvider, StrictReplayProvider } from "./model-recording";
import {
  JUDGE_SYSTEM,
  JudgeOutputError,
  judgeAnswer,
  judgeInput,
  judgmentSchema,
  scoreAnswer,
  tokenCost,
  validateJudgment,
  unassessedCitationOccurrences,
  evidenceQuoteMatches,
  type Judgment,
} from "./answer-scoring";

const file = "02-Zettelkasten/Permanent/Memory.md";
const item: AnswerItem = {
  id: "t",
  family: "m",
  split: "dev",
  origin: "synthetic",
  lang: "en",
  question: "What is saved?",
  kind: "lookup",
  answerability: "answerable",
  history: [],
  activeNote: null,
  evidence: {
    ref: { path: file, basis: "permanent-inference", excerpt: "Training saves states." },
  },
  keyPoints: [{ id: "states", text: "Training saves states.", supportSets: [["ref"]] }],
  forbidden: ["Invents measurements."],
  graphChecks: [],
  notes: "test",
};

async function setup(read = true) {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert(file, "# Memory\n\nTraining saves states.\n\nUNSEEN SENTENCE.");
  const provider = new ScriptedProvider([
    [call(read ? "read" : "list", read ? { target: file } : {})],
    [text("Training saves states [E1].")],
  ]);
  const run = await runAgentCase({ item, corpus, provider, trial: 1, mode: "scripted" });
  const judgment: Judgment = {
    schema: 1,
    keyPoints: [
      { id: "states", status: "covered", answerQuote: "Training saves states", reason: "Matches" },
    ],
    forbidden: [{ index: 0, present: false, answerQuote: "", reason: "No measurements" }],
    claims: [
      {
        id: "c1",
        answerQuote: "Training saves states [E1].",
        kind: "note",
        verdict: "supported",
        citations: [{ id: "E1", verdict: "supporting", reason: "Direct text" }],
        support: [
          { callId: run.turns[0]!.calls[0]!.id, evidenceId: "E1", quote: "Training saves states." },
        ],
        reason: "Entailed",
      },
    ],
    abstention: { status: "not-needed", reason: "Answerable" },
  };
  return { run, judgment };
}

describe("answer and semantic citation scoring", () => {
  it("checks each citation occurrence, including reused ids and preceding attribution", () => {
    const answer = "Wrong source [E1/E2]. Correct text [E2]. The bridge is [E1]'s claim.";
    expect(unassessedCitationOccurrences(answer, ["Correct text [E2]."])).toHaveLength(2);
    expect(
      unassessedCitationOccurrences(answer, [
        "Wrong source [E1/E2].",
        "Correct text [E2].",
        "The bridge is [E1]'s claim.",
      ]),
    ).toEqual([]);
    expect(unassessedCitationOccurrences("Fact [E1]. Fact [E1].", ["Fact [E1]."])).toEqual([]);
    expect(unassessedCitationOccurrences("No citations", ["", "not in answer"])).toEqual([]);
  });
  it("binds supporting text to its note and section in multi-note deliveries", async () => {
    const { run } = await setup();
    const delivery = run.turns[0]!.calls[0]!;
    const exposure = delivery.exposures[0]!;
    const content =
      '<note path="p.md">Metadata: source\n[E1]\nFirst fact.\n[E2]\nSecond fact.</note>\n<note path="q.md">[E3]\nOther note.</note>';
    const data = {
      content,
      isError: false,
      exposures: [
        { ...exposure, id: "E1", path: "p.md" },
        { ...exposure, id: "E2", path: "p.md" },
        { ...exposure, id: "E3", path: "q.md" },
      ],
    };
    expect(evidenceQuoteMatches(data, "E1", "First fact.")).toBe(true);
    expect(evidenceQuoteMatches(data, "E1", "Second fact.")).toBe(false);
    expect(evidenceQuoteMatches(data, "E1", "Other note.")).toBe(false);
    expect(evidenceQuoteMatches(data, "E1", "Metadata: source")).toBe(true);
    expect(evidenceQuoteMatches(data, "E9", "First fact.")).toBe(false);
    expect(evidenceQuoteMatches({ ...data, isError: true }, "E1", "First fact.")).toBe(false);
    expect(evidenceQuoteMatches(data, "E1", "")).toBe(false);
    expect(
      evidenceQuoteMatches(
        { ...data, exposures: [{ ...exposure, path: "p.md", scope: "search-excerpt" }] },
        "E1",
        "Other note.",
      ),
    ).toBe(false);
    const lines = {
      content: "[E1] p.md:1\n  First fact.\n[E2] q.md:1\n  Other note.",
      isError: false,
      exposures: [{ ...exposure, scope: "match-lines" as const }],
    };
    expect(evidenceQuoteMatches(lines, "E1", "First fact.")).toBe(true);
    expect(evidenceQuoteMatches(lines, "E1", "Other note.")).toBe(false);
    expect(
      evidenceQuoteMatches(
        { ...lines, exposures: [{ ...exposure, scope: "graph" }] },
        "E1",
        "First fact.",
      ),
    ).toBe(true);
  });
  it("accepts checked judgments and computes separate coverage and citation metrics", async () => {
    const { run, judgment } = await setup();
    expect(validateJudgment(judgment, item, run)).toEqual([]);
    expect(scoreAnswer(judgment)).toMatchObject({
      keyPointCoverage: 1,
      forbiddenViolations: 0,
      claimSupportRate: 1,
      citationPrecision: 1,
      citationCoverage: 1,
    });
    judgment.keyPoints[0]!.status = "partial";
    judgment.claims[0]!.verdict = "partial";
    judgment.claims[0]!.citations[0]!.verdict = "irrelevant";
    expect(scoreAnswer(judgment)).toMatchObject({
      keyPointCoverage: 0.5,
      claimSupportRate: 0,
      citationPrecision: 0,
    });
  });

  it("does not promote gold or unseen text into delivered evidence", async () => {
    const { run, judgment } = await setup(false);
    const input = JSON.parse(judgeInput(item, run)) as { actualDeliveriesOnly: unknown };
    expect(JSON.stringify(input.actualDeliveriesOnly)).not.toContain("UNSEEN SENTENCE");
    expect(validateJudgment(judgment, item, run)).toContain("c1: evidence quote was not delivered");
    expect(JUDGE_SYSTEM).toContain("Gold reference excerpts and unseen corpus text NEVER");
  });

  it("rejects fabricated quotes, ids, duplicate labels and cross-claim citation laundering", async () => {
    const { run, judgment } = await setup();
    const bad = structuredClone(judgment);
    bad.keyPoints.push(bad.keyPoints[0]!);
    bad.forbidden = [];
    bad.claims[0]!.answerQuote = "Fabricated answer [E2]";
    bad.claims[0]!.support[0]!.evidenceId = "E2";
    bad.claims[0]!.support[0]!.quote = "Not delivered";
    bad.claims[0]!.citations[0]!.verdict = "unknown";
    const issues = validateJudgment(bad, item, run);
    expect(issues).toContain("Key point ids are missing, duplicated or unknown");
    expect(issues).toContain("Forbidden condition indices are incomplete");
    expect(issues).toContain("c1: citation ids do not match answer quote");
    expect(issues).toContain("c1: evidence was not cited for this claim");
    expect(
      issues.some(
        (issue) => issue.includes("support[0] for E2") && issue.includes("Not delivered"),
      ),
    ).toBe(true);
    expect(issues).toContain("c1: incorrect citation validity E1");
  });

  it("requires every citation to be assessed and does not reward unsupported uncited claims", async () => {
    const { run, judgment } = await setup();
    judgment.claims = [];
    expect(validateJudgment(judgment, item, run)).toContain("Unassessed citation E1");
    expect(validateJudgment(judgment, item, run)).toContain(
      "Covered answer has no assessed claims",
    );
    judgment.keyPoints[0] = { id: "states", status: "missing", answerQuote: "", reason: "Absent" };
    expect(scoreAnswer(judgment)).toMatchObject({
      keyPointCoverage: 0,
      citationPrecision: null,
      claimSupportRate: null,
    });
    const original = (await setup()).judgment;
    original.claims[0]!.citations = [];
    original.claims[0]!.support = [];
    expect(validateJudgment(original, item, run)).toContain(
      "c1: supported note claim lacks cited evidence",
    );
  });

  it("executes a tool-free judge, rejects invalid output, and propagates usage", async () => {
    const { run, judgment } = await setup();
    const provider = new ScriptedProvider([[text(JSON.stringify(judgment))]]);
    const result = await judgeAnswer(item, run, provider);
    expect(result.judgment).toEqual(judgment);
    expect(provider.requests[0]).toMatchObject({ allowTools: false, tools: [] });
    expect(result.usage.outputTokens).toBe(10);
    await expect(
      judgeAnswer(item, run, new ScriptedProvider([[text("```json {} ```")]])),
    ).rejects.toThrow();
    await expect(
      judgeAnswer(item, run, new ScriptedProvider([{ parts: [text("{}")], finish: "max_tokens" }])),
    ).rejects.toThrow("did not finish");
    expect(() => judgmentSchema.parse({ ...judgment, extra: true })).toThrow();
  });

  it("rejects a run that failed before the final follow-up question", async () => {
    const { run, judgment } = await setup();
    const followup = { ...item, question: "Follow up" };
    expect(() => judgeInput(followup, run)).toThrow("not reached");
    expect(validateJudgment(judgment, followup, run)).toEqual(["Target question was not reached"]);
  });

  it("repairs invalid output once without changing the original evidence and includes all usage", async () => {
    const { run, judgment } = await setup();
    const invalid = structuredClone(judgment);
    invalid.claims[0]!.answerQuote = "Training saves states";
    const provider = new ScriptedProvider([
      [text(JSON.stringify(invalid))],
      [text(JSON.stringify(judgment))],
    ]);
    const result = await judgeAnswer(item, run, provider);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.issues).toContain("c1: citation ids do not match answer quote");
    expect(result.usage.outputTokens).toBe(20);
    expect(provider.requests[1]!.messages[0]).toEqual(provider.requests[0]!.messages[0]);
    expect(provider.requests[1]!.messages).toHaveLength(3);
    expect(JSON.stringify(provider.requests[1])).toContain("Preserve every factual claim");
    expect(provider.requests.every((request) => !request.allowTools && !request.tools.length)).toBe(
      true,
    );
  });

  it("bounds repairs, retains failed attempts, and never repairs refusal or truncation", async () => {
    const { run, judgment } = await setup();
    const provider = new ScriptedProvider([
      [text("{}")],
      [text("{}")],
      [text(JSON.stringify(judgment))],
    ]);
    const error = await judgeAnswer(item, run, provider).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(JudgeOutputError);
    expect((error as JudgeOutputError).attempts).toHaveLength(2);
    expect(provider.requests).toHaveLength(2);
    const refusal = new ScriptedProvider([{ parts: [text("No")], finish: "refusal" }]);
    await expect(judgeAnswer(item, run, refusal)).rejects.toThrow("did not finish");
    expect(refusal.requests).toHaveLength(1);
    const strict = new ScriptedProvider([[text("{}")]]);
    await expect(judgeAnswer(item, run, strict, undefined, { maxRepairs: 0 })).rejects.toThrow();
    expect(strict.requests).toHaveLength(1);
    await expect(judgeAnswer(item, run, strict, undefined, { maxRepairs: 3 })).rejects.toThrow(
      "maxRepairs",
    );
  });

  it("does not dispatch a repair after cancellation", async () => {
    const { run } = await setup();
    const controller = new AbortController();
    const scripted = new ScriptedProvider([[text("{}")]]);
    const provider = {
      provider: scripted.provider,
      model: scripted.model,
      describeError: scripted.describeError.bind(scripted),
      send: async (...args: Parameters<typeof scripted.send>) => {
        const response = await scripted.send(...args);
        controller.abort();
        return response;
      },
    };
    await expect(judgeAnswer(item, run, provider, controller.signal)).rejects.toThrow();
    expect(scripted.requests).toHaveLength(1);
  });

  it("replays the complete judge repair conversation and rejects changed original input", async () => {
    const { run, judgment } = await setup();
    const recorded = new RecordedProvider(
      new ScriptedProvider([[text("{}")], [text(JSON.stringify(judgment))]]),
    );
    const original = await judgeAnswer(item, run, recorded);
    const replay = new StrictReplayProvider(recorded.provider, recorded.model, recorded.exchanges);
    const replayed = await judgeAnswer(item, run, replay);
    expect(replayed.judgment).toEqual(original.judgment);
    expect(replayed.attempts).toEqual(original.attempts);
    expect(replay.remaining).toBe(0);
    const changed = structuredClone(run);
    changed.turns[0]!.result.answer += " Different answer.";
    await expect(
      judgeAnswer(
        item,
        changed,
        new StrictReplayProvider(recorded.provider, recorded.model, recorded.exchanges),
      ),
    ).rejects.toThrow("changed");
  });

  it("prices all token classes only with explicit valid rates", () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 2000,
      cacheWriteTokens: 500,
    };
    expect(tokenCost(usage, null)).toBeNull();
    expect(tokenCost(usage, { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.5 })).toBeCloseTo(
      0.00215,
    );
    expect(() => tokenCost(usage, { input: -1, output: 2, cacheRead: 0, cacheWrite: 0 })).toThrow();
  });
});
