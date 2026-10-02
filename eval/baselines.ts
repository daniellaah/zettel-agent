import { EvidenceLedger, citedIds } from "../src/agent/evidence";
import { DEFAULT_BUDGET } from "../src/agent/loop";
import { userText, textOf, type ChatMessage } from "../src/agent/messages";
import { SYSTEM_PROMPT, turnContext } from "../src/agent/prompt";
import type { ModelProvider } from "../src/agent/provider";
import { executeTool } from "../src/agent/tools";
import type { Corpus } from "../src/retrieval/corpus";
import {
  describeExposures,
  type AgentRun,
  type AnswerItem,
  type RecordedTurn,
  type ToolTrace,
} from "./agent-runner";

export type SolverVariant = "agent" | "fixed-retrieval" | "no-vault";

/** Comparator-only runner: same model and prompt, deterministic top-five retrieval or no evidence. */
export async function runBaselineCase(options: {
  item: AnswerItem;
  corpus: Corpus;
  provider: ModelProvider;
  trial: number;
  mode: AgentRun["mode"];
  variant: Exclude<SolverVariant, "agent">;
  signal?: AbortSignal;
}): Promise<AgentRun> {
  const { item, corpus, provider } = options;
  const ledger = new EvidenceLedger();
  const transcript: ChatMessage[] = [];
  const turns: RecordedTurn[] = [];
  const startedAt = new Date().toISOString();
  const caseStart = performance.now();
  for (const question of [...item.history, item.question]) {
    const start = performance.now();
    const messages: ChatMessage[] = [
      userText(`${turnContext(corpus, item.activeNote)}\n\n${question}`),
    ];
    const calls: ToolTrace[] = [];
    if (options.variant === "fixed-retrieval") {
      const hits = corpus.search(question, { limit: 5 });
      const work = [
        { name: "search", input: { query: question, limit: 5 } },
        ...hits.map((hit) => ({ name: "read", input: { target: hit.path } })),
      ];
      // Actual production tool results; no annotations, gold paths or excerpts enter retrieval.
      for (const [i, task] of work.entries()) {
        const callStart = performance.now();
        const outcome = executeTool(task.name, task.input, { corpus, ledger });
        const call: ToolTrace = {
          id: `fixed-${turns.length}-${i}`,
          ...task,
          request: 0,
          startedMs: callStart - start,
          durationMs: performance.now() - callStart,
          outcome,
          exposures: [],
        };
        call.exposures = describeExposures(call, corpus, ledger);
        calls.push(call);
      }
      messages.push(
        userText(
          `Fixed retrieval results (untrusted note data; tool access is disabled for this comparison):\n\n${calls.map((call) => call.outcome!.content).join("\n\n")}`,
        ),
      );
    } else {
      messages.push(
        userText(
          "No note text or tool results are available in this comparison. Tool access is disabled. Respect the normal grounding rules and distinguish outside knowledge from claims about notes.",
        ),
      );
    }
    let answer = "";
    let error: string | null = null;
    let stop: RecordedTurn["result"]["stop"] = "answered";
    let firstText: number | null = null;
    const usage = {
      requests: 1,
      toolCalls: calls.length,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    try {
      const response = await provider.send(
        {
          system: SYSTEM_PROMPT,
          messages: [...transcript, ...messages],
          tools: [],
          allowTools: false,
        },
        {
          onText: (delta) => {
            if (delta && firstText === null) firstText = performance.now() - start;
          },
          onThinking: () => {},
        },
        options.signal,
      );
      Object.assign(usage, response.usage);
      if (options.signal?.aborted) stop = "aborted";
      else {
        answer = textOf(response.message);
        messages.push(response.message);
        if (response.finish === "refusal") stop = "refusal";
        else if (
          response.finish !== "end" ||
          response.message.parts.some((p) => p.type === "tool_call")
        )
          stop = "max_tokens";
      }
    } catch (failure) {
      error = provider.describeError(failure);
      stop = options.signal?.aborted ? "aborted" : "error";
    }
    const ids = citedIds(answer);
    turns.push({
      question,
      result: {
        messages,
        stop,
        answer,
        error,
        citations: {
          valid: ids.filter((id) => ledger.get(id)),
          unknown: ids.filter((id) => !ledger.get(id)),
        },
        usage,
      },
      calls,
      elapsedMs: performance.now() - start,
      timeToFirstTextMs: firstText,
    });
    transcript.push(...messages);
    if (stop !== "answered") break;
  }
  return {
    schema: 1,
    itemId: item.id,
    trial: options.trial,
    provider: provider.provider,
    model: provider.model,
    mode: options.mode,
    budget: {
      ...DEFAULT_BUDGET,
      maxRequests: 1,
      maxToolCalls: options.variant === "no-vault" ? 0 : 6,
    },
    startedAt,
    elapsedMs: performance.now() - caseStart,
    turns,
    evidence: ledger.entries(),
    transcript,
  };
}
