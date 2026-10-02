import { z } from "zod";
import { citedIds } from "../src/agent/evidence";
import { userText, textOf, type ChatMessage } from "../src/agent/messages";
import type { ModelProvider } from "../src/agent/provider";
import { deliveredEvidence, type AgentRun, type AnswerItem } from "./agent-runner";
import {
  JUDGE_SYSTEM,
  JudgeOutputError,
  evidenceQuoteMatches,
  validateJudgment,
  type Judgment,
  type JudgeAttempt,
} from "./answer-scoring";

const reason = z.string().min(1);
const index = z.number().int().nonnegative();
export const indexedJudgmentSchema = z
  .object({
    schema: z.literal(1),
    keyPoints: z.array(
      z
        .object({
          id: reason,
          status: z.enum(["covered", "partial", "missing", "contradicted"]),
          units: z.array(index),
          reason,
        })
        .strict(),
    ),
    forbidden: z.array(
      z.object({ index, present: z.boolean(), units: z.array(index), reason }).strict(),
    ),
    units: z.array(
      z
        .object({
          index,
          kind: z.enum(["note", "general", "absence", "nonfactual"]),
          verdict: z.enum(["supported", "partial", "unsupported", "contradicted"]),
          citations: z.array(
            z
              .object({
                id: reason,
                verdict: z.enum(["supporting", "irrelevant", "unknown"]),
                reason,
              })
              .strict(),
          ),
          support: z.array(index),
          reason,
        })
        .strict(),
    ),
    abstention: z
      .object({ status: z.enum(["appropriate", "inappropriate", "not-needed"]), reason })
      .strict(),
  })
  .strict();
export type IndexedJudgment = z.infer<typeof indexedJudgmentSchema>;

