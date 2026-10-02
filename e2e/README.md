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
- **Cost:** each provider run makes roughly 15 model calls. DeepSeek Flash costs a few cents; Claude Opus costs more.
- **Vault changes:** the insert test creates a temporary note at the vault root and moves it to the fixture vault's git-ignored `.trash/` folder straight away. Creation tests own a fresh temporary folder, delete only that folder in cleanup, and restore the original folder settings in memory. Other settings changes, such as switching provider or setting a wrong model name, also stay in memory and are restored after each test.

`e2e/page/*.js` holds the code that runs inside Obsidian. Each file is the body of an async function with `args` in scope. Because these files are fragments, ESLint and Prettier skip them.

## Current scenario scope

The nine UI smoke scenarios now refer to the 318-note technical learning corpus. Old fixture-only references to deleted learning-science notes and fleeting injections have been removed. Prompt injection and adversarial contradictions use the separate `eval/robustness/cases.json` in-memory suite, rather than being planted in the frozen learning notes. Historical recordings remain regression material for their original corpus; their citation-hit numbers do not describe the current dataset.
