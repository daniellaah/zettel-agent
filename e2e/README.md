# End-to-end tests

These tests run the real plugin inside a real Obsidian window against live model APIs. The test runner controls Obsidian over the Chrome DevTools Protocol, sending questions through the chat, reading back what the plugin rendered, and clicking elements the way a user would.

```bash
npm run e2e                                  # the provider selected in settings
E2E_PROVIDERS=deepseek,anthropic npm run e2e # several providers, one report each
E2E_KEEP_OBSIDIAN=1 npm run e2e              # leave Obsidian on the debugging port afterwards
```

## What a run does

1. **Build.** `main.js` is built into `fixtures/vault/.obsidian/plugins/zettel-agent/`, and the plugin is enabled for that vault.
2. **Launch.** If nothing is listening on port 9222, Obsidian is restarted with `--remote-debugging-port=9222`, which binds to 127.0.0.1 only. The fixture vault is then opened.
3. **Connect.** The runner attaches only to the window whose vault is `fixtures/vault`. It never runs code in the window of any other vault.
4. **Test.** The plugin is reloaded and the test files run:
   - `plugin.e2e.ts` makes no model calls. It checks indexing by stage, the settings tab, the empty chat view, and the error shown when an API key is missing.
   - `note-creation.e2e.ts` makes no model calls. It creates each note type through the command and dialog, checks the opened editor, source selection and indexing (fleeting captures are created but excluded), and exercises cancellation, duplicate names, invalid titles and blocked destination folders.
   - `agent.e2e.ts` runs once for each selected provider. It asks the questions listed in `scenarios.ts`, then checks the rendered chat, citation and link clicks, and insert-at-cursor. Scenario expected paths and the attachment target must exist in the current frozen corpus; an offline unit test protects that boundary. A normal answer and the reserved final answer after request-budget exhaustion are both valid terminal states for mechanics checks. It attaches context through the composer (`@`, the open-note chip and a selection), clicks retry, and reopens a chat from history after reloading the plugin. It also checks stopping and continuing, unresolved links, offline record and replay, and a wrong model name.
5. **Restore.** Obsidian is restarted normally, which closes the debugging port. This happens only if the run opened the port in step 2, and not when `E2E_KEEP_OBSIDIAN=1` is set.

## Assertions and reports

Behaviour that should never vary between runs is asserted. For example: a stopped turn can be continued, citations turn into chips, an inserted answer contains `[[links]]` instead of `[E#]` markers, and clicking an unresolved link never creates a note.

Answer quality varies by model and by run, so it is recorded rather than asserted. After each provider finishes, the runner prints a table with one row per scenario:

- how the turn stopped;
- the share of expected notes the answer cited;
- tool calls;
- citations the model invented;
- tokens;
- time.

Full records are written to `e2e/reports/` (git-ignored). Compare these reports across providers and prompt changes.

## Recording real traffic for offline tests

```bash
E2E_RECORD=1 npm run e2e        # record every scenario's model responses
npm run e2e:save-recordings     # copy them into fixtures/recordings/
npm test                        # replay them offline (src/agent/replay-fixtures.test.ts)
```

A run always checks recording and replay inside Obsidian as well. It records one question, then replays it with the network watched. The replay must give the same answer and the same tool calls, and make no network calls. The cassette must not contain the API key.

## Requirements and safety

- **Platform:** macOS. The runner uses `osascript` and `open`.
- **API keys:** set the key for each provider you test in the fixture vault's plugin settings. A provider without a key is skipped. The tests check only that a key exists; they never read it.
- **Cost:** full provider suites can make many SDK requests per question and are not a fixed-price smoke. The new bounded release harness guards actual HTTP attempts, usage and unknown reservations. Never use the default full suite for the limited release allowance.
- **Vault changes:** the insert test creates a temporary note at the vault root and moves it to the fixture vault's git-ignored `.trash/` folder straight away. Creation tests own a fresh temporary folder, delete only that folder in cleanup, and restore the original folder settings in memory. Other settings changes, such as switching provider or setting a wrong model name, also stay in memory and are restored after each test.

`e2e/page/*.js` holds the code that runs inside Obsidian. Each file is the body of an async function with `args` in scope. Because these files are fragments, ESLint and Prettier skip them.

## Current scenario scope

The nine UI smoke scenarios now refer to the 318-note technical learning corpus. Old fixture-only references to deleted learning-science notes and fleeting injections have been removed. Prompt injection and adversarial contradictions use the separate `eval/robustness/cases.json` in-memory suite, rather than being planted in the frozen learning notes. Historical recordings remain regression material for their original corpus; their citation-hit numbers do not describe the current dataset.

