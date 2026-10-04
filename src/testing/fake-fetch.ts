import type { FetchLike } from "../agent/provider";

/** One recorded HTTP response, as stored in fixtures/recordings. */
export interface RecordedResponse {
  status?: number;
  contentType?: string;
  /** The raw body: an SSE stream for streamed requests. */
  body: string;
}

/** A recorded conversation in fixtures/recordings/<provider>/*.json.gz. */
export interface Cassette {
  provider: string;
  model: string;
  question: string;
  exchanges: (RecordedResponse & { url: string; requestBody: unknown })[];
}

/**
 * A fetch that serves canned responses in order, so tests run the real SDKs, adapters and
 * loop with no network. SSE bodies arrive one event per chunk; aborting errors the stream.
 * Each request body is parsed and pushed to `requests`.
 */
export function replayFetch(responses: readonly RecordedResponse[], requests: unknown[] = []) {
  const queue = [...responses];
  const fetch: FetchLike = (_input, init) => {
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortError());
    const next = queue.shift();
    if (!next) return Promise.reject(new Error("The recording has no more responses."));
    requests.push(typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null);
    const contentType = next.contentType ?? "text/event-stream";
    const chunks = contentType.includes("event-stream")
      ? next.body.split(/(?<=\n\n)/)
      : [next.body];
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener("abort", () => controller.error(abortError()), { once: true });
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(body, { status: next.status ?? 200, headers: { "content-type": contentType } }),
    );
  };
  return fetch;
}

function abortError(): Error {
  return new DOMException("The request was aborted.", "AbortError");
}
