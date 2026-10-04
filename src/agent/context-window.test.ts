import { expect, it } from "vitest";
import { Corpus } from "../retrieval/corpus";
import { EvidenceLedger } from "./evidence";
import { estimateInput, selectContext } from "./context-window";
import { executeTool } from "./tools";
import { userText, type ChatMessage } from "./messages";
import { call, text, ScriptedProvider } from "../testing/scripted-provider";
import { runTurn } from "./loop";
function setup() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("a.md", "# Evidence\n\nA sufficiently detailed historical source.");
  const outcome = executeTool("read", { target: "a.md" }, { corpus, ledger: new EvidenceLedger() });
  const history: ChatMessage[] = [
    userText("old question " + "x".repeat(20_000)),
    {
      role: "assistant",
      parts: [call("read", { target: "a.md" })],
      raw: { provider: "test", model: "test", content: "signed-block" },
    },
    {
      role: "user",
      origin: "control",
      parts: [
        {
          type: "tool_result",
          callId: "c",
          content: outcome.content,
          isError: false,
          contract: outcome.contract!,
        },
      ],
    },
    { role: "assistant", parts: [text("old answer [E1]")] },
    userText("recent question"),
    { role: "assistant", parts: [text("recent answer")] },
  ];
  return { corpus, history };
}
it("keeps whole turns and raw replay unchanged, while archiving bodies without fabrication", () => {
  const { corpus, history } = setup();
  const before = structuredClone(history);
  const selected = selectContext({
    system: "system",
    history,
    current: [userText("now")],
    corpus,
    maxInputTokens: 5000,
  });
  expect(selected.diagnostics).toMatchObject({ omittedTurns: 1, fits: true });
  expect(selected.messages.slice(1)).toEqual([...history.slice(4), userText("now")]);
  expect(selected.messages[0]).toMatchObject({ origin: "control" });
  expect(JSON.stringify(selected.messages[0])).toContain("Archived IDs require a new read");
  expect(JSON.stringify(selected.messages[0])).not.toContain(
    "A sufficiently detailed historical source.",
  );
  expect(history).toEqual(before);
  expect(
    selectContext({ system: "s", history, current: [userText("now")], corpus }).messages,
  ).toEqual([...history, userText("now")]);
});
it("detects changed and deleted sources and stops rather than splitting a too-large current turn", () => {
  const { corpus, history } = setup();
  corpus.remove("a.md");
  const selected = selectContext({ system: "s", history, current: [userText("now")], corpus });
  expect(selected.diagnostics.staleEvidence).toEqual(["E1"]);
  expect(JSON.stringify(selected.messages[0])).toContain("changed sources require re-reading");
  expect(
    selectContext({
      system: "s",
      history,
      current: [userText("x".repeat(6000))],
      corpus,
      maxInputTokens: 5000,
    }).diagnostics.fits,
  ).toBe(false);
});
it("accounts for Unicode bytes and raw content while ignoring duplicate provenance", () => {
  const { corpus, history } = setup();
  const result = selectContext({ system: "s", history, current: [], corpus });
  expect(estimateInput("s", [userText("中")])).toBeGreaterThan(estimateInput("s", [userText("a")]));
  const assistant = history[1]!;
  const huge: ChatMessage = {
    ...(assistant as Extract<ChatMessage, { role: "assistant" }>),
    raw: { provider: "p", model: "m", content: "x".repeat(30_000) },
  };
  expect(estimateInput("s", [huge])).toBeGreaterThan(30_000);
  expect(result.diagnostics.estimatedTokens).toBe(estimateInput("s", result.messages));
});
it("enforces the request input allowance before calling a provider", async () => {
  const { corpus } = setup();
  const provider = new ScriptedProvider([[text("should not run")]]);
  const result = await runTurn({
    provider,
    context: { corpus, ledger: new EvidenceLedger() },
    history: [],
    userContent: "x".repeat(10_000),
    budget: { maxRequests: 10, maxToolCalls: 30, maxToolChars: 120_000, maxInputTokens: 8000 },
  });
  expect(result.stop).toBe("budget_exhausted");
  expect(provider.requests).toHaveLength(0);
  expect(result.context?.fits).toBe(false);
});
