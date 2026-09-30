// Copies complete cassettes recorded in the fixture vault (E2E_RECORD=1 npm run e2e) into
// fixtures/recordings/<provider>/*.json.gz, where the replay tests pick them up. Cassettes
// hold request bodies and responses only; the e2e suite checks they contain no API key.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "fixtures/vault/.obsidian/plugins/zettel-agent/recordings");
const target = path.join(root, "fixtures/recordings");

// A stream that ended normally: Chat Completions, Anthropic Messages, OpenAI Responses.
const COMPLETE = /data: \[DONE\]|"type":"message_stop"|"type":"response\.completed"/;

if (!existsSync(source)) {
  console.error("No recordings yet. Run: E2E_RECORD=1 npm run e2e");
  process.exit(1);
}
for (const provider of readdirSync(source)) {
  let saved = 0;
  let skipped = 0;
  mkdirSync(path.join(target, provider), { recursive: true });
  for (const file of readdirSync(path.join(source, provider)).filter((f) => f.endsWith(".json"))) {
    const text = readFileSync(path.join(source, provider, file), "utf8");
    const cassette = JSON.parse(text);
    const complete =
      cassette.exchanges.length > 0 &&
      cassette.exchanges.every((e) => e.status === 200 && COMPLETE.test(e.body));
    if (!complete) {
      skipped++;
      continue;
    }
    writeFileSync(path.join(target, provider, `${file}.gz`), gzipSync(text, { level: 9 }));
    saved++;
  }
  console.log(`${provider}: saved ${saved}, skipped ${skipped} incomplete or failed`);
}
