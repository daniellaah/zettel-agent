import { z } from "zod";
import type { ConversationRecord } from "./chat-session";

export const storageId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
  .refine((id) => id !== "index", "Reserved storage name");
const evidenceSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  path: z.string(),
  sectionId: z.string(),
  headingPath: z.array(z.string()),
  contentHash: z.string(),
  linkPath: z.string().optional(),
});
const contractSchema = z.looseObject({
  version: z.literal(1),
  tool: z.string(),
  scope: z.literal("accessible-research-corpus"),
  effective: z.record(z.string(), z.unknown()),
  revision: z.string(),
  returned: z.object({
    count: z.number().nonnegative(),
    unit: z.enum(["notes", "sections", "lines", "neighbors"]),
  }),
  candidates: z.object({
    count: z.number().nonnegative().nullable(),
    semantics: z.enum(["exact", "lower-bound", "unknown"]),
  }),
  hasMore: z.boolean(),
  truncated: z.boolean(),
  exposures: z.array(
    evidenceSchema.extend({
      scope: z.enum([
        "title",
        "metadata",
        "preview",
        "excerpt",
        "body",
        "matched-line",
        "graph",
        "outline",
      ]),
      text: z.string(),
      wholeSection: z.boolean(),
      start: z.number().optional(),
      end: z.number().optional(),
      line: z.number().optional(),
    }),
  ),
});
const text = z.looseObject({ type: z.literal("text"), text: z.string() });
const call = z.looseObject({
  type: z.literal("tool_call"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
const result = z.looseObject({
  type: z.literal("tool_result"),
  callId: z.string(),
  content: z.string(),
  isError: z.boolean(),
  contract: contractSchema.optional(),
});
const attachment = z.union([
  z.object({ kind: z.literal("note"), path: z.string(), title: z.string() }),
  z.object({ kind: z.literal("selection"), path: z.string(), title: z.string(), text: z.string() }),
]);
const recordSchema = z.looseObject({
  version: z.literal(1),
  id: storageId,
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(
    z.union([
      z.looseObject({
        kind: z.literal("user"),
        id: z.string(),
        text: z.string(),
        attachments: z.array(attachment),
      }),
      z.looseObject({
        kind: z.literal("assistant"),
        id: z.string(),
        status: z.enum(["running", "done"]),
        citations: z
          .object({ valid: z.array(z.string()), unknown: z.array(z.string()) })
          .nullable(),
        usage: z
          .object({
            requests: z.number(),
            toolCalls: z.number(),
            inputTokens: z.number(),
            outputTokens: z.number(),
            cacheReadTokens: z.number(),
            cacheWriteTokens: z.number(),
          })
          .nullable(),
        reliability: z
          .looseObject({
            mode: z.enum(["structural", "self-review"]),
            status: z.string(),
            issues: z.array(z.unknown()),
          })
          .optional(),
        context: z.looseObject({ omittedTurns: z.number() }).optional(),
        historyStart: z.number().int().nonnegative(),
        error: z.string().nullable(),
        stop: z.string().nullable(),
        parts: z.array(
          z.union([
            z.object({ kind: z.enum(["text", "thinking"]), text: z.string() }),
            z.object({
              kind: z.literal("tool"),
              id: z.string(),
              name: z.string(),
              input: z.unknown(),
              summary: z.string().nullable(),
              isError: z.boolean(),
            }),
          ]),
        ),
      }),
    ]),
  ),
  history: z.array(
    z.union([
      z.looseObject({
        role: z.literal("user"),
        parts: z.array(z.union([text, result])),
        deliveries: z.array(contractSchema).optional(),
      }),
      z.looseObject({
        role: z.literal("assistant"),
        parts: z.array(
          z.union([text, call, z.object({ type: z.literal("thinking"), text: z.string() })]),
        ),
      }),
    ]),
  ),
  evidence: z.array(evidenceSchema),
});

/** Validate the persisted v1 shape, preserving raw/provider and later optional audit fields. */
export function parseConversation(value: unknown, expectedId?: string): ConversationRecord {
  const record = recordSchema.parse(value) as unknown as ConversationRecord;
  if (expectedId && record.id !== expectedId)
    throw new Error("Chat identity does not match its file.");
  if (
    !Number.isFinite(Date.parse(record.createdAt)) ||
    !Number.isFinite(Date.parse(record.updatedAt))
  )
    throw new Error("Invalid chat timestamp.");
  const pending = new Set<string>();
  for (const message of record.history) {
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        if (pending.has(part.id)) throw new Error("Duplicate pending tool call in saved history.");
        pending.add(part.id);
      } else if (part.type === "tool_result") {
        if (!pending.delete(part.callId))
          throw new Error("Unmatched tool result in saved history.");
      }
    }
  }
  if (pending.size) throw new Error("Saved history contains unfinished tool calls.");
  // Interrupted UI snapshots never reopen as permanently running turns.
  record.items = record.items.map((item) =>
    item.kind === "assistant" && item.status === "running"
      ? {
          ...item,
          status: "done",
          stop: "aborted",
          parts: item.parts.map((part) =>
            part.kind === "tool" && part.summary === null
              ? { ...part, summary: "Interrupted before storage completed.", isError: true }
              : part,
          ),
        }
      : item,
  );
  return record;
}
