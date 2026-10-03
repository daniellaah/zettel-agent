import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";
import { RELEASE_SCENARIOS } from "./release-scenarios";
import type { Attempt } from "../eval/release-allowance";

it.runIf(process.env.E2E_RELEASE_LIVE === "1")(
  "runs only the frozen bounded release smoke",
  async () => {
    const directory = path.resolve(
      "artifacts/release-prep",
      `live-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    await mkdir(directory, { recursive: true });
    const selected = process.env.E2E_RELEASE_SCENARIOS?.split(",");
    const scenarios = selected
      ? RELEASE_SCENARIOS.filter((s) => selected.includes(s.id))
      : RELEASE_SCENARIOS;
    if (!scenarios.length || selected?.some((id) => !scenarios.some((s) => s.id === id)))
      throw new Error("Select only frozen release scenario IDs.");
    const previousRuns = (await readdir(path.resolve("artifacts/release-prep")))
      .filter((name) => name.startsWith("live-") && name !== path.basename(directory))
      .sort();
    const latestPrevious = previousRuns.at(-1);
    if (latestPrevious && (!selected || !process.env.E2E_RELEASE_PRIOR_RUN))
      throw new Error(
        "Existing live runs require targeted scenario IDs and their latest cumulative accounting; use offline replay otherwise.",
      );
    let priorAttempts: Attempt[] = [];
    if (process.env.E2E_RELEASE_PRIOR_RUN) {
      const previous = await realpath(process.env.E2E_RELEASE_PRIOR_RUN);
      if (!previous.startsWith(path.resolve("artifacts/release-prep") + path.sep))
        throw new Error("Previous allowance must come from the local release-prep artifacts.");
      if (path.basename(previous) !== latestPrevious)
        throw new Error("Paid reruns must inherit the latest run, including all earlier charges.");
      const previousChecks = JSON.parse(
        await readFile(path.join(previous, "checks.json"), "utf8"),
      ) as { attempts: Attempt[] };
      priorAttempts = previousChecks.attempts;
    } else if (selected) {
      throw new Error("A targeted paid rerun requires cumulative accounting from its prior run.");
    }
    const budget = await build({
      entryPoints: ["eval/release-allowance.ts"],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "ZettelReleaseBudget",
    });
    const page = await connectToFixtureVault();
    try {
      const setup = await page.evaluate<{
        key: boolean;
        version: string;
        revision: string;
      }>(
        `${budget.outputFiles[0]!.text}
      const plugin = app.plugins.plugins["zettel-agent"];
      const saved = structuredClone(plugin.settings);
      const inner = globalThis.fetch.bind(globalThis);
      const state = window.__releaseSmoke = { saved, inner, budget: new ZettelReleaseBudget.ReleaseAllowance(), current: "setup", exchanges: {}, pending: [], results: [] };
      state.budget.attempts.push(...args.priorAttempts);
      if (state.budget.attempts.length >= 120 || state.budget.accountedUsd >= 5) throw new Error("Prior paid allowance exhausted.");
      plugin.settings.provider = "deepseek"; plugin.settings.models.deepseek = "deepseek-flash";
      plugin.settings.retrievalMode = "lexical"; plugin.settings.answerReviewMode = "structural"; plugin.settings.recordingMode = "off";
      plugin.localEmbeddings.schedule(); await plugin.vaultCorpus.whenReady();
      globalThis.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url !== "https://api.deepseek.com/chat/completions") throw new Error("Unplanned network request refused by release harness.");
        const attempt = state.budget.begin(state.current + "@" + args.run, init?.body ?? "");
        try {
          const response = await inner(input, init), copy = response.clone();
          const pending = copy.text().then(body => {
            state.budget.finish(attempt, response.status, body);
            (state.exchanges[state.currentForAttempt.get(attempt)] ??= []).push({ url, requestBody: JSON.parse(init.body), status: response.status, contentType: response.headers.get("content-type") ?? "", body });
          }, () => state.budget.finish(attempt, response.status, null));
          state.pending.push(pending); return response;
        } catch { state.budget.finish(attempt, null, null); throw new Error("Release provider request failed or was cancelled."); }
      };
      // Capture scenario identity before later UI turns can change it.
      state.currentForAttempt = new Map();
      const begin = state.budget.begin.bind(state.budget);
      state.budget.begin = (id, body) => { const a = begin(id, body); state.currentForAttempt.set(a, state.current); return a; };
      await plugin.activateChatView(); plugin.session.reset();
      const id = plugin.settings.apiKeySecretIds.deepseek;
      return { key: !!(id && app.secretStorage.getSecret(id)), version: plugin.hostApiVersion, revision: plugin.vaultCorpus.current.revision };
    `,
        { priorAttempts, run: path.basename(directory) },
      );
      await writeFile(path.join(directory, "preflight.json"), JSON.stringify(setup, null, 2));
      expect(setup.key, "Fixture DeepSeek secret must already be configured").toBe(true);
      for (const scenario of scenarios) {
        const result = await page.evaluate<Record<string, unknown>>(
          String.raw`
        const state = window.__releaseSmoke, plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
        state.current = args.id; if (args.reset) session.reset();
        plugin.settings.models.deepseek = args.wrongModel ? "zettel-release-invalid-model" : "deepseek-flash";
        plugin.settings.answerReviewMode = args.review ? "self-review" : "structural";
        const before = state.budget.attempts.length, start = Date.now(), activePath = plugin.activeNotePath();
        const turn = session.send(args.question);
        if (args.cancel) {
          while (state.budget.attempts.length === before && session.getSnapshot().running && Date.now() - start < 10000) await new Promise(r => setTimeout(r, 10));
          session.stop();
        }
        await turn; await Promise.allSettled(state.pending);
        await new Promise(r => setTimeout(r, 180));
        const item = session.getSnapshot().items.at(-1);
        const record = session.toRecord();
        const result = { id: args.id, activePath, stop: item.stop, error: item.error, answer: session.answerMarkdown(item), assistant: item, record, running: session.getSnapshot().running, latencyMs: Date.now() - start, httpRequests: state.budget.attempts.length - before, attempts: state.budget.attempts, accountedUsd: state.budget.accountedUsd, exchanges: state.exchanges[args.id] ?? [], mode: "bm25", version: plugin.hostApiVersion };
        state.results.push(result); return result;
      `,
          scenario,
        );
        await writeFile(
          path.join(directory, `scenario-${scenario.id}.json`),
          JSON.stringify(result, null, 2),
        );
        console.log(
          `release smoke ${scenario.id}: stop=${String(result.stop)}, requests=${String(result.httpRequests)}, cumulative reserved/peak USD=${String(result.accountedUsd)}`,
        );
        // Keep failures and proceed to independent gates; never alter the frozen input.
        if (scenario.id === "1" && result.stop === "answered") {
          await mkdir("docs/assets", { recursive: true });
          await writeFile(
            "docs/assets/fixture-answer.png",
            Buffer.from(await page.screenshot(), "base64"),
          );
        }
      }
      const checks = await page.evaluate<Record<string, unknown>>(String.raw`
      const state = window.__releaseSmoke, plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      const original = session.toRecord();
      const saved = await plugin.conversations.load(original.id);
      const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
      const history = !!saved && canonical(saved.history) === canonical(original.history);
      session.reset(); if (saved) session.load(saved);
      const restored = session.answerMarkdown(session.getSnapshot().items.at(-1)) === state.results.at(-1).answer;
      const view = app.workspace.getLeavesOfType("zettel-agent-chat")[0].view, host = view.createHost();
      const evidence = original.evidence[0]; if (evidence) host.openEvidence(evidence.id, false);
      await new Promise(r => setTimeout(r, 100));
      const clicked = !evidence || app.workspace.getMostRecentLeaf()?.view?.file?.path === evidence.path;
      // Replay uses SDK/loop/tools; captured requests include delivered evidence and history.
      const load = plugin.recordings.load.bind(plugin.recordings);
      let network = 0; globalThis.fetch = async () => { network++; throw new Error("Replay network refused"); };
      const replay = [], activeNote = session.deps.activeNotePath;
      try {
        for (const live of state.results) {
          if (!["answered", "budget_exhausted"].includes(live.stop)) continue;
          session.deps.activeNotePath = () => live.activePath;
          const follow = live.id === "3";
          if (!follow) session.reset();
          plugin.settings.models.deepseek = "deepseek-flash"; plugin.settings.answerReviewMode = live.id === "8" ? "self-review" : "structural"; plugin.settings.recordingMode = "replay";
          plugin.recordings.load = async () => ({ version: 2, provider: "deepseek", model: "deepseek-flash", question: live.record.items.filter(i => i.kind === "user").at(-1).text, recordedAt: new Date().toISOString(), binding: { corpusRevision: plugin.vaultCorpus.current.revision, retrieval: "bm25", reviewMode: plugin.settings.answerReviewMode }, exchanges: live.exchanges });
          await session.send(live.record.items.filter(i => i.kind === "user").at(-1).text);
          const item = session.getSnapshot().items.at(-1);
          replay.push({ id: live.id, stop: item.stop, sameAnswer: session.answerMarkdown(item) === live.answer, error: item.error });
        }
      } finally { plugin.recordings.load = load; session.deps.activeNotePath = activeNote; }
      return { history, restored, clicked, network, replay, attempts: state.budget.attempts, accountedUsd: state.budget.accountedUsd };
    `);
      await writeFile(path.join(directory, "checks.json"), JSON.stringify(checks, null, 2));
      expect(checks.network).toBe(0);
      expect(checks.history).toBe(true);
      expect(checks.restored).toBe(true);
      expect(checks.clicked).toBe(true);
    } finally {
      await page
        .evaluate(
          `const s = window.__releaseSmoke; if (s) { globalThis.fetch = s.inner; const p = app.plugins.plugins["zettel-agent"]; p.session.stop(); p.settings = s.saved; p.localEmbeddings.schedule(); p.session.reset(); delete window.__releaseSmoke; }`,
        )
        .catch(() => undefined);
      page.close();
      console.log(`Release smoke artifacts: ${directory}`);
    }
  },
);
