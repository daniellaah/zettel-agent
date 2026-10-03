import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { embeddingCacheDirectory, FileEmbeddingCache } from "./vector-cache";
import type { VectorRecord } from "../src/retrieval/vector";

it("selects host cache locations outside vault storage", () => {
  expect(embeddingCacheDirectory("darwin", "/home/user")).toBe(
    "/home/user/Library/Caches/zettel-agent/embeddings/v1",
  );
  expect(embeddingCacheDirectory("linux", "/home/user")).toBe(
    "/home/user/.cache/zettel-agent/embeddings/v1",
  );
  expect(embeddingCacheDirectory("linux", "/home/user", "/cache")).toBe(
    "/cache/zettel-agent/embeddings/v1",
  );
  expect(embeddingCacheDirectory("win32", "/home/user")).toContain("AppData/Local");
});
it("persists validated records atomically, prunes obsolete entries and blocks vault/symlink writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zettel-vector-test-"));
  try {
    const vault = path.join(root, "vault");
    await mkdir(vault);
    await expect(FileEmbeddingCache.open(path.join(vault, "cache"), vault)).rejects.toThrow(
      "outside",
    );
    await symlink(vault, path.join(root, "alias"));
    await expect(FileEmbeddingCache.open(path.join(root, "alias/cache"), vault)).rejects.toThrow(
      "outside",
    );
    const cacheDir = path.join(root, "cache");
    const cache = await FileEmbeddingCache.open(cacheDir, vault);
    const record: VectorRecord = {
      key: "00112233445566",
      path: "a.md",
      sectionId: "a",
      contentHash: "1",
      representationVersion: "1",
      modelIdentity: "fake",
      input: "text",
      vector: [1, 0],
    };
    expect(await cache.get(record.key)).toBeUndefined();
    await cache.put(record);
    expect(await (await FileEmbeddingCache.open(cacheDir, vault)).get(record.key)).toEqual(record);
    expect(await readdir(cacheDir)).toEqual([`${record.key}.json`]);
    await expect(cache.get("../secret")).rejects.toThrow("key");
    await expect(cache.put({ ...record, vector: [NaN] })).rejects.toThrow();
    await writeFile(
      path.join(cacheDir, `${record.key}.json`),
      JSON.stringify({ ...record, key: "abcdef01234567" }),
    );
    await expect(cache.get(record.key)).rejects.toThrow("mismatch");
    await cache.put(record);
    await cache.retain(new Set());
    expect(await readdir(cacheDir)).toEqual([]);
    await symlink(path.join(vault, "file.json"), path.join(cacheDir, `${record.key}.json`));
    await expect(cache.get(record.key)).rejects.toThrow("Symlink");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
