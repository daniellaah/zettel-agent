import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { EmbeddingCache, VectorRecord } from "../retrieval/vector";

const recordSchema = z
  .object({
    key: z.string().regex(/^[a-f0-9]{14}$/),
    path: z.string(),
    sectionId: z.string(),
    contentHash: z.string(),
    representationVersion: z.string(),
    modelIdentity: z.string(),
    input: z.string(),
    vector: z.array(z.number().finite()),
  })
  .strict();

/** Host-managed default, separate from every Obsidian vault and its plugin folder. */
export function embeddingCacheDirectory(platform: string, home: string, xdgCache?: string): string {
  const root =
    platform === "darwin"
      ? path.join(home, "Library/Caches")
      : platform === "win32"
        ? path.join(home, "AppData/Local")
        : (xdgCache ?? path.join(home, ".cache"));
  return path.join(root, "zettel-agent/embeddings/v1");
}

/** Host maintenance adapter; never exposed to the Agent query port. */
export class FileEmbeddingCache implements EmbeddingCache {
  private constructor(private readonly directory: string) {}
  static async open(directory: string, vaultRoot: string): Promise<FileEmbeddingCache> {
    const cachePath = await canonicalDestination(path.resolve(directory));
    const vaultPath = await canonicalDestination(path.resolve(vaultRoot));
    if (cachePath === vaultPath || cachePath.startsWith(`${vaultPath}${path.sep}`))
      throw new Error("Embedding cache must be outside the vault file tree");
    await mkdir(cachePath, { recursive: true, mode: 0o700 });
    // Re-check after creation in case an existing parent was a symlink.
    if ((await realpath(cachePath)) !== cachePath) throw new Error("Cache destination changed");
    return new FileEmbeddingCache(cachePath);
  }
  async get(key: string): Promise<VectorRecord | undefined> {
    const file = this.file(key);
    try {
      if ((await lstat(file)).isSymbolicLink()) throw new Error("Symlink cache entry rejected");
      const record = recordSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (record.key !== key) throw new Error("Cache key mismatch");
      return record;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }
  async put(record: VectorRecord): Promise<void> {
    recordSchema.parse(record);
    const destination = this.file(record.key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async retain(keys: ReadonlySet<string>): Promise<void> {
    for (const file of await readdir(this.directory)) {
      const matched = /^([a-f0-9]{14})\.json$/.exec(file);
      if (matched && !keys.has(matched[1]!))
        await rm(path.join(this.directory, file), { force: true });
    }
  }
  private file(key: string): string {
    if (!/^[a-f0-9]{14}$/.test(key)) throw new Error("Invalid cache key");
    return path.join(this.directory, `${key}.json`);
  }
}

/** Resolves symlinks in the nearest existing ancestor before writing a new directory. */
async function canonicalDestination(destination: string): Promise<string> {
  try {
    return await realpath(destination);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const parent = path.dirname(destination);
    if (parent === destination) throw error;
    return path.join(await canonicalDestination(parent), path.basename(destination));
  }
}
