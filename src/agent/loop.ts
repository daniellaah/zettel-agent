import type { ResultContract } from "./tool-contract";
import { citedIds } from "./evidence";
import { runReviewedTurn, type TurnReliability } from "./reviewed-turn";
import type { ReviewMode } from "./answer-review";
import { selectContext, DEFAULT_INPUT_ALLOWANCE, type ContextDiagnostics } from "./context-window";
import {
  textOf,
  toolCallsOf,
  userText,
  type AssistantMessage,
  type ChatMessage,
  type TextPart,
  type ToolResultPart,
} from "./messages";
import { SYSTEM_PROMPT } from "./prompt";
import type { ModelProvider, ModelResponse } from "./provider";
import {
  executeTool,
  prepareToolSearch,
  toolDefinitions,
  type ToolContext,
  type ToolOutcome,
} from "./tools";
import type { PreparedSearch } from "../retrieval/local-search";

/**
 * One user turn: stream model requests, run the tools the model asks for, and repeat until
 * it answers or a budget runs out. The last allowed request disables tools so the model
 * always ends with an answer built from the evidence it gathered.
 *
 * The transcript is append-only: messages are never edited once sent, which keeps prompt
 * caching and thinking-block replay valid.
 */

export interface Budget {
  /** Model requests per turn, including the reserved final one. */
  maxRequests: number;
  maxToolCalls: number;
  /** Characters of tool output per turn. */
  maxToolChars: number;
  /** Conservative input allowance; full saved history is never truncated. */
  maxInputTokens?: number;
}

export const DEFAULT_BUDGET: Budget = { maxRequests: 10, maxToolCalls: 30, maxToolChars: 120_000 };

/** Consecutive tool rounds that returned no new evidence before the model is nudged. */
const STALE_ROUNDS_BEFORE_REMINDER = 2;

/** Leave room for paired tool results and the final synthesis request. */
const FINAL_CONTEXT_RESERVE = 4096;

/** Tool calls run from one model response; the rest are answered "skipped" to force triage. */
export const MAX_CALLS_PER_RESPONSE = 8;

export interface TurnEvents {
  onRequest?(index: number): void;
  onText?(delta: string): void;
  onThinking?(delta: string): void;
  onToolCall?(call: { id: string; name: string; input: unknown }): void;
  onToolResult?(result: { id: string; name: string } & ToolOutcome): void;
}

export type StopReason =
  "answered" | "budget_exhausted" | "refusal" | "max_tokens" | "aborted" | "error";

export interface TurnUsage {
  requests: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface TurnResult {
  /** Messages to append to the conversation: the user message, then the turn's exchange. */
  messages: ChatMessage[];
  stop: StopReason;
  /** Text of the final assistant message. */
  answer: string;
  citations: { valid: string[]; unknown: string[] };
  usage: TurnUsage;
  error?: unknown;
  reliability?: TurnReliability;
  context?: ContextDiagnostics;
}

export interface TurnOptions {
  provider: ModelProvider;
  context: ToolContext;
  history: ChatMessage[];
  userContent: string;
  userDeliveries?: ResultContract[];
  budget?: Budget;
  events?: TurnEvents;
  signal?: AbortSignal;
  reviewMode?: ReviewMode;
}

export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  return runReviewedTurn(options, runResearchTurn);
}

