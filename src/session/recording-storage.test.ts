import { expect, it } from "vitest";
import { RecordingStorage } from "./recording-storage";
import type { StorageAdapter } from "./recoverable-storage";
import type { Cassette } from "../agent/recording";
it("keeps separate recording runs, refuses incomplete old snapshots and isolates corrupt entries", async () => {
  const files = new Map<string, string>();
  const adapter: StorageAdapter = {
    exists: (p) => Promise.resolve(files.has(p)),
    read: (p) => Promise.resolve(files.get(p)!),
    write: (p, s) => Promise.resolve(void files.set(p, s)),
    remove: (p) => Promise.resolve(void files.delete(p)),
    rename: (a, b) => {
      files.set(b, files.get(a)!);
      files.delete(a);
      return Promise.resolve();
    },
    mkdir: (p) => Promise.resolve(void files.set(p, "folder")),
    list: (p) => Promise.resolve({ files: [...files.keys()].filter((f) => f.startsWith(`${p}/`)) }),
  };
  const store = new RecordingStorage(adapter, "plugin/recordings");
  const first: Cassette = {
    version: 2,
    binding: { corpusRevision: "fixture", retrieval: "bm25", reviewMode: "structural" },
    provider: "deepseek",
    model: "m",
    question: "Same question",
    recordedAt: "2026-10-02T00:00:00Z",
    exchanges: [],
  };
  const exchange = {
    url: "https://api.deepseek.com/chat/completions",
    requestBody: {},
    status: 200,
    contentType: "application/json",
    body: "{}",
  };
  const newer = { ...first, recordedAt: "2026-10-02T01:00:00Z", exchanges: [exchange] };
  await Promise.all([store.save(newer), store.save({ ...first, exchanges: [exchange, exchange] })]);
  expect((await store.load("deepseek", "m", "Same question"))?.recordedAt).toBe(newer.recordedAt);
  await expect(store.save(first)).rejects.toThrow("more complete");
  files.set("plugin/recordings/v2/deepseek/corrupt.json", "{invalid");
  expect(await store.questions("deepseek", "m")).toEqual(["Same question"]);
  expect([...files.keys()].filter((f) => f.endsWith(".json"))).toHaveLength(3);
  expect(() => store.load("../../escape", "m", "q")).toThrow();
});
