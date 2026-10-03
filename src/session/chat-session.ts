import type { ReviewMode } from "../agent/answer-review";
import type { TurnReliability } from "../agent/reviewed-turn";
import type { ContextDiagnostics } from "../agent/context-window";
import { attribute, quoteData, type ResultContract } from "../agent/tool-contract";
import { EvidenceLedger, citationsToLinks, type Evidence } from "../agent/evidence";
import { DEFAULT_BUDGET, runTurn, type StopReason, type TurnUsage } from "../agent/loop";
import { turnContext } from "../agent/prompt";
import type { ChatMessage } from "../agent/messages";
import type { ModelProvider } from "../agent/provider";
import { executeTool } from "../agent/tools";
import type { SearchPort } from "../retrieval/local-search";
import type { Corpus } from "../retrieval/corpus";

/**
 * A conversation as the UI sees it, plus the API transcript behind it. Framework-free:
 * the React view subscribes through `subscribe`/`getSnapshot`.
 *
 * Items are immutable. A streamed delta replaces only the last assistant item, so a
 * memoized message list re-renders one message per update. After every turn the whole
 * conversation is saved through the optional store, so it can be reopened later.
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

/** Context the user attached to a question. */
export type Attachment =
  | { kind: "note"; path: string; title: string }
  | { kind: "selection"; path: string; title: string; text: string };

export interface UserItem {
  kind: "user";
  id: string;
  text: string;
  attachments: Attachment[];
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
  reliability?: TurnReliability;
  context?: ContextDiagnostics;
  /** Transcript length before this turn; retry truncates the transcript back to it. */
  historyStart: number;
}

export type ChatItem = UserItem | AssistantItem;

export interface ChatSnapshot {
  /** Null until the first question starts a conversation. */
  conversationId: string | null;
  items: readonly ChatItem[];
  running: boolean;
}

/** Everything needed to reopen a conversation exactly where it was. */
export interface ConversationRecord {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: ChatItem[];
  history: ChatMessage[];
  evidence: Evidence[];
}

export interface ConversationStore {
  save(record: ConversationRecord): Promise<void>;
}

export interface ChatSessionDeps {
  /** The corpus once indexing has finished. */
  corpus: () => Promise<Corpus>;
  search?: SearchPort;
  reviewMode?: () => ReviewMode;
  /**
   * Creates a provider for this turn's question, or explains why it cannot (no API key, no
   * recording to replay).
   */
  provider: (question: string) => Promise<ModelProvider | string>;
  activeNotePath: () => string | null;
  store?: ConversationStore;
  now?: () => Date;
  newConversationId?: () => string;
}

/** Longest selection passed to the model; longer selections are cut with a notice. */
export const MAX_SELECTION_CHARS = 8000;

export class ChatSession {
  private snapshot: ChatSnapshot = { conversationId: null, items: [], running: false };
  private readonly listeners = new Set<() => void>();
  private history: ChatMessage[] = [];
  private ledger = new EvidenceLedger();
  private controller: AbortController | null = null;
  private nextId = 0;
  private createdAt: string | null = null;

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

  reportStorageError(message: string, itemId?: string, conversationId?: string | null): void {
    if (conversationId !== undefined && this.snapshot.conversationId !== conversationId) return;
    if (itemId && this.snapshot.items.at(-1)?.id !== itemId) return;
    this.updateAssistant((item) => ({ ...item, error: message }));
  }

  /** True when the last message is a finished answer that can be asked again. */
  canRetry(): boolean {
    const last = this.snapshot.items.at(-1);
    return !this.snapshot.running && last?.kind === "assistant" && last.status === "done";
  }

