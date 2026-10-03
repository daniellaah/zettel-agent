import { cassetteFileName, normalizeQuestion, type Cassette } from "../agent/recording";
import { parseCassette } from "../agent/cassette-schema";
import { hash } from "../retrieval/markdown";
import {
  SerialStorage,
  recoverableRead,
  recoverableWrite,
  type StorageAdapter,
} from "./recoverable-storage";

/** Separate files per recording run keep late old streams from replacing newer runs. */
export class RecordingStorage {
  private readonly queue = new SerialStorage();
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly dir: string,
    private readonly notify: (message: string) => void = () => {},
  ) {}
  save(cassette: Cassette): Promise<void> {
    const snapshot = parseCassette(structuredClone(cassette));
    const relative = cassetteFileName(snapshot.provider, snapshot.model, snapshot.question).replace(
      /\.json$/,
      `-${hash(snapshot.recordedAt)}.json`,
    );
    const path = `${this.dir}/v2/${relative}`;
    return this.queue.run(async () => {
      const previous = await recoverableRead(this.adapter, path, parseCassette);
      if (previous && previous.exchanges.length > snapshot.exchanges.length)
        throw new Error("Refusing to replace a more complete recording.");
      await recoverableWrite(this.adapter, path, JSON.stringify(snapshot, null, 2));
    });
  }
  load(provider: string, model: string, question: string): Promise<Cassette | null> {
    cassetteFileName(provider, model, question);
    return this.queue.run(
      async () =>
        (await this.list(provider, model)).find(
          (c) => normalizeQuestion(c.question) === normalizeQuestion(question),
        ) ?? null,
    );
  }
  questions(provider: string, model: string): Promise<string[]> {
    cassetteFileName(provider, model, "");
    return this.queue.run(async () => [
      ...new Set(
        (await this.list(provider, model))
          .filter((c) => c.exchanges.length > 0)
          .map((c) => c.question),
      ),
    ]);
  }
  private async list(provider: string, model: string): Promise<Cassette[]> {
    const folder = `${this.dir}/v2/${provider}`;
    if (!(await this.adapter.exists(folder))) return [];
    const { files } = await this.adapter.list(folder);
    const bases = new Set(
      files
        .filter(
          (f) =>
            f.startsWith(`${folder}/`) &&
            /^[^/]+\.json(?:\.bak|\.pending)?$/.test(f.slice(folder.length + 1)),
        )
        .map((f) => f.replace(/\.(bak|pending)$/, "")),
    );
    const cassettes: Cassette[] = [];
    for (const file of bases) {
      try {
        const cassette = await recoverableRead(this.adapter, file, parseCassette, this.notify);
        if (cassette?.provider === provider && cassette.model === model) cassettes.push(cassette);
      } catch {
        this.notify("A damaged recording was skipped; its files were retained.");
      }
    }
    return cassettes.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }
}
