import { z } from "zod";

import type { ConversationRecord } from "./chat-session";

/** Chat ids name files in the plugin folder, so they are limited to a safe file-name subset. */
export const storageId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)), {
  message: "Invalid chat timestamp.",
});

const evidence = z.looseObject({
  id: z.string().regex(/^E\d+$/),
  path: z.string(),
  sectionId: z.string(),
  headingPath: z.array(z.string()),
  contentHash: z.string(),
});

const contract = z.looseObject({
  tool: z.string(),
  exposures: z.array(evidence.extend({ scope: z.string(), text: z.string() })),
});

const messagePart = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("text"), text: z.string() }),
  z.looseObject({ type: z.literal("thinking"), text: z.string() }),
  z.looseObject({ type: z.literal("tool_call"), id: z.string(), name: z.string() }),
  z.looseObject({
    type: z.literal("tool_result"),
    callId: z.string(),
    content: z.string(),
    isError: z.boolean(),
    contract: contract.optional(),
  }),
]);

const item = z.discriminatedUnion("kind", [
  z.looseObject({
    kind: z.literal("user"),
    id: z.string(),
    text: z.string(),
    attachments: z.array(
      z.looseObject({ kind: z.enum(["note", "selection"]), path: z.string(), title: z.string() }),
    ),
  }),
  z.looseObject({
    kind: z.literal("assistant"),
    id: z.string(),
    status: z.enum(["running", "done"]),
    historyStart: z.number().int().nonnegative(),
    parts: z.array(z.looseObject({ kind: z.enum(["text", "thinking", "tool"]) })),
  }),
]);

const recordSchema = z.looseObject({
  version: z.literal(1),
  id: storageId,
  title: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  items: z.array(item),
  history: z.array(
    z.looseObject({
      role: z.enum(["user", "assistant"]),
      parts: z.array(messagePart),
      deliveries: z.array(contract).optional(),
    }),
  ),
  evidence: z.array(evidence),
});

/**
 * Checks a saved chat before it is shown or continued. Unknown fields (provider raw content)
 * pass through untouched. Every tool call must have its result, or the next request to the
 * model would be rejected. A turn saved while running reopens as stopped.
 */
export function parseConversation(value: unknown, expectedId?: string): ConversationRecord {
  const record = recordSchema.parse(value) as unknown as ConversationRecord;
  if (expectedId && record.id !== expectedId) {
    throw new Error("Chat identity does not match its file.");
  }
  const pending = new Set<string>();
  for (const message of record.history) {
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        if (pending.has(part.id)) throw new Error("Duplicate pending tool call in saved history.");
        pending.add(part.id);
      } else if (part.type === "tool_result" && !pending.delete(part.callId)) {
        throw new Error("Unmatched tool result in saved history.");
      }
    }
  }
  if (pending.size) throw new Error("Saved history contains unfinished tool calls.");
  record.items = record.items.map((entry) =>
    entry.kind === "assistant" && entry.status === "running"
      ? {
          ...entry,
          status: "done",
          stop: "aborted",
          parts: entry.parts.map((part) =>
            part.kind === "tool" && part.summary === null
              ? { ...part, summary: "Interrupted before the chat was saved.", isError: true }
              : part,
          ),
        }
      : entry,
  );
  return record;
}
