import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Minimal Chrome DevTools Protocol client for Obsidian's renderer. Obsidian must be
 * started with `--remote-debugging-port` (see obsidian.ts).
 */

export const DEBUG_PORT = 9222;
const PAGE_DIR = path.join(import.meta.dirname, "page");

interface CdpResponse {
  id: number;
  result?: {
    result?: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  error?: { message: string };
}

export class ObsidianPage {
  private nextId = 0;
  private readonly pending = new Map<number, (response: CdpResponse) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as CdpResponse;
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
    };
  }

  /** WebSocket URLs of all Obsidian windows (one per open vault). */
  static async windows(): Promise<string[]> {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const targets = (await response.json()) as {
      type: string;
      url: string;
      webSocketDebuggerUrl: string;
    }[];
    return targets
      .filter((t) => t.type === "page" && t.url.startsWith("app://obsidian.md"))
      .map((t) => t.webSocketDebuggerUrl);
  }

  static async connect(webSocketUrl: string): Promise<ObsidianPage> {
    const socket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("Could not connect to Obsidian over CDP."));
    });
    return new ObsidianPage(socket);
  }

  /** Evaluates an async function body in the page and returns its JSON result. */
  async evaluate<T>(body: string, args: unknown = {}): Promise<T> {
    const expression = `(async () => { const args = ${JSON.stringify(args)};\n${body}\n})()`;
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 600_000,
    });
    const details = response.result?.exceptionDetails;
    if (details) throw new Error(details.exception?.description ?? details.text);
    if (response.error) throw new Error(response.error.message);
    return response.result?.result?.value as T;
  }

  /** Runs a script from e2e/page/ with `args` in scope. */
  run<T>(script: string, args: unknown = {}): Promise<T> {
    return this.evaluate<T>(readFileSync(path.join(PAGE_DIR, `${script}.js`), "utf8"), args);
  }

  close(): void {
    this.socket.close();
  }

  private send(method: string, params: Record<string, unknown>): Promise<CdpResponse> {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}
