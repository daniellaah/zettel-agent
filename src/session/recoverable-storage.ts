/** Minimal Obsidian adapter subset. Storage belongs to the host, never an Agent tool. */
export interface StorageAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[] }>;
}

/** Serialize reads/mutations as well as writes; failed operations do not poison the queue. */
export class SerialStorage {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export async function ensureStorageFolder(adapter: StorageAdapter, folder: string): Promise<void> {
  const parts = folder.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    if (!(await adapter.exists(path))) await adapter.mkdir(path);
  }
}

/** Keep the last committed file and a complete pending payload recoverable at every step. */
export async function recoverableWrite(
  adapter: StorageAdapter,
  path: string,
  data: string,
): Promise<void> {
  await ensureStorageFolder(adapter, path.slice(0, path.lastIndexOf("/")));
  await adapter.write(`${path}.pending`, data);
  if (await adapter.exists(path)) {
    await adapter.write(`${path}.bak`, await adapter.read(path));
    await adapter.remove(path);
  }
  await adapter.rename(`${path}.pending`, path);
}

/** A valid pending write is newer than the committed copy; malformed files are retained. */
export async function recoverableRead<T>(
  adapter: StorageAdapter,
  path: string,
  parse: (value: unknown) => T,
  notify: (message: string) => void = () => {},
): Promise<T | null> {
  let damaged = false;
  for (const candidate of [`${path}.pending`, path, `${path}.bak`]) {
    if (!(await adapter.exists(candidate))) continue;
    try {
      const record = parse(JSON.parse(await adapter.read(candidate)) as unknown);
      if (candidate !== path || damaged)
        notify(
          "Recovered saved data after an interrupted or damaged write. Recovery files were retained.",
        );
      return record;
    } catch {
      damaged = true;
    }
  }
  if (damaged) throw new Error("Saved data is damaged. Original files were retained for recovery.");
  return null;
}
