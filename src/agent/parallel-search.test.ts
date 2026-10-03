import { expect, it } from "vitest";
import { Corpus } from "../retrieval/corpus";
import { EvidenceLedger } from "./evidence";
import { runTurn } from "./loop";
import { prepareToolSearch } from "./tools";
import { ScriptedProvider, call, text } from "../testing/scripted-provider";
import type { SearchPort } from "../retrieval/local-search";
function setup() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("a.md", "# Alpha\n\nAlpha describes the first source.");
  corpus.upsert("b.md", "# Beta\n\nBeta describes the second source.");
  return { corpus, ledger: new EvidenceLedger() };
}
it("prepares at most two searches concurrently but commits evidence in request order", async () => {
  const context = setup();
  let running = 0,
    maximum = 0;
  const completed: string[] = [];
  const search: SearchPort = async (corpus, query) => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, query === "Alpha" ? 15 : 1));
    running--;
    completed.push(query);
    return {
      hits: corpus.search(query),
      mode: "lexical",
      revision: corpus.revision,
      candidateSemantics: "exact",
    };
  };
  const provider = new ScriptedProvider([
    [
      call("search", { query: "Alpha" }),
      call("search", { query: "Beta" }),
      call("read", { target: "E1" }),
    ],
    [text("Answer [E1, E2]")],
  ]);
  const result = await runTurn({
    provider,
    context: { ...context, search },
    history: [],
    userContent: "compare",
  });
  expect(maximum).toBe(2);
  expect(completed).toEqual(["Beta", "Alpha"]);
  expect(context.ledger.get("E1")?.path).toBe("a.md");
  expect(context.ledger.get("E2")?.path).toBe("b.md");
  expect(result.stop).toBe("answered");
  const results = result.messages.flatMap((m) =>
    m.role === "user" ? m.parts.filter((p) => p.type === "tool_result") : [],
  );
  expect(results[2]?.contract?.exposures[0]?.path).toBe("a.md");
});
it("does not prepare malformed/unknown/zero-output calls or exceed the call budget", async () => {
  const context = setup();
  let queries = 0;
  const search: SearchPort = (corpus, query) => {
    queries++;
    return Promise.resolve({
      hits: corpus.search(query),
      mode: "lexical",
      revision: corpus.revision,
      candidateSemantics: "exact",
    });
  };
  for (const [name, input] of [
    ["search", { query: "Alpha", bad: true }],
    ["write", { query: "Alpha" }],
  ] as const)
    expect(await prepareToolSearch(name, input, { ...context, search })).toBeUndefined();
  expect(
    await prepareToolSearch("search", { query: "Alpha" }, { ...context, search, maxChars: 0 }),
  ).toBeUndefined();
  const result = await runTurn({
    provider: new ScriptedProvider([
      [call("search", { query: "Alpha" }), call("search", { query: "Beta" })],
      [text("limited")],
    ]),
    context: { ...context, search },
    history: [],
    userContent: "q",
    budget: { maxRequests: 3, maxToolCalls: 1, maxToolChars: 100_000 },
  });
  expect(queries).toBe(1);
  expect(context.ledger.entries()).toHaveLength(1);
  expect(result.stop).toBe("budget_exhausted");
});
it("closes every pending result on cancellation without registering speculative evidence", async () => {
  const context = setup();
  const controller = new AbortController();
  let completed = 0;
  const search: SearchPort = async (corpus, query) => {
    if (query === "Alpha") controller.abort();
    await Promise.resolve();
    completed++;
    return {
      hits: corpus.search(query),
      mode: "lexical",
      revision: corpus.revision,
      candidateSemantics: "exact",
    };
  };
  const provider = new ScriptedProvider([
    [
      call("search", { query: "Alpha" }),
      call("search", { query: "Beta" }),
      call("read", { target: "E1" }),
    ],
  ]);
  const result = await runTurn({
    provider,
    context: { ...context, search },
    history: [],
    userContent: "q",
    signal: controller.signal,
  });
  expect(result.stop).toBe("aborted");
  expect(completed).toBe(1);
  expect(context.ledger.entries()).toEqual([]);
  const pending = result.messages.at(-1)?.parts.filter((p) => p.type === "tool_result");
  expect(pending).toHaveLength(3);
  expect(pending?.every((p) => p.isError)).toBe(true);
});
