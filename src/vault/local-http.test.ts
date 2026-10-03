import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  callback: undefined as ((response: unknown) => void) | undefined,
}));
vi.mock("node:http", () => ({
  request: vi.fn((_url, _options, callback: (response: unknown) => void) => {
    harness.callback = callback;
    return request;
  }),
}));
const request = Object.assign(new EventEmitter(), {
  write: vi.fn(),
  end: vi.fn(),
  setTimeout: vi.fn(),
  destroy: vi.fn((error: Error) => {
    request.emit("error", error);
    request.emit("close");
    return request;
  }),
});
import { localOllamaFetch } from "./local-http";

it("rejects remote embedding routes and HTTP redirects", async () => {
  for (const url of [
    "http://evil.example/api/embed",
    "http://localhost:11434/api/pull",
    "http://localhost:11434/api/embed?x=1",
    "http://u:p@localhost:11434/api/embed",
  ])
    await expect(localOllamaFetch(url)).rejects.toThrow();
  const pending = localOllamaFetch("http://localhost:11434/api/tags");
  const response = Object.assign(new EventEmitter(), { statusCode: 302 });
  harness.callback!(response);
  response.emit("end");
  await expect(pending).rejects.toThrow("redirects");
});
it("collects local JSON responses and cancels the underlying socket", async () => {
  const pending = localOllamaFetch("http://localhost:11434/api/embed", {
    method: "POST",
    body: '{"input":"text"}',
  });
  const response = Object.assign(new EventEmitter(), { statusCode: 200 });
  harness.callback!(response);
  response.emit("data", Buffer.from('{"embeddings":[]}'));
  response.emit("end");
  expect(await (await pending).json()).toEqual({ embeddings: [] });
  expect(request.write).toHaveBeenCalledWith('{"input":"text"}');
  const controller = new AbortController();
  const cancelled = localOllamaFetch("http://localhost:11434/api/embed", {
    signal: controller.signal,
  });
  controller.abort(new Error("cancelled"));
  await expect(cancelled).rejects.toThrow("cancelled");
  expect(request.destroy).toHaveBeenCalled();
});
