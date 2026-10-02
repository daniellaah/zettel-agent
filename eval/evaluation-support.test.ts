import { describe, expect, it } from "vitest";
import { userText } from "../src/agent/messages";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { RecordedProvider, StrictReplayProvider } from "./model-recording";
import {
  calibrationReport,
  humanReviewSchema,
  judgmentLabels,
  type HumanReview,
} from "./calibration";
import type { Judgment } from "./answer-scoring";

describe("strict model replay", () => {
  it("records requests without headers and reproduces output only on identical inputs", async () => {
    const recorder = new RecordedProvider(new ScriptedProvider([[text("answer")]]));
    const request = { system: "s", messages: [userText("q")], tools: [], allowTools: false };
    const handlers = { onText: () => {}, onThinking: () => {} };
    const response = await recorder.send(request, handlers);
    const replay = new StrictReplayProvider(recorder.provider, recorder.model, recorder.exchanges);
    expect(replay.remaining).toBe(1);
    expect(await replay.send(request, handlers)).toEqual(response);
    expect(replay.remaining).toBe(0);
    await expect(replay.send(request, handlers)).rejects.toThrow("exhausted");
    const strict = new StrictReplayProvider("scripted", "scripted", recorder.exchanges);
    await expect(strict.send({ ...request, system: "changed" }, handlers)).rejects.toThrow(
      "changed",
    );
    expect(strict.remaining).toBe(1);
    expect(recorder.describeError(new Error("x"))).toBe("x");
    expect(strict.describeError(null)).toBe("Replay failed");
    const signal = AbortSignal.abort();
    await expect(strict.send(request, handlers, signal)).rejects.toThrow("aborted");
  });
});

describe("human judge calibration", () => {
  const binding = { runSha256: "a".repeat(64), judgmentSha256: "b".repeat(64) };
  const labels = { "claim:c1": "supported", "claim:c2": "unsupported" };
  const human: HumanReview = {
    schema: 1,
    ...binding,
    reviewer: "owner",
    status: "reviewed",
    labels: { "claim:c1": "unsupported", "claim:c2": "unsupported" },
    comments: "Title is not support.",
    omittedClaims: [],
  };
  it("computes agreement, kappa and false support without invented human labels", () => {
    expect(
      calibrationReport(labels, human, binding).find((row) => row.group === "claim"),
    ).toMatchObject({ labels: 2, agreement: 0.5, kappa: 0, falseSupport: 1 });
    expect(
      calibrationReport(
        { "claim:c1": "supported" },
        { ...human, labels: { "claim:c1": "supported" } },
        binding,
      )[0]!.kappa,
    ).toBeNull();
    expect(calibrationReport({}, { ...human, labels: {} }, binding)[0]!.agreement).toBeNull();
  });
  it("rejects pending, incomplete, stale and malformed human reviews", () => {
    expect(() => calibrationReport(labels, { ...human, status: "pending" }, binding)).toThrow(
      "pending",
    );
    expect(() =>
      calibrationReport(labels, { ...human, runSha256: "c".repeat(64) }, binding),
    ).toThrow("different");
    expect(() =>
      calibrationReport(labels, { ...human, labels: { "claim:c1": null } }, binding),
    ).toThrow("incomplete");
    expect(() => humanReviewSchema.parse({ ...human, status: "auto-reviewed" })).toThrow();
    expect(() =>
      calibrationReport(
        labels,
        { ...human, labels: { "claim:c1": "covered", "claim:c2": "unsupported" } },
        binding,
      ),
    ).toThrow("label category");
  });
  it("assigns stable keys to every dimension", () => {
    const judgment: Judgment = {
      schema: 1,
      keyPoints: [{ id: "k", status: "covered", answerQuote: "x", reason: "x" }],
      forbidden: [{ index: 0, present: false, answerQuote: "", reason: "x" }],
      claims: [
        {
          id: "c",
          kind: "note",
          verdict: "partial",
          answerQuote: "x",
          reason: "x",
          support: [],
          citations: [{ id: "E1", verdict: "irrelevant", reason: "x" }],
        },
      ],
      abstention: { status: "not-needed", reason: "x" },
    };
    expect(judgmentLabels(judgment)).toEqual({
      "keyPoint:k": "covered",
      "forbidden:0": "absent",
      "claim:c": "partial",
      "citation:c:E1": "irrelevant",
      abstention: "not-needed",
    });
  });
});
