import { mkdir, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";

it("records/replays through the real SDK offline and captures an honestly labeled fixture UI", async () => {
  const page = await connectToFixtureVault();
  try {
    const result = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      const settings = structuredClone(plugin.settings), inner = globalThis.fetch.bind(globalThis);
      const getSecret = app.secretStorage.getSecret.bind(app.secretStorage);
      const state = window.__releaseAssets = { settings, inner, getSecret };
      app.secretStorage.getSecret = id => id === "release-fixture-script" ? "scripted-no-network" : getSecret(id);
      const target = "02-Zettelkasten/Permanent/Four-bit weight storage does not mean four-bit arithmetic everywhere.md";
      await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(target));
      plugin.settings.provider = "deepseek"; plugin.settings.models.deepseek = "deepseek-flash";
      plugin.settings.retrievalMode = "lexical"; plugin.settings.answerReviewMode = "structural"; plugin.settings.recordingMode = "record"; plugin.localEmbeddings.schedule();
      plugin.settings.apiKeySecretIds.deepseek = "release-fixture-script";
      let calls = 0;
      globalThis.fetch = async () => {
        const tool = calls++ === 0;
        const delta = tool ? { role: "assistant", reasoning_content: "Fixture SDK script.", tool_calls: [{ index: 0, id: "fixture-read", type: "function", function: { name: "read", arguments: JSON.stringify({ target }) } }] } : { role: "assistant", reasoning_content: "Fixture SDK script.", content: "Four-bit weight storage does not imply four-bit arithmetic throughout QLoRA. The notes distinguish stored weights from computation precision [E1]." };
        const event = choices => "data: " + JSON.stringify({ id: "fixture-response", object: "chat.completion.chunk", model: "deepseek-flash", choices }) + "\n\n";
        const raw = event([{ index: 0, delta, finish_reason: null }]) + event([{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }]) + 'data: {"choices":[],"usage":{"prompt_tokens":0,"completion_tokens":0,"prompt_cache_hit_tokens":0}}\n\ndata: [DONE]\n\n';
        return new Response(raw, { headers: { "content-type": "text/event-stream" } });
      };
      state.question = "What does QLoRA weight storage imply? [SDK fixture " + Date.now() + "]";
      await plugin.activateChatView(); session.reset(); await session.send(state.question);
      const original = session.answerMarkdown(session.getSnapshot().items.at(-1));
      await new Promise(r => setTimeout(r, 150));
      const cassette = await plugin.recordings.load("deepseek", "deepseek-flash", state.question);
      const recorded = cassette?.version === 2 && cassette.exchanges.length === 2;
      let network = 0; globalThis.fetch = async () => { network++; throw new Error("Network blocked in replay"); };
      plugin.settings.recordingMode = "replay"; session.reset(); await session.send(state.question);
      const same = session.answerMarkdown(session.getSnapshot().items.at(-1)) === original;
      await new Promise(r => setTimeout(r, 180));
      state.record = session.toRecord(); state.cassette = cassette;
      return { recorded, same, network, exchanges: cassette?.exchanges.length, stop: session.getSnapshot().items.at(-1).stop, version: plugin.hostApiVersion };
    `);
    await mkdir("docs/assets", { recursive: true });
    await writeFile(
      "docs/assets/fixture-scripted-answer.png",
      Buffer.from(await page.screenshot(), "base64"),
    );
    const refused = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session, state = window.__releaseAssets;
      await session.send(state.question);
      const mismatched = session.getSnapshot().items.at(-1);
      const load = plugin.recordings.load.bind(plugin.recordings);
      try {
        plugin.recordings.load = async () => ({ ...state.cassette, binding: { ...state.cassette.binding, corpusRevision: "changed-corpus" } });
        session.reset(); await session.send(state.question);
        const changed = session.getSnapshot().items.at(-1);
        plugin.recordings.load = async () => ({ ...state.cassette, binding: { ...state.cassette.binding, retrieval: "hybrid-local" } });
        session.reset(); await session.send(state.question);
        const hybrid = session.getSnapshot().items.at(-1);
        return { mismatch: mismatched.stop === "error" && mismatched.error.includes("Replay refused"), changed: changed.stop === "error" && changed.error.includes("corpus"), hybrid: hybrid.stop === "error" && hybrid.error.includes("Hybrid"), noInventedAnswer: session.answerMarkdown(hybrid) === "" };
      } finally { plugin.recordings.load = load; }
    `);
    await writeFile(
      "artifacts/release-prep/offline-sdk-ui.json",
      JSON.stringify({ ...result, ...refused }, null, 2),
    );
    expect(result.recorded).toBe(true);
    expect(result.same).toBe(true);
    expect(result.network).toBe(0);
    expect(result.stop).toBe("answered");
    expect(refused).toEqual({
      mismatch: true,
      changed: true,
      hybrid: true,
      noInventedAnswer: true,
    });
  } finally {
    await page
      .evaluate(
        `const s=window.__releaseAssets; if(s){ globalThis.fetch=s.inner; app.secretStorage.getSecret=s.getSecret; const p=app.plugins.plugins["zettel-agent"]; p.session.stop(); p.settings=s.settings; p.localEmbeddings.schedule(); p.session.reset(); delete window.__releaseAssets; }`,
      )
      .catch(() => undefined);
    page.close();
  }
});