async function runResearchTurn(options: TurnOptions): Promise<TurnResult> {
  const { provider, context, events = {}, signal } = options;
  const budget = options.budget ?? DEFAULT_BUDGET;
  const tools = toolDefinitions();
  const initial = userText(options.userContent);
  if (options.userDeliveries?.length) initial.deliveries = options.userDeliveries;
  const turn: ChatMessage[] = [initial];
  const usage: TurnUsage = {
    requests: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const seenSpans = new Set<string>();
  for (const message of [...options.history, initial]) {
    if (message.role !== "user") continue;
    const deliveries = [
      ...(message.deliveries ?? []),
      ...message.parts.flatMap((part) =>
        part.type === "tool_result" && part.contract ? [part.contract] : [],
      ),
    ];
    for (const delivery of deliveries)
      for (const span of delivery.exposures)
        seenSpans.add(JSON.stringify([span.id, span.scope, span.start, span.end, span.text]));
  }
  let toolChars = (options.userDeliveries ?? []).reduce(
    (sum, delivery) => sum + (delivery.outputChars ?? 0),
    0,
  );
  let staleRounds = 0;
  let exhausted = toolChars >= budget.maxToolChars;
  let last: AssistantMessage | null = null;
  let lastContext: ContextDiagnostics | undefined;

  const finish = (stop: StopReason, error?: unknown): TurnResult => {
    const answer = last ? textOf(last) : "";
    const ids = citedIds(answer);
    return {
      messages: turn,
      stop,
      answer,
      citations: {
        valid: ids.filter((id) => context.ledger.get(id)),
        unknown: ids.filter((id) => !context.ledger.get(id)),
      },
      usage,
      ...(lastContext && { context: lastContext }),
      ...(error !== undefined && { error }),
    };
  };

  while (true) {
    const selected = selectContext({
      system: SYSTEM_PROMPT,
      tools,
      history: options.history,
      current: turn,
      corpus: context.corpus,
      ...(budget.maxInputTokens !== undefined && { maxInputTokens: budget.maxInputTokens }),
    });
    lastContext = selected.diagnostics;
    if (!selected.diagnostics.fits || usage.requests >= budget.maxRequests) {
      const text = /[\u3400-\u9fff]/.test(options.userContent)
        ? "本轮上下文或请求额度已用完。请缩小问题范围，或开始新对话。"
        : "The request context or turn budget is full. Please narrow the question or start a new conversation.";
      last = { role: "assistant", parts: [{ type: "text", text }] };
      turn.push(last);
      events.onText?.(text);
      return finish("budget_exhausted");
    }
    exhausted ||=
      selected.diagnostics.estimatedTokens + FINAL_CONTEXT_RESERVE >=
      (budget.maxInputTokens ?? DEFAULT_INPUT_ALLOWANCE);
    const isFinalRequest = exhausted || usage.requests + 1 >= budget.maxRequests;
    usage.requests++;
    events.onRequest?.(usage.requests);

    let response: ModelResponse;
    try {
      response = await provider.send(
        {
          system: SYSTEM_PROMPT,
          messages: selected.messages,
          tools,
          allowTools: !isFinalRequest,
        },
        {
          onText: (delta) => events.onText?.(delta),
          onThinking: (delta) => events.onThinking?.(delta),
        },
        signal,
      );
    } catch (error) {
      // A partial response is never committed; the turn ends at the last complete message.
      return finish(signal?.aborted ? "aborted" : "error", error);
    }

    // Some SDKs end an aborted stream quietly instead of throwing; never commit that response.
    if (signal?.aborted) return finish("aborted");
    // An empty assistant message is rejected by some APIs when replayed; keep a placeholder.
    const message: AssistantMessage =
      response.message.parts.length > 0
        ? response.message
        : { role: "assistant", parts: [{ type: "text", text: "(no response)" }] };
    last = message;
    addUsage(usage, response);
    turn.push(message);
    const toolUses = toolCallsOf(message);

    // Tool calls that will not run still need results, or the next request is invalid.
    const endWithout = (stop: StopReason, reason: string): TurnResult => {
      if (toolUses.length > 0) {
        turn.push({
          role: "user",
          parts: toolUses.map((call) => {
            const outcome = skipped(reason, call.name);
            outcome.content = outcome.content.slice(
              0,
              Math.max(0, budget.maxToolChars - toolChars),
            );
            toolChars += outcome.content.length;
            return toolResult(call.id, outcome);
          }),
        });
      }
      return finish(stop);
    };

    if (response.finish === "refusal") return endWithout("refusal", "Not run: refusal.");
    if (response.finish === "max_tokens") {
      // A tool input cut off at max_tokens may still parse; never run it.
      return endWithout("max_tokens", "Not run: the request hit max_tokens.");
    }
    if (response.finish === "pause") {
      if (isFinalRequest) return endWithout("budget_exhausted", "Not run: request budget used up.");
      continue;
    }
    if (toolUses.length === 0 || isFinalRequest) {
      return endWithout(exhausted ? "budget_exhausted" : "answered", "Not run: budget used up.");
    }

    const results: (ToolResultPart | TextPart)[] = [];
    let freshEvidence = 0;
    let gathered = false;
    const prepared = new Map<number, { value?: PreparedSearch; error?: unknown }>();
    for (const [index, call] of toolUses.entries()) {
      const inputContext = selectContext({
        system: SYSTEM_PROMPT,
        tools,
        history: options.history,
        current: [...turn, { role: "user", origin: "control", parts: results }],
        corpus: context.corpus,
        ...(budget.maxInputTokens !== undefined && { maxInputTokens: budget.maxInputTokens }),
      });
      const maxOutputBytes = Math.max(
        0,
        (budget.maxInputTokens ?? DEFAULT_INPUT_ALLOWANCE) -
          inputContext.diagnostics.estimatedTokens -
          FINAL_CONTEXT_RESERVE,
      );
      usage.toolCalls++;
      events.onToolCall?.({ id: call.id, name: call.name, input: call.input });
      let outcome: ToolOutcome;
      try {
        if (
          call.name === "search" &&
          !prepared.has(index) &&
          usage.toolCalls <= budget.maxToolCalls &&
          index < MAX_CALLS_PER_RESPONSE &&
          toolChars < budget.maxToolChars &&
          maxOutputBytes > 0
        ) {
          // Prepare only the next two contiguous searches. Registration and output accounting
          // stay in model order, and no batch starts after the output/call budget is used up.
          const count = Math.min(
            2,
            MAX_CALLS_PER_RESPONSE - index,
            budget.maxToolCalls - usage.toolCalls + 1,
          );
          const batch = toolUses.slice(index, index + count);
          const contiguous = batch.findIndex((next) => next.name !== "search");
          const values = await Promise.all(
            batch.slice(0, contiguous < 0 ? batch.length : contiguous).map(async (next) => {
              try {
                const value = await prepareToolSearch(
                  next.name,
                  next.input,
                  { ...context, maxChars: Math.max(0, budget.maxToolChars - toolChars) },
                  signal,
                );
                return value ? { value } : {};
              } catch (error) {
                return { error };
              }
            }),
          );
          values.forEach((value, offset) => prepared.set(index + offset, value));
        }
        const ready = prepared.get(index);
        if (signal?.aborted) signal.throwIfAborted();
        if (
          ready &&
          "error" in ready &&
          usage.toolCalls <= budget.maxToolCalls &&
          toolChars < budget.maxToolChars
        )
          throw ready.error;
        outcome =
          usage.toolCalls > budget.maxToolCalls
            ? skipped("Tool budget for this turn is used up.", call.name)
            : index >= MAX_CALLS_PER_RESPONSE
              ? skipped(
                  `Not run: at most ${MAX_CALLS_PER_RESPONSE} tool calls per step. Pick the most relevant notes from what you have seen before reading more.`,
                  call.name,
                )
              : executeTool(call.name, call.input, {
                  ...context,
                  maxChars: Math.max(0, budget.maxToolChars - toolChars),
                  maxOutputBytes,
                  ...(ready?.value && { preparedSearch: ready.value }),
                });
      } catch (error) {
        // Close every pending call before stopping during asynchronous query embedding.
        for (const [offset, pending] of toolUses.slice(index).entries()) {
          if (offset > 0) {
            usage.toolCalls++;
            events.onToolCall?.({ id: pending.id, name: pending.name, input: pending.input });
          }
          const stopped = skipped("Not run: local query interrupted or failed.", pending.name);
          stopped.content = stopped.content.slice(0, Math.max(0, budget.maxToolChars - toolChars));
          toolChars += stopped.content.length;
          events.onToolResult?.({ id: pending.id, name: pending.name, ...stopped });
          results.push(toolResult(pending.id, stopped));
        }
        turn.push({ role: "user", parts: results });
        return finish(signal?.aborted ? "aborted" : "error", error);
      }
      if (outcome.isError && outcome.content.length > budget.maxToolChars - toolChars) {
        outcome = {
          ...outcome,
          content: outcome.content.slice(0, Math.max(0, budget.maxToolChars - toolChars)),
        };
      }
      events.onToolResult?.({ id: call.id, name: call.name, ...outcome });
      // A rejected expansion must lead to synthesis rather than repeated queries that
      // consume the last input space with call/result wrappers and thinking blocks.
      exhausted ||= outcome.contract?.error?.code === "output-budget";
      toolChars += outcome.content.length;
      if (outcome.contract) {
        for (const span of outcome.contract.exposures) {
          const key = JSON.stringify([span.id, span.scope, span.start, span.end, span.text]);
          if (!seenSpans.has(key)) {
            freshEvidence++;
            seenSpans.add(key);
          }
        }
      } else freshEvidence += outcome.newEvidence;
      gathered ||= !outcome.isError && outcome.evidenceIds.length > 0;
      results.push(toolResult(call.id, outcome));
    }

    staleRounds = gathered && freshEvidence === 0 ? staleRounds + 1 : 0;
    exhausted ||= usage.toolCalls >= budget.maxToolCalls || toolChars >= budget.maxToolChars;

    if (exhausted) {
      results.push({
        type: "text",
        text: 'The research budget for this turn is used up. Answer now from delivered evidence, and say what remains unanswered. If requested evidence was not found, state a scoped finding in the opening and headings ("I did not find it in the searched/read notes"), identify partial/failed queries, and never claim corpus-wide absence or that no such measurement exists. A bounded or failed search cannot establish absence.',
      });
    } else if (staleRounds >= STALE_ROUNDS_BEFORE_REMINDER) {
      results.push({
        type: "text",
        text: "Your recent tool calls returned only evidence you already had. If you can answer, answer now; otherwise try a clearly different angle.",
      });
      staleRounds = 0;
    }
    turn.push({ role: "user", origin: "control", parts: results });
    if (signal?.aborted) return finish("aborted");
  }
}

function toolResult(id: string, outcome: ToolOutcome): ToolResultPart {
  return {
    type: "tool_result",
    callId: id,
    content: outcome.content,
    isError: outcome.isError,
    ...(outcome.contract && { contract: outcome.contract }),
  };
}

function skipped(content: string, name: string): ToolOutcome {
  return {
    content,
    isError: true,
    summary: `${name} → skipped`,
    evidenceIds: [],
    newEvidence: 0,
  };
}

function addUsage(usage: TurnUsage, response: ModelResponse): void {
  usage.inputTokens += response.usage.inputTokens;
  usage.outputTokens += response.usage.outputTokens;
  usage.cacheReadTokens += response.usage.cacheReadTokens;
  usage.cacheWriteTokens += response.usage.cacheWriteTokens;
}
