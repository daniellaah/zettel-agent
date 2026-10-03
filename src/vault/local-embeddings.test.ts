import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({
  FileSystemAdapter: class {
    constructor(private readonly root: string) {}
    getBasePath() {
      return this.root;
    }
  },
}));
import { FileSystemAdapter, type App } from "obsidian";
import { LocalEmbeddings } from "./local-embeddings";
import { Corpus } from "../retrieval/corpus";
import { resolveSettings } from "../settings";
import { OLLAMA_MODEL } from "../retrieval/ollama";

it("keeps maintenance outside query execution, incrementally caches, invalidates and disables network in Replay", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zettel-host-test-"));
  const vaultRoot = path.join(root, "vault");
  await mkdir(vaultRoot);
  const settings = resolveSettings({ retrievalMode: "hybrid" });
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("P/One.md", "# One\nRecall improves with practice.");
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const texts = init?.body ? (JSON.parse(init.body as string) as { input: string[] }).input : [];
    return Promise.resolve(
      new Response(
        JSON.stringify(
          url.endsWith("tags")
            ? { models: [{ name: OLLAMA_MODEL, digest: "a".repeat(64) }] }
            : {
                embeddings: texts.map(() => [1, ...Array<number>(1023).fill(0)]),
                prompt_eval_count: 20,
              },
        ),
      ),
    );
  });
  const app = {
    vault: { adapter: Object.assign(new FileSystemAdapter(), { getBasePath: () => vaultRoot }) },
  } as unknown as App;
  const host = new LocalEmbeddings(
    app,
    () => settings,
    () => corpus,
    () => Promise.resolve(),
    { cacheRoot: path.join(root, "cache"), fetch: fetcher },
  );
  try {
    expect((await host.search(corpus, "Recall", {})).fallback).toContain("Not built");
    expect(fetcher).not.toHaveBeenCalled();
    await host.rebuild();
    expect(host.status).toContain("1 encoded locally");
    expect((await host.search(corpus, "memory", {})).mode).toBe("hybrid");
    await host.rebuild();
    expect(host.status).toContain("1 cached, 0 encoded");
    corpus.upsert("P/One.md", "# One\nChanged evidence.");
    expect((await host.search(corpus, "Changed", {})).fallback).toContain("stale");
    await host.rebuild();
    expect(host.status).toContain("1 encoded locally");
    const calls = fetcher.mock.calls.length;
    settings.recordingMode = "replay";
    await host.rebuild();
    expect((await host.search(corpus, "Changed", {})).mode).toBe("lexical");
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(await readdir(vaultRoot)).toEqual([]);
  } finally {
    host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
