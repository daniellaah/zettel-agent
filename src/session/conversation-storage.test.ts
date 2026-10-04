import { expect, it } from "vitest";
import type { ConversationRecord } from "./chat-session";
import { ConversationStorage, type StorageAdapter } from "./conversation-storage";
import { parseConversation, storageId } from "./storage-schema";

function memory() {
  const files = new Map<string, string>();
  let failRename = false;
  const adapter: StorageAdapter = {
    exists: (p) => Promise.resolve(files.has(p)),
    read: async (p) => {
      await Promise.resolve();
      if (!files.has(p)) throw new Error("missing");
      return files.get(p)!;
    },
    write: async (p, data) => {
      await Promise.resolve();
      files.set(p, data);
    },
    remove: async (p) => {
      await Promise.resolve();
      files.delete(p);
    },
    rename: async (a, b) => {
      await Promise.resolve();
      if (failRename) {
        failRename = false;
        throw new Error("interrupted");
      }
      files.set(b, files.get(a)!);
      files.delete(a);
    },
    mkdir: async (p) => {
      await Promise.resolve();
      files.set(p, "folder");
    },
    list: (p) => Promise.resolve({ files: [...files.keys()].filter((k) => k.startsWith(`${p}/`)) }),
  };
  return {
    files,
    store: new ConversationStorage(adapter, "plugin/chats"),
    interrupt: () => {
      failRename = true;
    },
  };
}
const record = (title = "old", updatedAt = "2026-10-02T00:00:00Z"): ConversationRecord => ({
  version: 1,
  id: "chat",
  title,
  createdAt: "2026-10-01",
  updatedAt,
  items: [],
  history: [],
  evidence: [],
});
it("serializes saves and snapshots the record at call time", async () => {
  await Promise.resolve();
  const { store } = memory();
  const old = record();
  const save = store.save(old);
  old.title = "mutated";
  await save;
  expect((await store.load("chat"))?.title).toBe("old");
  await Promise.all([store.save(record("one")), store.save(record("two", "2026-10-03"))]);
  expect(await store.list()).toEqual([
    { id: "chat", title: "two", updatedAt: "2026-10-03", questions: 0 },
  ]);
});
it("recovers interrupted replacement and backup; isolates malformed records and index", async () => {
  await Promise.resolve();
  const { store, files, interrupt } = memory();
  await store.save(record());
  interrupt();
  await expect(store.save(record("new", "2026-10-03"))).rejects.toThrow("interrupted");
  expect((await store.load("chat"))?.title).toBe("new");
  files.set("plugin/chats/bad.json", "{broken");
  files.set("plugin/chats/index.json", "[]");
  expect(await store.list()).toHaveLength(1);
  files.set("plugin/chats/chat.json.pending", "broken");
  expect((await store.load("chat"))?.title).toBe("old");
  expect(files.has("plugin/chats/bad.json")).toBe(true);
});
it("deletes every file of a chat and blocks path traversal", async () => {
  await Promise.resolve();
  const { store, files } = memory();
  await store.save(record());
  await store.save(record("new"));
  await store.delete("chat");
  expect(await store.load("chat")).toBeNull();
  expect([...files.keys()].filter((p) => p.includes("chat.json"))).toEqual([]);
  expect(() => store.load("../../outside")).toThrow();
  expect(() => store.delete("../escape")).toThrow();
  expect(() => storageId.parse("../escape")).toThrow();
});
it("validates version/shape and closes interrupted legacy UI snapshots", () => {
  expect(() => parseConversation({ ...record(), version: 3 })).toThrow();
  expect(() => parseConversation(record(), "different")).toThrow();
  const running = {
    ...record(),
    items: [
      {
        kind: "assistant",
        id: "a",
        status: "running",
        stop: null,
        error: null,
        historyStart: 0,
        citations: null,
        usage: null,
        parts: [{ kind: "tool", id: "t", name: "read", input: {}, summary: null, isError: false }],
      },
    ],
  };
  expect(parseConversation(running).items[0]).toMatchObject({ status: "done", stop: "aborted" });
});

it("rejects malformed delivery metadata and unpaired saved tools while preserving signed raw data", () => {
  const call = {
    role: "assistant",
    parts: [{ type: "tool_call", id: "t", name: "read", input: {} }],
    raw: { provider: "deepseek", model: "m", content: { reasoning_content: "signed fixture" } },
  };
  const result = {
    role: "user",
    parts: [{ type: "tool_result", callId: "t", content: "fixture", isError: false }],
  };
  const valid = { ...record(), history: [call, result] };
  expect(parseConversation(valid).history).toEqual(valid.history);
  expect(() => parseConversation({ ...record(), history: [call] })).toThrow("unfinished");
  expect(() => parseConversation({ ...record(), history: [result] })).toThrow("Unmatched");
  expect(() =>
    parseConversation({
      ...record(),
      history: [{ role: "user", parts: [], deliveries: [{ exposures: null }] }],
    }),
  ).toThrow();
});
