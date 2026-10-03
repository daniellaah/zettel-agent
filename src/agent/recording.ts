import { hash } from "../retrieval/markdown";

/**
 * Offline record/replay at the HTTP level. A recording `fetch` wraps the real one and keeps
 * each request body and raw response (SSE stream or JSON); a replaying `fetch` serves those
 * responses back in order. Because replay goes through the real SDKs and adapters, it runs
 * everything except the network: parsing, the agent loop, tools, and the UI.
 *
 * Request headers are never recorded, so API keys never reach a cassette.
 */

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface Exchange {
  url: string;
  requestBody: unknown;
  status: number;
  contentType: string;
  /** The raw response body: an SSE stream for streamed requests. */
  body: string;
}

export interface Cassette {
  version: 1 | 2;
  binding?: { corpusRevision: string; retrieval: "bm25" | "hybrid-local"; reviewMode: string };
  provider: string;
  model: string;
  question: string;
  recordedAt: string;
  exchanges: Exchange[];
}

/** File name for a question's cassette: readable prefix plus a stable hash. */
export function cassetteFileName(provider: string, model: string, question: string): string {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(provider)) throw new Error("Invalid recording provider.");
  const normalized = normalizeQuestion(question);
  const slug = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${provider}/${slug || "question"}-${hash(`${provider}\n${model}\n${normalized}`)}.json`;
}

export function normalizeQuestion(question: string): string {
  return question.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Wraps `inner`, reporting every exchange to `onExchange` without delaying the stream. */
export function recordingFetch(
  inner: FetchLike,
  onExchange: (exchange: Exchange) => void,
): FetchLike {
  return async (input, init) => {
    const response = await inner(input, init);
    const copy = response.clone();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    void copy.text().then(
      (body) =>
        onExchange({
          url,
          requestBody: parseBody(init?.body),
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body,
        }),
      () => undefined, // An aborted stream is simply not recorded.
    );
    return response;
  };
}

export interface ReplayOptions {
  /** Compare the complete wire request, including history, system, tools and delivered evidence. */
  strict?: boolean;
  /** Longest pause between SSE events, so replies still appear to stream. */
  eventDelayMs?: number;
  /** Upper bound on how long one response takes to replay, however many events it has. */
  maxResponseMs?: number;
}

/** Serves recorded exchanges in order; fails clearly when the recording runs out. */
export function replayFetch(exchanges: Exchange[], options: ReplayOptions = {}): FetchLike {
  const queue = [...exchanges];
  const maxDelay = options.eventDelayMs ?? 15;
  const maxResponseMs = options.maxResponseMs ?? 1500;
  return (input, init) => {
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortError());
    const exchange = queue.shift();
    if (!exchange) {
      return Promise.reject(
        new Error("The recording has no more responses. Record this question again."),
      );
    }
    if (options.strict) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (
        url !== exchange.url ||
        canonicalRequest(parseBody(init?.body)) !== canonicalRequest(exchange.requestBody)
      ) {
        return Promise.reject(
          new Error(
            "Replay refused: request, history, prompt or delivered evidence differs from this recording. No network was used.",
          ),
        );
      }
    }
    const chunks = exchange.contentType.includes("event-stream")
      ? exchange.body.split(/(?<=\n\n)/)
      : [exchange.body];
    // Token-per-event streams have thousands of events. Send them in at most
    // maxResponseMs / maxDelay batches, pausing maxDelay between batches, so a response
    // takes at most maxResponseMs even where timers are clamped (browsers: >= 4 ms).
    const pauses = maxDelay > 0 ? Math.max(1, Math.floor(maxResponseMs / maxDelay)) : 0;
    const batchSize = pauses > 0 ? Math.ceil(chunks.length / pauses) : chunks.length;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const onAbort = () => controller.error(abortError());
        signal?.addEventListener("abort", onAbort, { once: true });
        for (let i = 0; i < chunks.length; i += batchSize) {
          if (signal?.aborted) return;
          controller.enqueue(encoder.encode(chunks.slice(i, i + batchSize).join("")));
          if (pauses > 0) await new Promise((resolve) => setTimeout(resolve, maxDelay));
        }
        signal?.removeEventListener("abort", onAbort);
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(body, {
        status: exchange.status,
        headers: { "content-type": exchange.contentType || "application/json" },
      }),
    );
  };
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function abortError(): Error {
  return new DOMException("The request was aborted.", "AbortError");
}

/** Stable JSON identity tolerates object key order, never different values/array order. */
export function canonicalRequest(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRequest).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalRequest((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

/** UI replay cannot reproduce hybrid ranking without making local network calls. */
export function validateReplayBinding(
  cassette: Cassette,
  corpusRevision: string,
  reviewMode: string,
): void {
  if (cassette.version !== 2 || !cassette.binding)
    throw new Error(
      "Legacy recording has no evidence binding. Retained for historical SDK tests; record a new v2 session to replay in the plugin.",
    );
  if (
    cassette.binding.corpusRevision !== corpusRevision ||
    cassette.binding.reviewMode !== reviewMode
  )
    throw new Error("Replay refused: research corpus or answer-check mode changed.");
  if (cassette.binding.retrieval !== "bm25")
    throw new Error(
      "Hybrid recording cannot be safely replayed with BM25. Record a BM25 session for offline replay.",
    );
}