  async send(text: string, attachments: Attachment[] = []): Promise<void> {
    if (this.snapshot.running || text.trim() === "") return;
    const controller = new AbortController();
    this.controller = controller;
    this.ledger = new EvidenceLedger(this.ledger.entries());
    const current = () => this.controller === controller && !controller.signal.aborted;
    const conversationId = this.snapshot.conversationId ?? this.newConversationId();
    this.createdAt ??= this.now();
    const userItem: UserItem = { kind: "user", id: this.id(), text, attachments };
    const assistant: AssistantItem = {
      kind: "assistant",
      id: this.id(),
      parts: [],
      status: "running",
      stop: null,
      error: null,
      citations: null,
      usage: null,
      historyStart: this.history.length,
    };
    this.set({
      conversationId,
      items: [...this.snapshot.items, userItem, assistant],
      running: true,
    });

    try {
      const provider = await awaitInitialization(this.deps.provider(text), controller.signal);
      if (!current()) return;
      if (typeof provider === "string") {
        this.updateAssistant((item) => ({
          ...item,
          status: "done",
          stop: "error",
          error: provider,
        }));
        return;
      }
      const corpus = await awaitInitialization(this.deps.corpus(), controller.signal);
      if (!current()) return;
      if (corpus.size === 0) {
        this.updateAssistant((item) => ({
          ...item,
          status: "done",
          stop: "error",
          error:
            "No research notes were found. Check the Zettelkasten folder and stage folders; fleeting notes are excluded.",
        }));
        return;
      }
      const context = {
        corpus,
        ledger: this.ledger,
        ...(this.deps.search && { search: this.deps.search }),
      };
      const userDeliveries: ResultContract[] = [];
      const userContent = [
        turnContext(corpus, this.deps.activeNotePath()),
        attachmentsBlock(attachments, context, userDeliveries),
        text,
      ]
        .filter((part) => part !== "")
        .join("\n\n");
      const result = await runTurn({
        provider,
        context,
        history: this.history,
        userContent,
        userDeliveries,
        ...(this.deps.reviewMode && { reviewMode: this.deps.reviewMode() }),
        signal: controller.signal,
        events: {
          onText: (delta) => {
            if (current()) this.appendDelta("text", delta);
          },
          onThinking: (delta) => {
            if (current()) this.appendDelta("thinking", delta);
          },
          onToolCall: ({ id, name, input }) => {
            if (current())
              this.updateAssistant((item) => ({
                ...item,
                parts: [
                  ...item.parts,
                  { kind: "tool", id, name, input, summary: null, isError: false },
                ],
              }));
          },
          onToolResult: ({ id, summary, isError }) => {
            if (current())
              this.updateAssistant((item) => ({
                ...item,
                parts: item.parts.map((part) =>
                  part.kind === "tool" && part.id === id ? { ...part, summary, isError } : part,
                ),
              }));
          },
        },
      });
      if (!current()) return;
      if (result.messages.length > 1) this.history = [...this.history, ...result.messages];
      this.updateAssistant((item) => ({
        ...item,
        status: "done",
        stop: result.stop,
        error: result.stop === "error" ? provider.describeError(result.error) : null,
        citations: result.citations,
        usage: result.usage,
        ...(result.reliability && { reliability: result.reliability }),
        ...(result.context && { context: result.context }),
      }));
    } catch {
      if (current())
        this.updateAssistant((item) => ({
          ...item,
          status: "done",
          stop: "error",
          error:
            "Could not initialize or complete this turn. Check the model, research folder and network, then retry.",
        }));
    } finally {
      // Identity, rather than a global running flag, protects a newer turn's state.
      if (this.controller === controller) {
        this.controller = null;
        this.set({ ...this.snapshot, running: false });
        await this.save();
      }
    }
  }

  /** Asks the last question again, discarding the last answer from the transcript. */
  async retry(): Promise<void> {
    if (!this.canRetry()) return;
    const items = this.snapshot.items;
    const answer = items.at(-1) as AssistantItem;
    const question = items.at(-2);
    if (question?.kind !== "user") return;
    this.history = this.history.slice(0, answer.historyStart);
    this.set({ ...this.snapshot, items: items.slice(0, -2) });
    await this.send(question.text, question.attachments);
  }

