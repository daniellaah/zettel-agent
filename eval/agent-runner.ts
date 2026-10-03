import type { ReviewMode } from "../src/agent/answer-review";
import type { SearchPort } from "../src/retrieval/local-search";
import { EvidenceLedger, type Evidence } from "../src/agent/evidence";
import { DEFAULT_BUDGET, runTurn, type Budget, type TurnResult } from "../src/agent/loop";
import type { ChatMessage } from "../src/agent/messages";
import { turnContext } from "../src/agent/prompt";
import type { ModelProvider } from "../src/agent/provider";
import type { ToolOutcome } from "../src/agent/tools";
import type { Corpus } from "../src/retrieval/corpus";
import type { AnswerSet } from "./schema";

export type AnswerItem = AnswerSet["items"][number];
export type ExposureScope =
  | "title"
  | "metadata"
  | "outline"
  | "preview"
  | "search-excerpt"
  | "match-lines"
  | "read-body"
  | "graph";

export interface Exposure extends Evidence {
  scope: ExposureScope;
  /** Present on v2 tool deliveries. Historical traces retain their original parser. */
  text?: string;
  start?: number;
  end?: number;
  line?: number;
  /** Descriptive only. The exact tool result, never the full source file, is judge evidence. */
  wholeSectionDelivered: boolean;
}

export interface ToolTrace {
  id: string;
  name: string;
  input: unknown;
  request: number;
  startedMs: number;
  durationMs: number;
  outcome: ToolOutcome | null;
  exposures: Exposure[];
}

export interface RecordedTurn {
  question: string;
  result: Omit<TurnResult, "error"> & { error: string | null };
  elapsedMs: number;
  timeToFirstTextMs: number | null;
  calls: ToolTrace[];
}

export interface AgentRun {
  schema: 1;
  itemId: string;
  trial: number;
  provider: string;
  model: string;
  mode: "live" | "replay" | "scripted";
  budget: Budget;
  startedAt: string;
  elapsedMs: number;
  turns: RecordedTurn[];
  evidence: Evidence[];
  /** Includes historical turns, so follow-ups retain the evidence actually seen. */
  transcript: ChatMessage[];
}

/** No gold excerpts or expected answers are supplied to the agent. */
export async function runAgentCase(options: {
  item: AnswerItem;
  corpus: Corpus;
  provider: ModelProvider;
  trial: number;
  mode: AgentRun["mode"];
  budget?: Budget;
  signal?: AbortSignal;
  search?: SearchPort;
  reviewMode?: ReviewMode;
  beforeTurn?: (corpus: Corpus, index: number) => void;
}): Promise<AgentRun> {
  const { item, corpus, provider } = options;
  const budget = options.budget ?? DEFAULT_BUDGET;
  const ledger = new EvidenceLedger();
  const transcript: ChatMessage[] = [];
  const turns: RecordedTurn[] = [];
  const startedAt = new Date().toISOString();
  const caseStart = performance.now();
  for (const [index, question] of [...item.history, item.question].entries()) {
    options.beforeTurn?.(corpus, index);
    const start = performance.now();
    const calls: ToolTrace[] = [];
    let request = 0;
    let firstText: number | null = null;
    const result = await runTurn({
      provider,
      context: { corpus, ledger, ...(options.search && { search: options.search }) },
      ...(options.reviewMode && { reviewMode: options.reviewMode }),
      history: transcript,
      // An open note is context, not an implicit attachment, matching ChatSession.
      userContent: `${turnContext(corpus, item.activeNote)}\n\n${question}`,
      budget,
      ...(options.signal && { signal: options.signal }),
      events: {
        onRequest: (index) => {
          request = index;
        },
        onText: (delta) => {
          if (delta && firstText === null) firstText = performance.now() - start;
        },
        onToolCall: ({ id, name, input }) => {
          calls.push({
            id,
            name,
            input,
            request,
            startedMs: performance.now() - start,
            durationMs: 0,
            outcome: null,
            exposures: [],
          });
        },
        onToolResult: (outcome) => {
          const call = [...calls].reverse().find((entry) => entry.id === outcome.id);
          if (!call) throw new Error(`Tool result without a call: ${outcome.id}`);
          call.durationMs = performance.now() - start - call.startedMs;
          call.outcome = {
            content: outcome.content,
            isError: outcome.isError,
            summary: outcome.summary,
            evidenceIds: outcome.evidenceIds,
            newEvidence: outcome.newEvidence,
            ...(outcome.contract && { contract: outcome.contract }),
          };
          call.exposures = describeExposures(call, corpus, ledger);
        },
      },
    });
    const { error, ...rest } = result;
    turns.push({
      question,
      result: { ...rest, error: error === undefined ? null : provider.describeError(error) },
      elapsedMs: performance.now() - start,
      timeToFirstTextMs: firstText,
      calls,
    });
    if (result.messages.length > 1) transcript.push(...result.messages);
    if (["error", "aborted", "refusal", "max_tokens"].includes(result.stop)) break;
  }
  return {
    schema: 1,
    itemId: item.id,
    trial: options.trial,
    provider: provider.provider,
    model: provider.model,
    mode: options.mode,
    budget,
    startedAt,
    elapsedMs: performance.now() - caseStart,
    turns,
    evidence: ledger.entries(),
    transcript,
  };
}

export function describeExposures(
  call: ToolTrace,
  corpus: Corpus,
  ledger: EvidenceLedger,
): Exposure[] {
  if (!call.outcome || call.outcome.isError) return [];
  for (const id of call.outcome.evidenceIds) {
    if (!ledger.get(id)) throw new Error(`Delivered evidence missing from ledger: ${id}`);
  }
  if (call.outcome.contract) {
    const scopes = {
      excerpt: "search-excerpt",
      body: "read-body",
      "matched-line": "match-lines",
    } as const;
    return call.outcome.contract.exposures.map(({ wholeSection, scope, ...span }) => ({
      ...span,
      scope: scope in scopes ? scopes[scope as keyof typeof scopes] : (scope as ExposureScope),
      wholeSectionDelivered: wholeSection,
    }));
  }
  const scope: ExposureScope =
    call.name === "list"
      ? typeof call.input === "object" &&
        call.input !== null &&
        "preview" in call.input &&
        call.input.preview === true
        ? "preview"
        : "title"
      : call.name === "links"
        ? "graph"
        : call.name === "read"
          ? "read-body"
          : call.name === "match"
            ? "match-lines"
            : "search-excerpt";
  return call.outcome.evidenceIds.map((id) => {
    const entry = ledger.get(id);
    if (!entry) throw new Error(`Delivered evidence missing from ledger: ${id}`);
    const section = corpus.get(entry.path)?.sections.find((part) => part.id === entry.sectionId);
    const quoted = section?.text.replace(/<\/(note|note_lines)>/gi, "<\\/$1>");
    return {
      ...entry,
      scope,
      wholeSectionDelivered:
        scope !== "title" &&
        scope !== "graph" &&
        !!quoted &&
        call.outcome!.content.includes(quoted),
    };
  });
}

/** Binds citation ids to their deliveries without expanding any evidence from the corpus. */
export function deliveredEvidence(
  run: AgentRun,
): { callId: string; content: string; isError: boolean; exposures: Exposure[] }[] {
  return run.turns.flatMap((turn) =>
    turn.calls.flatMap((call) =>
      call.outcome
        ? [
            {
              callId: call.id,
              content: call.outcome.content,
              isError: call.outcome.isError,
              exposures: call.exposures,
            },
          ]
        : [],
    ),
  );
}
