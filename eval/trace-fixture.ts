import { ScriptedProvider, type Step } from "../src/testing/scripted-provider";
import type { Corpus } from "../src/retrieval/corpus";
import type { GradedRun } from "./agent-report";
import { runAgentCase, type AnswerItem } from "./agent-runner";
import type { Judgment } from "./answer-scoring";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { RecordedProvider, type ModelExchange } from "./model-recording";

/** Test support for trace diagnosis: scripted runs through the production loop on the fixture vault. */

const items = loadEvaluationData("expanded").answers.items;
/** a01: two key points; `storage` supports both, `precision` only the first. */
export const ITEM = items.find((item) => item.id === "a01")!;
export const STORAGE = ITEM.evidence.storage!.path;
export const PRECISION = ITEM.evidence.precision!.path;
/** A development task with one history question before the target. */
export const FOLLOW_UP = items.find((item) => item.split === "dev" && item.history.length === 1)!;

let corpus: Corpus | undefined;

export async function scriptedRecord(
  steps: (Step | Error)[],
  judgment: Judgment | null = null,
  item: AnswerItem = ITEM,
): Promise<{ record: GradedRun; exchanges: ModelExchange[] }> {
  corpus ??= loadFixtureCorpus();
  const provider = new RecordedProvider(new ScriptedProvider(steps));
  const run = await runAgentCase({ item, corpus, provider, trial: 1, mode: "live" });
  return {
    record: {
      run,
      targetQuestion: item.question,
      answerability: item.answerability,
      judgment,
      judgeUsage: null,
      judgeElapsedMs: null,
      gradingError: judgment ? null : "not graded",
    },
    exchanges: provider.exchanges,
  };
}

type Claim = Judgment["claims"][number];

/**
 * A judgment whose claims are the given answer units (ids `u0`, `u1`, ...). Key points are
 * covered unless listed as missing; forbidden conditions are absent unless listed.
 */
export function judgmentFor(
  units: {
    quote: string;
    kind?: Claim["kind"];
    verdict?: Claim["verdict"];
    cite?: Record<string, Claim["citations"][number]["verdict"]>;
  }[],
  options: {
    missing?: string[];
    forbidden?: number[];
    abstention?: Judgment["abstention"]["status"];
  } = {},
  item: AnswerItem = ITEM,
): Judgment {
  return {
    schema: 1,
    keyPoints: item.keyPoints.map((point) => {
      const missing = options.missing?.includes(point.id);
      return {
        id: point.id,
        status: missing ? "missing" : "covered",
        answerQuote: missing ? "" : units[0]!.quote,
        reason: "r",
      };
    }),
    forbidden: item.forbidden.map((_, index) => {
      const present = options.forbidden?.includes(index) ?? false;
      return { index, present, answerQuote: present ? units[0]!.quote : "", reason: "r" };
    }),
    claims: units.map((unit, index) => ({
      id: `u${index}`,
      answerQuote: unit.quote,
      kind: unit.kind ?? "note",
      verdict: unit.verdict ?? "supported",
      citations: Object.entries(unit.cite ?? {}).map(([id, verdict]) => ({
        id,
        verdict,
        reason: "r",
      })),
      support: [],
      reason: `reason ${index}`,
    })),
    abstention: { status: options.abstention ?? "not-needed", reason: "r" },
  };
}