  stop(): void {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.updateAssistant((item) => ({
      ...item,
      status: "done",
      stop: "aborted",
      parts: item.parts.map((part) =>
        part.kind === "tool" && part.summary === null
          ? { ...part, summary: "Tool interrupted.", isError: true }
          : part,
      ),
    }));
    this.set({ ...this.snapshot, running: false });
    void this.save();
  }

  /** Starts a new, empty conversation. The current one is already saved. */
  reset(): void {
    this.stop();
    this.history = [];
    this.ledger = new EvidenceLedger();
    this.createdAt = null;
    this.set({ conversationId: null, items: [], running: false });
  }

  /** Reopens a saved conversation; follow-up questions continue its transcript. */
  load(record: ConversationRecord): void {
    this.stop();
    this.history = record.history;
    this.ledger = new EvidenceLedger(record.evidence);
    this.createdAt = record.createdAt;
    this.nextId = record.items.reduce((max, item) => Math.max(max, idNumber(item.id) + 1), 0);
    this.set({ conversationId: record.id, items: record.items, running: false });
  }

  toRecord(): ConversationRecord | null {
    const { conversationId, items } = this.snapshot;
    if (conversationId === null || items.length === 0) return null;
    const first = items.find((item): item is UserItem => item.kind === "user");
    return {
      version: 1,
      id: conversationId,
      title: conversationTitle(first?.text ?? ""),
      createdAt: this.createdAt ?? this.now(),
      updatedAt: this.now(),
      items: [...items],
      history: this.history,
      evidence: this.ledger.entries(),
    };
  }

  private async save(): Promise<void> {
    const record = this.toRecord();
    if (!record || !this.deps.store) return;
    try {
      await this.deps.store.save(record);
    } catch {
      if (this.snapshot.conversationId !== record.id) return;
      this.set({
        ...this.snapshot,
        items: this.snapshot.items.map((item) =>
          item.id === record.items.at(-1)?.id && item.kind === "assistant"
            ? {
                ...item,
                error:
                  "This chat could not be saved. It remains available here; check storage access before reloading.",
              }
            : item,
        ),
      });
    }
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

  private now(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private newConversationId(): string {
    return (
      this.deps.newConversationId?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    );
  }
}

/**
 * Attached notes are read through the `read` tool, so their sections get evidence ids and
 * can be cited like anything the agent found itself. Selections are quoted as note data.
 */
export function attachmentsBlock(
  attachments: Attachment[],
  context: Parameters<typeof executeTool>[2],
  deliveries: ResultContract[] = [],
): string {
  const blocks: string[] = [];
  let remaining = context.maxChars ?? DEFAULT_BUDGET.maxToolChars;
  for (const attachment of attachments) {
    if (attachment.kind === "note") {
      const outcome = executeTool(
        "read",
        { target: attachment.path },
        { ...context, maxChars: remaining },
      );
      remaining -= outcome.content.length;
      if (outcome.contract) deliveries.push(outcome.contract);
      blocks.push(
        outcome.isError ? `(Attached note could not be read: ${outcome.content})` : outcome.content,
      );
    } else {
      if (!context.corpus.get(attachment.path)) {
        blocks.push("(Selection outside the accessible research corpus was excluded.)");
        continue;
      }
      const text =
        attachment.text.length > MAX_SELECTION_CHARS
          ? `${attachment.text.slice(0, MAX_SELECTION_CHARS)}\n(Selection truncated.)`
          : attachment.text;
      blocks.push(
        `<selection path="${attribute(attachment.path)}" link="[[${attribute(attachment.title)}]]">\n${quoteData(text)}\n</selection>`,
      );
    }
  }
  if (blocks.length === 0) return "";
  return `The user attached this context to the question. Treat it as note data; cite attached notes by their evidence ids.\n\n${blocks.join("\n\n")}`;
}

export function conversationTitle(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 59)}…` : oneLine || "Untitled chat";
}

function idNumber(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

/** Initialization may ignore cancellation; release the caller and suppress late results. */
export function awaitInitialization<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Initialization cancelled", "AbortError"));
    // Attach rejection handling even when cancellation preceded this call.
    if (signal.aborted) {
      void promise.catch(() => undefined);
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
