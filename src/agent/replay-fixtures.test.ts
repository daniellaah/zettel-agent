import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { loadFixtureCorpus } from "../../eval/fixture-vault";
import { EvidenceLedger } from "./evidence";
import { runTurn } from "./loop";
import { createProvider } from "./providers";
import type { ProviderId } from "./providers/catalog";
import { replayFetch, type Cassette } from "./recording";

/**
 * Replays real recorded model responses (fixtures/recordings, made with
 * `E2E_RECORD=1 npm run e2e` and `npm run e2e:save-recordings`) through the real SDKs,
 * adapters, agent loop and tools against the fixture vault. No network, no Obsidian.
 *
 * It fails if an adapter can no longer parse a provider's real wire format, or if the loop
 * no longer consumes a recording exactly (a changed number of model requests).
 */

const DIR = path.resolve(import.meta.dirname, "../../fixtures/recordings");

function cassettes(): { file: string; cassette: Cassette }[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json.gz")) files.push(full);
    }
  };
  walk(DIR);
  return files.map((file) => ({
    file: path.relative(DIR, file),
    cassette: JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as Cassette,
  }));
}

const recorded = cassettes();
const corpus = loadFixtureCorpus();

describe.skipIf(recorded.length === 0)("recorded conversations replay offline", () => {
  it.each(recorded)("$file", async ({ cassette }) => {
    let requests = 0;
    const replay = replayFetch(cassette.exchanges, { eventDelayMs: 0 });
    const result = await runTurn({
      provider: createProvider(
        cassette.provider as ProviderId,
        "replay",
        cassette.model,
        (...args) => {
          requests++;
          return replay(...args);
        },
      ),
      context: { corpus, ledger: new EvidenceLedger() },
      history: [],
      userContent: cassette.question,
    });

    expect(result.error).toBeUndefined();
    expect(["answered", "budget_exhausted"]).toContain(result.stop);
    expect(result.answer.trim()).not.toBe("");
    expect(requests).toBe(cassette.exchanges.length);
  });
});
