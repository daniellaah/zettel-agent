import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamHandlers,
} from "../src/agent/provider";

export interface ModelExchange {
  request: ModelRequest;
  response: ModelResponse;
}

/** Provider-neutral requests contain note data but no HTTP headers or API keys. */
export class RecordedProvider implements ModelProvider {
  readonly exchanges: ModelExchange[] = [];
  constructor(private readonly inner: ModelProvider) {}
  get provider() {
    return this.inner.provider;
  }
  get model() {
    return this.inner.model;
  }
  async send(request: ModelRequest, handlers: StreamHandlers, signal?: AbortSignal) {
    const saved = structuredClone(request);
    const response = await this.inner.send(request, handlers, signal);
    this.exchanges.push({ request: saved, response: structuredClone(response) });
    return response;
  }
  describeError(error: unknown) {
    return this.inner.describeError(error);
  }
}

/** Replay must match the actual prompt, history, schemas and tool results exactly. */
export class StrictReplayProvider implements ModelProvider {
  private next = 0;
  constructor(
    readonly provider: string,
    readonly model: string,
    private readonly exchanges: ModelExchange[],
  ) {}
  get remaining() {
    return this.exchanges.length - this.next;
  }
  send(
    request: ModelRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    if (signal?.aborted) return Promise.reject(new Error("Replay aborted"));
    const exchange = this.exchanges[this.next];
    if (!exchange) return Promise.reject(new Error("Replay exhausted"));
    if (JSON.stringify(request) !== JSON.stringify(exchange.request))
      return Promise.reject(
        new Error(`Replay request ${this.next + 1} changed; record this implementation again`),
      );
    this.next++;
    for (const part of exchange.response.message.parts) {
      if (part.type === "text") handlers.onText(part.text);
      if (part.type === "thinking") handlers.onThinking(part.text);
    }
    return Promise.resolve(structuredClone(exchange.response));
  }
  describeError(error: unknown) {
    return error instanceof Error ? error.message : "Replay failed";
  }
}