/** Contiguous original paragraphs/bullet blocks; conjunctive grading must cover every factual clause. */
export function answerUnits(
  answer: string,
): { index: number; quote: string; citations: string[] }[] {
  return [...answer.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)].map((match, index) => ({
    index,
    quote: match[0],
    citations: citedIds(match[0]),
  }));
}
export function indexedInput(item: AnswerItem, run: AgentRun) {
  const final = run.turns.at(-1);
  if (!final || final.question !== item.question)
    throw new Error("Target question was not reached");
  const units = answerUnits(final.result.answer);
  const quotes: {
    index: number;
    callId: string;
    evidenceId: string;
    quote: string;
    scope: string;
  }[] = [];
  const seen = new Set<string>();
  for (const delivery of deliveredEvidence(run))
    for (const exposure of delivery.exposures) {
      for (const part of answerUnits(delivery.content)) {
        if (
          /^(?:\[E\d+\]\n)?#{1,6} /.test(part.quote) ||
          !evidenceQuoteMatches(delivery, exposure.id, part.quote)
        )
          continue;
        const key = `${exposure.id}\u0000${exposure.scope}\u0000${part.quote}`;
        if (seen.has(key)) continue;
        seen.add(key);
        quotes.push({
          index: quotes.length,
          callId: delivery.callId,
          evidenceId: exposure.id,
          quote: part.quote,
          scope: exposure.scope,
        });
      }
    }
  // Append missing interior paragraphs, preserving every legacy quote index.
  // A final search excerpt may touch </note>, and metadata may touch the opening tag.
  for (const delivery of deliveredEvidence(run)) {
    const interiors = [
      ...delivery.content.matchAll(/<note path="[^"]+"[^>]*>([\s\S]*?)<\/note>/g),
    ].map((block) => block[1]!);
    for (const exposure of delivery.exposures)
      for (const interior of interiors) {
        for (const part of answerUnits(interior)) {
          if (
            part.quote
              .split("\n")
              .every((line) => !line.trim() || /^\s*(?:§ |#{1,6} |\[E\d+\])/.test(line)) ||
            !evidenceQuoteMatches(delivery, exposure.id, part.quote)
          )
            continue;
          const key = `${exposure.id}\u0000${exposure.scope}\u0000${part.quote}`;
          if (seen.has(key)) continue;
          seen.add(key);
          quotes.push({
            index: quotes.length,
            callId: delivery.callId,
            evidenceId: exposure.id,
            quote: part.quote,
            scope: exposure.scope,
          });
        }
      }
  }
  return {
    units,
    quotes,
    request: {
      outputSchema: z.toJSONSchema(indexedJudgmentSchema),
      question: item.question,
      previousQuestions: item.history,
      answerability: item.answerability,
      stop: final.result.stop,
      answerUnits: units,
      selectableDeliveredQuotes: quotes,
      correctnessReferenceOnly: {
        keyPoints: item.keyPoints,
        forbidden: item.forbidden,
        evidence: item.evidence,
        graphChecks: item.graphChecks,
      },
      actualDeliveriesOnly: deliveredEvidence(run),
    },
  };
}

/** A recorded quote pool can differ after an extractor fix, but cannot change delivery or gold. */
export function replayIndexedInput(item: AnswerItem, run: AgentRun, request: unknown) {
  const current = indexedInput(item, run);
  const parsed = z
    .object({
      selectableDeliveredQuotes: z.array(
        z
          .object({
            index,
            callId: reason,
            evidenceId: reason,
            quote: reason,
            scope: reason,
          })
          .strict(),
      ),
    })
    .passthrough()
    .parse(request);
  const { selectableDeliveredQuotes: quotes, ...rest } = parsed;
  const expected = Object.fromEntries(
    Object.entries(current.request).filter(([key]) => key !== "selectableDeliveredQuotes"),
  );
  if (JSON.stringify(rest) !== JSON.stringify(expected))
    throw new Error("Recorded indexed request changed answer, reference or deliveries");
  const deliveries = deliveredEvidence(run);
  const seen = new Set<string>();
  for (const [i, quote] of quotes.entries()) {
    const delivery = deliveries.find((d) => d.callId === quote.callId);
    const key = JSON.stringify([quote.callId, quote.evidenceId, quote.scope, quote.quote]);
    if (
      quote.index !== i ||
      seen.has(key) ||
      !delivery ||
      !delivery.exposures.some((e) => e.id === quote.evidenceId && e.scope === quote.scope) ||
      !evidenceQuoteMatches(delivery, quote.evidenceId, quote.quote)
    )
      throw new Error("Recorded quote pool contains unbound evidence");
    seen.add(key);
  }
  return {
    units: current.units,
    quotes,
    request: { ...current.request, selectableDeliveredQuotes: quotes },
  };
}

/** Selector-to-text materialization never changes model verdicts or invents support. */
export function materializeJudgment(
  selection: IndexedJudgment,
  input: ReturnType<typeof indexedInput>,
): Judgment {
  const ids = selection.units.map((u) => u.index).sort((a, b) => a - b);
  if (JSON.stringify(ids) !== JSON.stringify(input.units.map((u) => u.index)))
    throw new Error("Every answer unit must be assessed exactly once");
  const quoteFor = (indices: number[], needed: boolean) => {
    if (needed !== indices.length > 0)
      throw new Error("Invalid answer unit selection for point/forbidden status");
    if (indices.some((id) => !input.units[id])) throw new Error("Unknown answer unit selection");
    return indices.length ? input.units[indices[0]!]!.quote : "";
  };
  return {
    schema: 1,
    keyPoints: selection.keyPoints.map((p) => ({
      id: p.id,
      status: p.status,
      answerQuote: quoteFor(p.units, p.status !== "missing"),
      reason: p.reason,
    })),
    forbidden: selection.forbidden.map((p) => ({
      index: p.index,
      present: p.present,
      answerQuote: quoteFor(p.units, p.present),
      reason: p.reason,
    })),
    claims: selection.units.flatMap((unit) => {
      const source = input.units[unit.index]!;
      if (unit.kind === "nonfactual") {
        if (source.citations.length || unit.citations.length || unit.support.length)
          throw new Error("Citation-bearing units cannot be skipped as nonfactual");
        return [];
      }
      return [
        {
          id: `u${unit.index}`,
          answerQuote: source.quote,
          kind: unit.kind,
          verdict: unit.verdict,
          citations: unit.citations,
          support: unit.support.map((id) => {
            const entry = input.quotes[id];
            if (!entry) throw new Error("Unknown evidence quote selection");
            return { callId: entry.callId, evidenceId: entry.evidenceId, quote: entry.quote };
          }),
          reason: unit.reason,
        },
      ];
    }),
    abstention: selection.abstention,
  };
}

export const INDEXED_JUDGE_SYSTEM = `${JUDGE_SYSTEM}\n\nOUTPUT CONTRACT FOR THIS RUN: use the supplied indexed selector schema, not textual answerQuote or evidence quote fields. The engine materializes exact original text. Assess EVERY answerUnits index exactly once. A unit is a contiguous paragraph or bullet block and may contain several factual clauses: supported requires ALL clauses to be supported by its actually cited set. Partial means some clauses are supported; do not overlook unsupported extras. Nonfactual is only a heading, question, offer or advice without factual assertions or citation markers. Citation-bearing units always need assessment. Distinguish proposed link relationships justified by both bodies from claims that graph edges already exist; a grounded proposal does not need an existing edge. Give exactly the citation ids present in each unit, including irrelevant and unknown IDs. Select support by integer index from selectableDeliveredQuotes, using only quotes whose evidenceId is actually cited in that unit. Titles alone cannot establish substantive claims. Select answer unit indices for every non-missing key point and present forbidden condition. Use [] for missing/absent. For compound key points, select all units needed to demonstrate full coverage. References assess correctness, never delivery grounding. Assess absence scope from actual deliveries including zero-id outputs. General knowledge must be explicitly labeled outside knowledge to earn the general classification. Keep every verdict and reason in the JSON; never output quotations, new facts or invented IDs.`;

export async function judgeIndexed(
  item: AnswerItem,
  run: AgentRun,
  provider: ModelProvider,
  signal?: AbortSignal,
  options: { maxRepairs?: number; replayRequest?: unknown } = {},
) {
  const maxRepairs = options.maxRepairs ?? 1;
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > 2)
    throw new Error("Invalid indexed repair count");
  const input =
    options.replayRequest === undefined
      ? indexedInput(item, run)
      : replayIndexedInput(item, run, options.replayRequest);
  const start = performance.now();
  const messages: ChatMessage[] = [userText(JSON.stringify(input.request))];
  const attempts: JudgeAttempt[] = [];
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    signal?.throwIfAborted();
    const response = await provider.send(
      { system: INDEXED_JUDGE_SYSTEM, tools: [], allowTools: false, messages },
      { onText: () => {}, onThinking: () => {} },
      signal,
    );
    const raw = textOf(response.message);
    let judgment: Judgment | null = null;
    let selection: IndexedJudgment | null = null;
    let issues: string[];
    const finished =
      response.finish === "end" && !response.message.parts.some((p) => p.type === "tool_call");
    if (!finished) issues = ["Indexed judge did not finish a JSON answer"];
    else
      try {
        selection = indexedJudgmentSchema.parse(JSON.parse(raw));
        judgment = materializeJudgment(selection, input);
        issues = validateJudgment(judgment, item, run);
      } catch (error) {
        issues = [error instanceof Error ? error.message : "Invalid indexed judgment"];
      }
    attempts.push({ raw, finish: response.finish, issues, usage: response.usage });
    if (judgment && selection && !issues.length)
      return {
        judgment,
        selection,
        units: input.units,
        quotes: input.quotes,
        usage: attempts.reduce(
          (sum, a) => ({
            inputTokens: sum.inputTokens + a.usage.inputTokens,
            outputTokens: sum.outputTokens + a.usage.outputTokens,
            cacheReadTokens: sum.cacheReadTokens + a.usage.cacheReadTokens,
            cacheWriteTokens: sum.cacheWriteTokens + a.usage.cacheWriteTokens,
          }),
          { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        ),
        elapsedMs: performance.now() - start,
        raw,
        attempts,
      };
    if (!finished || attempt === maxRepairs) throw new JudgeOutputError(attempts);
    messages.push(
      response.message,
      userText(
        JSON.stringify({
          task: "Repair the complete indexed JSON against the original input, without removing factual units or changing semantic decisions merely to pass validation.",
          issues,
        }),
      ),
    );
  }
  throw new JudgeOutputError(attempts);
}