## Free Agentic RAG checks

The targeted command below uses scripted answer providers and genuine local Ollama embeddings, with no paid model APIs. It restarts Obsidian against the fixture vault and restores normal startup. It does not execute live-provider or note-creation tests.

```bash
E2E_LOCAL_EMBEDDINGS=1 npm run e2e -- e2e/plugin.e2e.ts e2e/answer-review.e2e.ts e2e/local-retrieval.e2e.ts
```

`answer-review.e2e.ts` covers buffered drafts, targeted repair, re-review, audit restoration, failed-draft suppression and the opt-in setting. These are mechanics checks; scripted verdicts provide no evidence of actual model entailment or attack resistance. Full live-provider E2E remains a separate paid phase.

## First public-test preparation (2026-10-02)

Run the deterministic fixture suite explicitly; it uses scripted answer responses,
real SDK parsing and an already-installed local Ollama model/cache where available.
No runtime/model is installed or downloaded, and no remote model is called:

```bash
npm run e2e -- e2e/plugin.e2e.ts e2e/release-safety.e2e.ts \
  e2e/release-assets.e2e.ts e2e/release-local.e2e.ts e2e/answer-review.e2e.ts
```

Safety cases create/delete only their own temporary fixture files and restore the
frozen filenames. Copy/Insert are explicit UI actions. Real-adapter recovery uses
isolated plugin storage. SDK Record/Replay uses a fake key and scripted HTTP SSE,
checks matching requests and zero network, refuses request/corpus/hybrid mismatch,
and captures the honestly captioned real fixture screenshot. A scripted response
is not a real model compatibility or quality result.

`release-local.e2e.ts` probes the existing loopback service, reuses the normal
vault-partitioned cache, checks warm reuse and disclosed unavailable-service BM25
fallback. Local provider charges are zero; hardware/electricity are unmeasured.
Do not run unit corpus-count checks concurrently with E2E temporary note creation.

The only planned paid first-release command is:

```bash
E2E_RELEASE_LIVE=1 npm run e2e -- e2e/release-live.e2e.ts
```

The owner authorized this run and then explicitly confirmed fixture data transfer
to DeepSeek. Future paid work still needs an authorized scope/allowance.
It runs the [frozen eight-scenario protocol](../docs/release-live-protocol.md), one
provider/model only, no external judge, <=$5/120 actual HTTP attempts and no hidden
SDK retries. New artifacts are timestamped under `artifacts/release-prep/live-*`.
Unsuccessful outcomes are retained; a passing test process alone is not sufficient
for eight-scenario acceptance or factual quality. Current readiness records whether
this run actually happened. UI replay of v2 is strict; legacy recordings remain
historical SDK regression material and are not silently rebound to current notes.

Production builds now copy only with `--copy-to-vault`, which global setup supplies
with an exact fixture destination. Inherited `OBSIDIAN_PLUGIN_DIR` cannot redirect
a normal `npm run build` to another vault.

To verify the exact local ZIP's extracted assets, set `E2E_RELEASE_PACKAGE` to the
`zettel-agent/` folder within a fresh `artifacts/releases/` snapshot and select
only the targeted free files. Global setup copies those assets into the fixture
and skips a source rebuild. This never targets an owner's plugin directory.

After the recorded release acceptance, use free offline replay instead of dispatching
the eight inputs again:

```bash
E2E_RELEASE_REPLAY_RUN=artifacts/release-prep/live-2026-10-03T06-25-23-565Z \
  npm run e2e -- e2e/release-live-replay.e2e.ts
E2E_RELEASE_REPLAY_RUN=artifacts/release-prep/live-2026-10-03T07-27-17-693Z \
  E2E_RELEASE_REPLAY_IDS=5 npm run e2e -- e2e/release-live-replay.e2e.ts
```

The first command defaults to the seven unaffected positive scenarios. Original
scenario 5 is retained as a failure from the earlier loop; it must not be rewritten
to match the new final-context behavior. The second command checks its final
recording. Both refuse all network and check history restore/citation opens.
Any further authorized affected-only paid rerun requires `E2E_RELEASE_SCENARIOS`
and `E2E_RELEASE_PRIOR_RUN` pointing to the latest cumulative run; the harness
refuses a fresh allowance once live artifacts exist.

To replay all eight final primary outputs in one free test, keep the first run
argument and add:

```bash
E2E_RELEASE_REPLAY_EXTRA_RUN=artifacts/release-prep/live-2026-10-03T07-27-17-693Z
```

Use the installed-package argument above to avoid rebuilding during that check.
