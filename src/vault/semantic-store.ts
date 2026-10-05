import { requestUrl, type App } from "obsidian";

import type { FetchLike } from "../agent/provider";
import type { VectorStore } from "../retrieval/semantic-indexer";

/**
 * Fetch through Obsidian's request API, which is not subject to the browser's CORS rules,
 * so a default Ollama install answers without extra configuration.
 */
export const obsidianFetch: FetchLike = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const response = await requestUrl({
    url,
    method: init?.method ?? "GET",
    ...(typeof init?.body === "string" && { body: init.body, contentType: "application/json" }),
    throw: false,
  });
  return new Response(response.arrayBuffer, { status: response.status });
};

/** Vectors in one file in the plugin folder; never inside the user's notes. */
export class AdapterVectorStore implements VectorStore {
  constructor(
    private readonly app: App,
    private readonly path: string,
  ) {}

  async load(): Promise<Uint8Array | null> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.path))) return null;
    return new Uint8Array(await adapter.readBinary(this.path));
  }

  async save(bytes: Uint8Array): Promise<void> {
    const adapter = this.app.vault.adapter;
    const folder = this.path.slice(0, this.path.lastIndexOf("/"));
    if (folder && !(await adapter.exists(folder))) await adapter.mkdir(folder);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await adapter.writeBinary(this.path, copy.buffer);
  }
}
