import { ScriptedProvider, call, text, type Step } from "../src/testing/scripted-provider";
import type { AnswerItem } from "./agent-runner";
import type { Judgment } from "./answer-scoring";

/** Exercise search/read/history; never supply rubric evidence to the scripted agent. */
export function smokeAgent(item: AnswerItem): ScriptedProvider {
  const steps: Step[] = [...item.history, item.question].flatMap((question) => [
    [call("search", { query: question })],
    [call("read", { target: "E1" })],
    [text("Smoke run completed. No model quality is measured.")],
  ]);
  return new ScriptedProvider(steps);
}

/** A deliberately non-answer, for exercising the score schema without inventing quality. */
export function smokeJudgment(item: AnswerItem): Judgment {
  return {
    schema: 1,
    keyPoints: item.keyPoints.map((point) => ({
      id: point.id,
      status: "missing",
      answerQuote: "",
      reason: "Scripted mechanics only",
    })),
    forbidden: item.forbidden.map((_, index) => ({
      index,
      present: false,
      answerQuote: "",
      reason: "Scripted mechanics only",
    })),
    claims: [],
    abstention: {
      status: item.answerability === "answerable" ? "not-needed" : "inappropriate",
      reason: "Scripted mechanics only",
    },
  };
}
