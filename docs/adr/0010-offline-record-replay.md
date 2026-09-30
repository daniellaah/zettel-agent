# ADR-0010: Offline record and replay at the HTTP level

- Status: Accepted
- Date: 2026-09-30

## Context

Two needs came up together:

- **Interface work without paying for it.** Every question asked while iterating on the interface costs a live model call.
- **Regression tests from real traffic.** The Claude and OpenAI adapters were tested only as pure converters, and no test used a response that a provider had actually sent.

Recording could happen at two levels:

- **Neutral responses** (`ModelResponse`), just below the loop. Replay would skip the SDKs and adapters entirely.
- **HTTP exchanges** (request body plus raw SSE response). Replay would still run the SDK's stream parser and our adapter.

## Decision

Record at the HTTP level through the SDKs' `fetch` option, in `agent/recording.ts`.

- **Recording.** `recordingFetch` wraps the real `fetch`. It clones each response and stores the request body and the raw body in a _cassette_: one JSON file per provider, model and question. Headers are never stored, so a cassette never contains an API key; the e2e suite checks this.
- **Replay.** `replayFetch` serves a cassette's exchanges in order. It splits SSE into events with a short delay, so answers still appear to stream, and it honours abort signals. Replay needs no API key and makes no network calls. Tools still run against the live vault, so citations, links and insert-at-cursor behave as they do in normal use.
- **In the plugin.** _Settings → Offline mode_ offers Off, Record and Replay. Cassettes are stored in the plugin's folder. In Replay the chat shows recorded questions as its starters, and asking an unrecorded question returns a clear message instead of going online.
- **In tests.**
  - `E2E_RECORD=1 npm run e2e` records every scenario, and `npm run e2e:save-recordings` copies the cassettes into `fixtures/recordings/`.
  - `src/agent/replay-fixtures.test.ts` then replays each of them through the real SDKs, adapters, loop and tools on the fixture vault, with no Obsidian and no network. It fails if a provider's real wire format no longer parses, or if the loop stops consuming a recording exactly.
  - Handwritten Claude and OpenAI event streams cover those adapters' streaming paths until real recordings for them exist.

## Consequences

- The interface can be worked on at no cost, and a bug report can include a cassette that reproduces the exact model output.
- A recording is keyed by question text alone. A follow-up question replayed in a fresh chat returns the recorded answer even though the earlier context is missing. That is acceptable for trying out the interface, and it is documented.
- If retrieval changes, the tool results sent back during replay differ from the recorded ones, while the model's replies stay as they were recorded. Replay tests catch parsing and loop regressions, not answer quality; answer quality is measured by `npm run e2e` and `npm run eval`.
- Cassettes from the owner's real vault contain note excerpts. They stay in the plugin folder and are never written into notes. Only cassettes from the synthetic fixture vault are committed.
