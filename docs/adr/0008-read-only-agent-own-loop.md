# ADR-0008: Read-only agent on a self-written loop

- Status: Accepted
- Date: 2026-09-30
- Supersedes: ADR-0001 (Codex App Server), ADR-0002 (thread-scoped MCP), ADR-0003 and ADR-0006 (plugin-mediated and approval-bound vault writes), ADR-0005 (Rust retrieval sidecar)
- Keeps: ADR-0004 (BM25-first retrieval)

ADRs 0001–0007 belong to the prototype archived on the `legacy-codex` branch. Their text lives in the original design folder, outside this repository.

## Context

The prototype ran Codex App Server as the agent, a Rust FTS5 sidecar for retrieval over MCP, and an approval-bound vault writer. It reached milestone M3 with a Literature Note flow. Four problems stopped it:

1. **It could not be distributed.** An Obsidian community-store release may contain only `main.js`, `manifest.json` and `styles.css`. The native sidecar needed separate, signed, per-platform binaries.
2. **Its usefulness was never validated.** Acceptance covered compliance: hashes, process leaks and schemas. The one query run against the real vault returned zero results. The owner's product sign-off never happened.
3. **Its scope was too narrow.** Only the Literature flow existed, with no general way to ask questions of the vault. Every conversation was forced into one of four typed Sessions.
4. **The UI was rebuilt in full on every streamed token.** It had no chat transcript, no rendering of tool calls and no Markdown.

The prototype had also ruled out a self-written loop, because it wanted to reuse Codex's harness and ChatGPT sign-in.

## Decision

1. **The loop is ours.** The plugin calls the Claude Messages API directly (streaming, tool use, prompt caching) behind a `ModelProvider` interface. It does not use Codex or the Claude Agent SDK. The loop design comes from ARKB: evidence tools, evidence references bound to file revisions, budgets, a reserved final turn, and a reminder when evidence repeats. Unlike ARKB, the answer is streamed as plain text with inline `[E#]` citations rather than returned through a `finish` tool, so the user can read it while it is written.
2. **The agent is read-only.** It has no tool that creates, modifies, moves or deletes vault files. Text reaches a note only through an action the user triggers: _Copy_, or _Insert at cursor_ through the Obsidian editor API. Both show up in the editor's undo history. No Silent Authorship therefore holds by construction, not by policy.
3. **Retrieval runs in-process and is written in TypeScript.** It uses BM25 over heading-level chunks, with CJK word segmentation from `Intl.Segmenter` and overlapping bigrams as a fallback. The link graph comes from Obsidian's `metadataCache`, and the index is updated incrementally from vault events. Embeddings wait until the evaluation set shows lexical misses.
4. **Everything ships as a single package.** One plugin package, with `agent/`, `retrieval/`, `ui/` (React) and `session/` folders, replaces the four npm workspaces and the Rust crate.
5. **Evaluation and daily use come first.** The first milestone is question answering with citations over the owner's real vault. The evaluation set is built alongside it, before new features.

## Consequences

**Positive**

- The plugin can be listed in the community store, with nothing to install besides the plugin itself.
- The authorship rules cannot be broken by a model mistake or by prompt injection, because there is no write path to exploit.
- There is roughly 40% less to build: no apply protocol, no diff approval UI, no conflict detection and no pending-change tray. The time goes to retrieval quality and evaluation.
- The whole path from query to cited answer is code we own, can inspect and can measure.

**Negative**

- Users need an Anthropic API key and pay per token. Subscription sign-in is gone.
- The plugin has to persist conversations and handle resume itself.
- Bulk maintenance, such as linking 20 orphan notes, takes manual work. If daily use shows this matters, writes can come back through the archived approval protocol. Tools already carry a permission level, so adding them would not require restructuring.

## Carried over from the prototype

**Rules**

- Vault content is untrusted data.
- An honest "nothing relevant" beats padding the answer with weak matches.
- A retrieved note is only a _candidate_ link until the user names its relationship.
- Never create filesystem watchers; use vault events.
- Wait for `metadataCache` `resolved` before building the link graph.
- Tell the user what gets sent to the model provider.

**Retrieval contracts**

- Field weights: title 10, aliases 8, headings 6, tags 5, body 1, link targets 0.25.
- Stable chunk IDs.
- Deterministic tie-breaking.
- Response size caps: 64 KiB per note, 800-character excerpts.

**Code**

- The atomic JSON store pattern: temp file, rename and backup.
- The slash-command filter.
- Tooling: strict `tsconfig`, typed ESLint rules, Prettier, esbuild and Vitest.
- The evaluation fixtures, `judgments-v1.json`, which will be expanded to 30–50 bilingual queries.
