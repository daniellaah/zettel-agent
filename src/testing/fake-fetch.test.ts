import { expect, it } from "vitest";

import { replayFetch } from "./fake-fetch";

it("serves responses in order, records request bodies and fails when they run out", async () => {
  const requests: unknown[] = [];
  const fetch = replayFetch(
    [
      { body: "a", contentType: "application/json" },
      { body: "b", contentType: "application/json" },
    ],
    requests,
  );
  expect(await (await fetch("u", { body: '{"q":1}' })).text()).toBe("a");
  expect(await (await fetch("u")).text()).toBe("b");
  expect(requests).toEqual([{ q: 1 }, null]);
  await expect(fetch("u")).rejects.toThrow(/no more responses/);
});

it("streams SSE one event per chunk and honours abort", async () => {
  const controller = new AbortController();
  const fetch = replayFetch([{ body: "data: 1\n\ndata: 2\n\n" }]);
  const reader = (await fetch("u", { signal: controller.signal })).body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: 1\n\n");
  controller.abort();
  await expect(reader.read()).rejects.toThrow(/aborted/);
  await expect(fetch("u", { signal: controller.signal })).rejects.toThrow(/aborted/);
});
