import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { citedIds } from "./evidence";
import { SYSTEM_PROMPT } from "./prompt";
import type { ModelProvider } from "./provider";
import { executeTool, toolDefinitions, type ToolContext, type ToolOutcome } from "./tools";

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
}

export const DEFAULT_BUDGET: Budget = { maxRequests: 10, maxToolCalls: 30, maxToolChars: 120_000 };

/** Consecutive tool rounds that returned no new evidence before the model is nudged. */
const STALE_ROUNDS_BEFORE_REMINDER = 2;

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
  messages: BetaMessageParam[];
  stop: StopReason;
  /** Text of the final assistant message. */
  answer: string;
  citations: { valid: string[]; unknown: string[] };
  usage: TurnUsage;
  error?: unknown;
}

export interface TurnOptions {
  provider: ModelProvider;
  context: ToolContext;
  history: BetaMessageParam[];
  userContent: string | BetaContentBlockParam[];
  budget?: Budget;
  events?: TurnEvents;
  signal?: AbortSignal;
}

export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  const { provider, context, events = {}, signal } = options;
  const budget = options.budget ?? DEFAULT_BUDGET;
  const tools = toolDefinitions();
  const turn: BetaMessageParam[] = [{ role: "user", content: options.userContent }];
  const usage: TurnUsage = {
    requests: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let toolChars = 0;
  let staleRounds = 0;
  let exhausted = false;
  let last: BetaMessage | null = null;

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
      ...(error !== undefined && { error }),
    };
  };

  while (true) {
    const isFinalRequest = exhausted || usage.requests + 1 >= budget.maxRequests;
    usage.requests++;
    events.onRequest?.(usage.requests);

    let message: BetaMessage;
    try {
      message = await provider.send(
        {
          system: SYSTEM_PROMPT,
          messages: [...options.history, ...turn],
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

    last = message;
    addUsage(usage, message);
    turn.push({ role: "assistant", content: message.content });
    const toolUses = message.content.filter(
      (block): block is BetaToolUseBlock => block.type === "tool_use",
    );

    // Tool calls that will not run still need results, or the next request is invalid.
    const endWithout = (stop: StopReason, reason: string): TurnResult => {
      if (toolUses.length > 0) {
        turn.push({
          role: "user",
          content: toolUses.map((call) => toolResult(call.id, skipped(reason, call.name))),
        });
      }
      return finish(stop);
    };

    if (message.stop_reason === "refusal") return endWithout("refusal", "Not run: refusal.");
    if (message.stop_reason === "max_tokens") {
      // A tool input cut off at max_tokens may still parse; never run it.
      return endWithout("max_tokens", "Not run: the request hit max_tokens.");
    }
    if (message.stop_reason === "pause_turn") continue;
    if (toolUses.length === 0 || isFinalRequest) {
      return endWithout(exhausted ? "budget_exhausted" : "answered", "Not run: budget used up.");
    }

    const results: BetaContentBlockParam[] = [];
    let freshEvidence = 0;
    for (const call of toolUses) {
      usage.toolCalls++;
      events.onToolCall?.({ id: call.id, name: call.name, input: call.input });
      const outcome =
        usage.toolCalls > budget.maxToolCalls
          ? skipped("Tool budget for this turn is used up.", call.name)
          : executeTool(call.name, call.input, context);
      events.onToolResult?.({ id: call.id, name: call.name, ...outcome });
      toolChars += outcome.content.length;
      freshEvidence += outcome.newEvidence;
      results.push(toolResult(call.id, outcome));
    }

    const gathered = results.some((r) => r.type === "tool_result" && !r.is_error && hasEvidence(r));
    staleRounds = gathered && freshEvidence === 0 ? staleRounds + 1 : 0;
    exhausted = usage.toolCalls >= budget.maxToolCalls || toolChars >= budget.maxToolChars;

    if (exhausted) {
      results.push({
        type: "text",
        text: "The research budget for this turn is used up. Answer now from the evidence you have, and say what remains unanswered.",
      });
    } else if (staleRounds >= STALE_ROUNDS_BEFORE_REMINDER) {
      results.push({
        type: "text",
        text: "Your recent tool calls returned only evidence you already had. If you can answer, answer now; otherwise try a clearly different angle.",
      });
      staleRounds = 0;
    }
    turn.push({ role: "user", content: results });
    if (signal?.aborted) return finish("aborted");
  }
}

function toolResult(id: string, outcome: ToolOutcome): BetaToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: id,
    content: outcome.content,
    ...(outcome.isError && { is_error: true }),
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

function hasEvidence(result: BetaToolResultBlockParam): boolean {
  return typeof result.content === "string" && /\[E\d+\]/.test(result.content);
}

function textOf(message: BetaMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function addUsage(usage: TurnUsage, message: BetaMessage): void {
  usage.inputTokens += message.usage.input_tokens;
  usage.outputTokens += message.usage.output_tokens;
  usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
  usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;
}
