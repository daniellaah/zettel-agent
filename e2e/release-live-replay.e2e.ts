import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";

it.runIf(!!process.env.E2E_RELEASE_REPLAY_RUN)(
  "strictly replays saved live answers without paid calls",
  async () => {
    const directory = await realpath(process.env.E2E_RELEASE_REPLAY_RUN!);
    if (!directory.startsWith(path.resolve("artifacts/release-prep") + path.sep))
      throw new Error("Replay requires a local release-prep run.");
    const ids = (process.env.E2E_RELEASE_REPLAY_IDS ?? "1,2,3,4,6,7,8").split(",");
    const lives = await Promise.all(
      ids.map(
        async (id) =>
          JSON.parse(await readFile(path.join(directory, `scenario-${id}.json`), "utf8")) as Record<
            string,
            unknown
          >,
      ),
    );
    if (process.env.E2E_RELEASE_REPLAY_EXTRA_RUN) {
      const extra = await realpath(process.env.E2E_RELEASE_REPLAY_EXTRA_RUN);
      if (!extra.startsWith(path.resolve("artifacts/release-prep") + path.sep))
        throw new Error("Additional replay requires a local release-prep run.");
      lives.push(
        JSON.parse(await readFile(path.join(extra, "scenario-5.json"), "utf8")) as Record<
          string,
          unknown
        >,
      );
    }
    const output = path.resolve(
      "artifacts/release-prep",
      `replay-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    await mkdir(output, { recursive: true });
    const page = await connectToFixtureVault();
    try {
      const checks = await page.evaluate<{
        storedHistory: unknown;
        originalHistory: unknown;
        restored: boolean;
        clicked: boolean;
        network: number;
        replay: { id: string; stop: string; sameAnswer: boolean; error: string | null }[];
      }>(
        String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      const savedSettings = structuredClone(plugin.settings), inner = globalThis.fetch;
      const load = plugin.recordings.load.bind(plugin.recordings), active = session.deps.activeNotePath;
      let network = 0;
      globalThis.fetch = async () => { network++; throw new Error("Offline acceptance refuses all network."); };
      try {
        plugin.settings.provider = "deepseek"; plugin.settings.models.deepseek = "deepseek-flash";
        plugin.settings.retrievalMode = "lexical"; plugin.localEmbeddings.schedule(); await plugin.vaultCorpus.whenReady();
        await plugin.activateChatView(); session.reset();
        const last = args.lives.at(-1), persisted = await plugin.conversations.load(last.record.id);
        if (persisted) session.load(persisted);
        const restored = !!persisted && session.answerMarkdown(session.getSnapshot().items.at(-1)) === last.answer;
        const evidence = last.record.evidence[0];
        const host = app.workspace.getLeavesOfType("zettel-agent-chat")[0].view.createHost();
        if (evidence) host.openEvidence(evidence.id,false);
        await new Promise(r=>setTimeout(r,100));
        const clicked = !evidence || app.workspace.getMostRecentLeaf()?.view?.file?.path === evidence.path;
        const replay = [];
        for (const live of args.lives) {
          session.deps.activeNotePath = () => live.activePath;
          if (live.id !== "3") session.reset();
          plugin.settings.answerReviewMode = live.id === "8" ? "self-review" : "structural";
          plugin.settings.recordingMode = "replay";
          plugin.recordings.load = async () => ({version:2,provider:"deepseek",model:"deepseek-flash",question:live.record.items.filter(i=>i.kind==="user").at(-1).text,recordedAt:new Date().toISOString(),binding:{corpusRevision:plugin.vaultCorpus.current.revision,retrieval:"bm25",reviewMode:plugin.settings.answerReviewMode},exchanges:live.exchanges});
          await session.send(live.record.items.filter(i=>i.kind==="user").at(-1).text);
          const item = session.getSnapshot().items.at(-1);
          replay.push({id:live.id,stop:item.stop,sameAnswer:session.answerMarkdown(item)===live.answer,error:item.error});
        }
        return {storedHistory:persisted?.history,originalHistory:last.record.history,restored,clicked,network,replay};
      } finally {
        plugin.recordings.load = load; session.deps.activeNotePath = active;
        globalThis.fetch = inner; session.stop(); plugin.settings = savedSettings; plugin.localEmbeddings.schedule(); session.reset();
      }
    `,
        { lives },
      );
      await writeFile(path.join(output, "checks.json"), JSON.stringify(checks, null, 2));
      expect(checks.network).toBe(0);
      expect(checks.storedHistory).toEqual(checks.originalHistory);
      expect(checks.restored).toBe(true);
      expect(checks.clicked).toBe(true);
      for (const replay of checks.replay) {
        expect(replay.sameAnswer, `Scenario ${replay.id}: ${replay.error ?? replay.stop}`).toBe(
          true,
        );
        expect(replay.error).toBeNull();
      }
    } finally {
      page.close();
      console.log(`Offline live replay artifacts: ${output}`);
    }
  },
);
