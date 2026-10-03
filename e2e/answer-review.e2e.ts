import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";

/** Actual plugin/session/UI, scripted model; proves mechanics, not model answer quality. */
it("repairs a buffered draft, persists its audit and fails closed on malformed self-review", async () => {
  const page = await connectToFixtureVault();
  try {
    const result = await page.evaluate<Record<string, unknown>>(`
      const plugin = app.plugins.plugins["zettel-agent"];
      const session = plugin.session;
      const saved = { mode: plugin.settings.answerReviewMode, provider: session.deps.provider, store: session.deps.store, search: session.deps.search };
      const filesBefore = app.vault.getMarkdownFiles().map(f => f.path).sort();
      try {
        plugin.settings.answerReviewMode = "self-review";
        session.deps.store = { save: async () => {} };
        const target = plugin.vaultCorpus.current.paths()[0];
        let requestCount = 0, reviewCount = 0;
        const response = (parts, finish = "end") => ({ message: { role: "assistant", parts }, finish, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } });
        const scripted = {
          provider: "scripted", model: "review-e2e", describeError: e => String(e),
          send: async (request, handlers) => {
            requestCount++;
            if (request.system.includes("same-model self-review")) {
              const packet = JSON.parse(request.messages[0].parts[0].text);
              const accepted = ++reviewCount === 2;
              return response([{ type: "text", text: JSON.stringify({
                units: packet.units.map(unit => ({ index: unit.index, basis: "notes", verdict: accepted ? "supported" : "unsupported", reason: "The complete statement must be bound to the delivered source scope.", support: accepted ? [{ id: "E1", quote: packet.evidence.find(s => s.id === "E1" && s.scope === "body").text.slice(0, 80) }] : [], searches: [] })),
                coverage: [{ question: "What source was delivered?", status: accepted ? "answered" : "missing", units: [0], disclosed: accepted }],
                actions: accepted ? [] : [{ tool: "read", target }]
              }) }]);
            }
            if (requestCount === 1) return response([{ type: "tool_call", id: "initial-read", name: "read", input: { target } }], "tool_calls");
            const answer = requestCount === 2 ? "UNCHECKED_DRAFT [E1]." : "Delivered source excerpt [E1].";
            handlers.onText(answer);
            return response([{ type: "text", text: answer }]);
          }
        };
        session.deps.provider = async () => scripted;
        await plugin.activateChatView();
        session.reset();
        await session.send("What source was delivered?");
        await new Promise(resolve => setTimeout(resolve, 100));
        const accepted = session.getSnapshot().items.at(-1);
        const rendered = document.querySelector(".za-message-assistant")?.textContent ?? "";
        const record = session.toRecord();
        const preserved = JSON.stringify(record.history).includes("UNCHECKED_DRAFT");
        session.reset(); session.load(record);
        const restored = session.getSnapshot().items.at(-1).reliability;
        session.reset();
        session.deps.provider = async () => ({ ...scripted, send: async (request, handlers) => {
          const answer = request.system.includes("same-model self-review") ? "{}" : "UNCHECKED_FAILURE";
          handlers.onText(answer);
          return response([{ type: "text", text: answer }]);
        }});
        await session.send("Fail closed test");
        const failed = session.getSnapshot().items.at(-1);
        session.reset();
        let abortStep = 0;
        session.deps.search = () => { session.stop(); return Promise.reject(new Error("cancel repair")); };
        session.deps.provider = async () => ({ ...scripted, send: async (request, handlers) => {
          if (request.system.includes("same-model self-review")) return response([{ type: "text", text: JSON.stringify({ units: [{ index: 0, basis: "notes", verdict: "unsupported", reason: "The statement requires source verification before delivery.", support: [], searches: [] }], coverage: [{ question: "Source?", status: "missing", units: [0], disclosed: false }], actions: [{ tool: "search", query: "source" }] }) }]);
          if (abortStep++ === 0) return response([{ type: "tool_call", id: "abort-read", name: "read", input: { target } }], "tool_calls");
          handlers.onText("UNCHECKED_ABORT [E1].");
          return response([{ type: "text", text: "UNCHECKED_ABORT [E1]." }]);
        }});
        await session.send("Cancel repair search test");
        const aborted = session.getSnapshot().items.at(-1);
        const cancelledTrace = aborted.parts.filter(part => part.kind === "tool").at(-1);
        app.setting.open(); app.setting.openTabById("zettel-agent");
        const settingsVisible = app.setting.activeTab.containerEl.textContent.includes("Answer checks");
        app.setting.close();
        return { requests: requestCount, acceptedStatus: accepted.reliability.status, attempts: accepted.reliability.attempts.length, tools: accepted.usage.toolCalls, renderedBadge: rendered.includes("same model"), hiddenDraft: !rendered.includes("UNCHECKED_DRAFT"), preserved, restoredStatus: restored.status, failedStatus: failed.reliability.status, failedAnswer: session.answerMarkdown(failed), failedRequests: failed.usage.requests, abortedStop: aborted.stop, cancelledTraceClosed: cancelledTrace.isError && cancelledTrace.summary.includes("interrupted"), settingsVisible, filesUnchanged: JSON.stringify(filesBefore) === JSON.stringify(app.vault.getMarkdownFiles().map(f => f.path).sort()) };
      } finally {
        plugin.settings.answerReviewMode = saved.mode;
        session.deps.provider = saved.provider;
        session.deps.store = saved.store;
        session.deps.search = saved.search;
        session.reset();
      }
    `);
    expect(result).toMatchObject({
      requests: 5,
      acceptedStatus: "self-reviewed",
      attempts: 2,
      tools: 2,
      renderedBadge: true,
      hiddenDraft: true,
      preserved: true,
      restoredStatus: "self-reviewed",
      failedStatus: "failed",
      failedRequests: 4,
      abortedStop: "aborted",
      cancelledTraceClosed: true,
      settingsVisible: true,
      filesUnchanged: true,
    });
    expect(result.failedAnswer).not.toContain("UNCHECKED_FAILURE");
  } finally {
    page.close();
  }
});
