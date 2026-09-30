import { EvidenceLedger, citationsToLinks, type Evidence } from "../agent/evidence";
import { runTurn, type StopReason, type TurnUsage } from "../agent/loop";
import { turnContext } from "../agent/prompt";
import type { ChatMessage } from "../agent/messages";
import type { ModelProvider } from "../agent/provider";
import type { Corpus } from "../retrieval/corpus";

/**
 * A conversation as the UI sees it, plus the API transcript behind it. Framework-free:
 * the React view subscribes through `subscribe`/`getSnapshot`.
 *
 * Items are immutable. A streamed delta replaces only the last assistant item, so a
 * memoized message list re-renders one message per update.
 */

export type AssistantPart =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      summary: string | null;
      isError: boolean;
    };

export interface UserItem {
  kind: "user";
  id: string;
  text: string;
}

export interface AssistantItem {
  kind: "assistant";
  id: string;
  parts: AssistantPart[];
  status: "running" | "done";
  stop: StopReason | null;
  error: string | null;
  citations: { valid: string[]; unknown: string[] } | null;
  usage: TurnUsage | null;
}

export type ChatItem = UserItem | AssistantItem;

export interface ChatSnapshot {
  items: readonly ChatItem[];
  running: boolean;
}

export interface ChatSessionDeps {
  /** The corpus once indexing has finished. */
  corpus: () => Promise<Corpus>;
  /**
   * Creates a provider for this turn's question, or explains why it cannot (no API key, no
   * recording to replay).
   */
  provider: (question: string) => Promise<ModelProvider | string>;
  activeNotePath: () => string | null;
}

export class ChatSession {
  private snapshot: ChatSnapshot = { items: [], running: false };
  private readonly listeners = new Set<() => void>();
  private history: ChatMessage[] = [];
  private ledger = new EvidenceLedger();
  private controller: AbortController | null = null;
  private nextId = 0;

  constructor(private readonly deps: ChatSessionDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ChatSnapshot => this.snapshot;

  evidence(id: string): Evidence | undefined {
    return this.ledger.get(id);
  }

  /** The final answer of an assistant message, with citations rewritten as note links. */
  answerMarkdown(item: AssistantItem): string {
    const lastTool = item.parts.findLastIndex((part) => part.kind === "tool");
    const answer = item.parts
      .slice(lastTool + 1)
      .flatMap((part) => (part.kind === "text" ? [part.text] : []))
      .join("");
    return citationsToLinks(answer.trim(), this.ledger);
  }

  async send(text: string): Promise<void> {
    if (this.snapshot.running || text.trim() === "") return;
    const userItem: UserItem = { kind: "user", id: this.id(), text };
    const assistant: AssistantItem = {
      kind: "assistant",
      id: this.id(),
      parts: [],
      status: "running",
      stop: null,
      error: null,
      citations: null,
      usage: null,
    };
    this.set({ items: [...this.snapshot.items, userItem, assistant], running: true });

    const provider = await this.deps.provider(text);
    if (typeof provider === "string") {
      this.updateAssistant((item) => ({ ...item, status: "done", stop: "error", error: provider }));
      this.set({ ...this.snapshot, running: false });
      return;
    }

    const corpus = await this.deps.corpus();
    this.controller = new AbortController();
    const result = await runTurn({
      provider,
      context: { corpus, ledger: this.ledger },
      history: this.history,
      userContent: `${turnContext(corpus, this.deps.activeNotePath())}\n\n${text}`,
      signal: this.controller.signal,
      events: {
        onText: (delta) => this.appendDelta("text", delta),
        onThinking: (delta) => this.appendDelta("thinking", delta),
        onToolCall: ({ id, name, input }) =>
          this.updateAssistant((item) => ({
            ...item,
            parts: [
              ...item.parts,
              { kind: "tool", id, name, input, summary: null, isError: false },
            ],
          })),
        onToolResult: ({ id, summary, isError }) =>
          this.updateAssistant((item) => ({
            ...item,
            parts: item.parts.map((part) =>
              part.kind === "tool" && part.id === id ? { ...part, summary, isError } : part,
            ),
          })),
      },
    });
    this.controller = null;

    // A turn that failed before any response is dropped; anything longer is a valid
    // transcript (every tool call answered), so the conversation can continue from it.
    if (result.messages.length > 1) this.history = [...this.history, ...result.messages];
    this.updateAssistant((item) => ({
      ...item,
      status: "done",
      stop: result.stop,
      error: result.stop === "error" ? provider.describeError(result.error) : null,
      citations: result.citations,
      usage: result.usage,
    }));
    this.set({ ...this.snapshot, running: false });
  }

  stop(): void {
    this.controller?.abort();
  }

  reset(): void {
    this.stop();
    this.history = [];
    this.ledger = new EvidenceLedger();
    this.set({ items: [], running: false });
  }

  private appendDelta(kind: "text" | "thinking", delta: string): void {
    this.updateAssistant((item) => {
      const last = item.parts.at(-1);
      if (last?.kind === kind) {
        return { ...item, parts: [...item.parts.slice(0, -1), { kind, text: last.text + delta }] };
      }
      return { ...item, parts: [...item.parts, { kind, text: delta }] };
    });
  }

  private updateAssistant(update: (item: AssistantItem) => AssistantItem): void {
    const items = this.snapshot.items;
    const last = items.at(-1);
    if (last?.kind !== "assistant") return;
    this.set({ ...this.snapshot, items: [...items.slice(0, -1), update(last)] });
  }

  private set(snapshot: ChatSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private id(): string {
    return `item-${this.nextId++}`;
  }
}
