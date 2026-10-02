import { describe, expect, it } from "vitest";
import { userText } from "../src/agent/messages";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { BudgetProvider, requestReserve } from "./budget-provider";
import {
  percentile,
  pilotPass,
  sumUsage,
  summarizeAgentRuns,
  type GradedRun,
} from "./agent-report";

describe("cost and repeated-trial reporting", () => {
  it("computes usage totals and interpolated percentiles without mutating inputs", () => {
    const values = [30, 10, 20];
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(29);
    expect(values).toEqual([30, 10, 20]);
    expect(percentile([], 0.5)).toBeNull();
    expect(() => percentile(values, 2)).toThrow();
    expect(
      sumUsage([
        { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
        { inputTokens: 4, outputTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 1 },
      ]),
    ).toEqual({ inputTokens: 5, outputTokens: 5, cacheReadTokens: 5, cacheWriteTokens: 5 });
  });
  it("reports empty and failed runs without hiding them from denominators", () => {
    expect(summarizeAgentRuns([], null, null)).toMatchObject({
      trials: 0,
      pilotPassRate: null,
      estimatedAgentUsd: null,
    });
    const failed: GradedRun = {
      run: {
        schema: 1,
        itemId: "t",
        trial: 1,
        provider: "s",
        model: "s",
        mode: "scripted",
        budget: { maxRequests: 2, maxToolCalls: 2, maxToolChars: 200 },
        startedAt: "now",
        elapsedMs: 1,
        turns: [],
        evidence: [],
        transcript: [],
      },
      targetQuestion: "q",
      answerability: "answerable",
      judgment: null,
      judgeUsage: null,
      judgeElapsedMs: null,
      gradingError: "setup failed",
    };
    expect(pilotPass(failed)).toBe(false);
    expect(summarizeAgentRuns([failed], null, null)).toMatchObject({
      trials: 1,
      gradedTrials: 0,
      targetReached: 0,
      pilotPassRate: 0,
      anyTrialPassRate: 0,
      allTrialsPassRate: 0,
      gradingErrors: 1,
    });
    const passed = structuredClone(failed);
    passed.gradingError = null;
    passed.run.trial = 2;
    passed.run.turns.push({
      question: "q",
      elapsedMs: 1,
      timeToFirstTextMs: 1,
      calls: [],
      result: {
        messages: [],
        answer: "Fact [E1].",
        stop: "answered",
        citations: { valid: ["E1"], unknown: [] },
        usage: {
          requests: 1,
          toolCalls: 0,
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        error: null,
      },
    });
    passed.judgment = {
      schema: 1,
      keyPoints: [{ id: "k", status: "covered", answerQuote: "Fact", reason: "Matches" }],
      forbidden: [],
      claims: [
        {
          id: "c",
          answerQuote: "Fact [E1].",
          kind: "note",
          verdict: "supported",
          citations: [{ id: "E1", verdict: "supporting", reason: "Entails" }],
          support: [],
          reason: "Unit scoring fixture",
        },
      ],
      abstention: { status: "not-needed", reason: "Answerable" },
    };
    expect(pilotPass(passed)).toBe(true);
    expect(summarizeAgentRuns([failed, passed], null, null)).toMatchObject({
      pilotPassRate: 0.5,
      firstTrialPassRate: 0,
      anyTrialPassRate: 1,
      allTrialsPassRate: 0,
    });
    passed.judgment.claims[0]!.kind = "general";
    expect(pilotPass(passed)).toBe(false);
  });
  it("reserves spend before sending and retains unknown charges on failures", async () => {
    const rates = { input: 1, output: 1, cacheRead: 0.1, cacheWrite: 2 };
    const request = { system: "s", messages: [userText("q")], tools: [], allowTools: false };
    const handlers = { onText: () => {}, onThinking: () => {} };
    expect(requestReserve(request, rates)).toBeGreaterThan(0.032);
    const allowance = { limitUsd: 1, accountedUsd: 0, calls: 0, maxCalls: 1 };
    const inner = new ScriptedProvider([[text("ok")]]);
    const provider = new BudgetProvider(inner, rates, allowance);
    await provider.send(request, handlers);
    expect(allowance.accountedUsd).toBeCloseTo(0.000038);
    await expect(provider.send(request, handlers)).rejects.toThrow("exhausted");
    expect(inner.requests).toHaveLength(1);
    expect(provider.describeError(new Error("x"))).toBe("x");
    const failedAllowance = { ...allowance, calls: 0, accountedUsd: 0 };
    const failure = new BudgetProvider(
      new ScriptedProvider([new Error("failed")]),
      rates,
      failedAllowance,
    );
    await expect(failure.send(request, handlers)).rejects.toThrow("failed");
    expect(failedAllowance.accountedUsd).toBe(requestReserve(request, rates));
    expect(() => new BudgetProvider(inner, rates, { ...allowance, limitUsd: -1 })).toThrow();
    const insufficient = new BudgetProvider(inner, rates, {
      ...allowance,
      calls: 0,
      accountedUsd: 0,
      limitUsd: 0.001,
    });
    await expect(insufficient.send(request, handlers)).rejects.toThrow("exhausted");
  });
});
