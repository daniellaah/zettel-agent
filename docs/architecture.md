# Architecture

Zettel Agent is an Obsidian desktop plugin. It lets you ask questions about a Zettelkasten folder (Literature / Permanent / Writing, plus entry maps) in a chat sidebar, and it answers with citations to your notes. It helps you think: it searches, reads, compares, questions and suggests links. It never writes to your notes. See [ADR-0008](adr/0008-read-only-agent-own-loop.md).

## Components

```text
┌──────────────────────────── Obsidian plugin (single bundle) ────────────────────────────┐
│                                                                                         │
│  ui/ (React)              agent/                         retrieval/                     │
│  ChatView ──── turn ────▶ AgentLoop ── tool calls ─────▶ Tools ──▶ LexicalIndex (BM25)  │
│   ▲  stream events         │  ▲                           │         LinkGraph           │
│   └────────────────────────┘  │ ModelProvider             │         NoteReader          │
│                               ▼ adapters                  ▼                             │
│  session/          Claude · OpenAI · DeepSeek APIs     vault/ adapter                   │
│  TranscriptStore ◀── persisted turns                   (Vault, MetadataCache, events)   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

| Layer        | Owns                                                                     | Must not                                 |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| `retrieval/` | Chunking, tokenization, BM25, link graph, reading notes, evidence refs   | Call the answer model; import React      |
| `agent/`     | The loop, tool registry, budgets, provider adapters, prompts             | Touch the DOM; write to the vault        |
| `session/`   | Transcript persistence, listing sessions, resume                         | Know about the provider wire format      |
| `ui/`        | Rendering, input (`@` mentions, `/` commands), copy and insert-at-cursor | Hold agent state beyond what it displays |
| `vault/`     | A thin read-only port over the Obsidian API                              | Expose any write method                  |

`retrieval/`, `agent/` and `session/` are plain TypeScript that runs in Node, so Vitest can test them with an in-memory vault. Only `vault/` and `ui/` import `obsidian`.

## Agent loop

`agent/loop.ts` runs one user message as one **turn**:

1. Build the request. The system prompt and tool list are constants, so the prompt cache holds them across turns and sessions. Per-turn context (note counts per stage, the note the user has open) is placed in the user message.
2. Select a bounded request window of complete older turns while preserving the full saved history and raw content. Stream text/thinking normally; optional self-review buffers drafts until its checks finish.
3. For each `tool_use` block, validate the input with zod, run the tool, and return a `tool_result`. Prepare at most two contiguous local search queries concurrently; deliver and register every result in model order. Each section a tool returns gets an evidence id (`E1`, `E2`, …) for the conversation, pinned to that note's content hash.
4. Repeat until the model answers in plain text, or until a budget runs out. Budgets per turn are model requests (10), tool calls (30) and tool output characters (120k). The reserved last request disables tools. A conservative 64k byte input allowance also bounds encoded source delivery; oversized current turns stop before dispatch.
5. The answer cites evidence inline as `[E3]` or `[E3, E7]`. Structural checks track actually delivered citation identities and current-source freshness. Optional same-model review reserves three requests within the existing ten for review, one revision and re-review, with bounded coverage state and shared tool/output budgets. Failed drafts are retained for audit and withheld from the UI; successful self-review is explicitly not independent verification. See [ADR-0026](adr/0026-bounded-answer-review-context-and-search-concurrency.md) and [free validation](agentic-rag-results.md).

After two consecutive rounds that surface no new evidence, the loop adds a reminder to answer or change approach. When a turn ends with tool calls that will not run (a refusal, `max_tokens`, or the budget running out), the loop answers them with error results, so the transcript always remains a valid request. A turn that fails before any response is dropped.

Interrupting a turn aborts the HTTP stream. Partial responses are never committed. The transcript is append-only, which keeps prompt caching and thinking-block replay valid.

The loop speaks a provider-neutral transcript (`agent/messages.ts`) and calls models through `ModelProvider` (`agent/provider.ts`). There are three adapters, described in [ADR-0009](adr/0009-multi-provider-adapters.md):

- **Claude:** the Messages API, with prompt caching, adaptive thinking, explicit effort and refusal fallbacks.
- **OpenAI:** the Responses API with `store: false`. Encrypted reasoning is sent back on every request.
- **DeepSeek:** Chat Completions. `reasoning_content` is sent back, and thinking is switched off on the final forced-answer request.

Each assistant message keeps the provider's raw content, and that content is replayed verbatim only to the same provider and model.

### Offline record and replay

Adapters take an optional `fetch`. Record mode saves request bodies and raw responses, never headers/API keys, into per-run v2 files in the plugin directory. UI replay binds corpus revision, BM25 retrieval and answer-check mode, then compares every complete wire request, including history and delivered evidence. It refuses unbound legacy and hybrid-to-BM25 recordings rather than changing citation identities silently. Replay runs the real SDK parsers, adapter, loop and tools with no network. Historical cassettes remain unchanged in explicit legacy SDK regression tests. See [ADR-0010](adr/0010-offline-record-replay.md) and [ADR-0027](adr/0027-release-safety-lifecycle-and-replay.md). SDK retries are disabled; deliberate retry belongs to the user.

## Tools (all read-only)

| Tool     | Purpose                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `search` | BM25F or opt-in local hybrid excerpts; per-note/output caps, exact lexical counts and bounded hybrid candidate counts.                          |
| `match`  | Paginated literal/fixed-width regex line matching with stage/folder/tag/target filters, exact line identities and optional surrounding context. |
| `read`   | Bounded body or outline pages, exact section selection, safe revision handling and continuation, including oversized sections.                  |
| `links`  | Paginated directed research-corpus neighborhoods, accurate degree counts/orphan state, unresolved targets and explicit one/two-hop distances.   |
| `list`   | Stable paginated surveys with exact totals, common filters, connection states, bounded metadata and optional previews.                          |

Tools return escaped readable blocks plus a versioned scope/count/completeness summary. Structured per-delivery provenance is saved alongside the provider-neutral transcript: an ID seen as a title or graph fact is distinct from later body delivery. Cursors are opaque, bounded session tokens, bound to query and corpus revision. Empty stage arrays mean all research stages consistently. Over-budget results register no evidence. See [ADR-0022](adr/0022-bounded-tools-and-delivery-provenance.md).

Search and read include a bounded excerpt of generic frontmatter properties with section evidence, preserving source identity when bibliography is stored in metadata ([ADR-0014](adr/0014-literature-notes-with-source-metadata.md)). Note text and metadata are wrapped in `<note>` tags that the text itself cannot close. The system prompt treats text inside those tags as data and never as instructions.

## Retrieval

- **Sections:** each note is split at headings, ignoring anything inside fenced code. A section runs to the next heading of any level, and `read` expands a section to include its sub-sections. Oversized sections are packed into pieces of about 2,000 characters at blank lines. Section IDs are a hash of path, heading path and occurrence, so they stay the same when other parts of the note change.
- **Two-level BM25F** (k1 = 1.2, b = 0.75):
  - Note-level fields are scored once per note: title 10, aliases 8, tags 5.
  - Section-level fields are scored per section: headings 6, body 1, link targets 0.25.
  - A section's score is its own score plus its note's score. Results default to one section per note; `per_note` permits up to five without changing ranking weights or tokenization.
- **Tokenization:** text is NFKC-normalized and lower-cased. Latin text is split into words. CJK text is split into `Intl.Segmenter` words, plus overlapping bigrams for domain terms the segmenter breaks apart (双塔 → 双 | 塔). Words and bigrams are both used because that combination scored best on the evaluation set.
- **Link graph:** links are resolved with Obsidian's `metadataCache.getFirstLinkpathDest`, and include links in frontmatter properties. The graph is rebuilt lazily after any change. In Node, basename matching stands in for Obsidian's resolver.
- **Research scope:** `Corpus.upsert` excludes notes whose effective stage is fleeting, using frontmatter type before the folder stage. This boundary applies to all five tools, mentions and active-note context, and to offline evaluation. Stage changes remove stale entries and invalidate the graph. User-triggered capture creation remains available. See [ADR-0013](adr/0013-exclude-fleeting-from-research.md).
- **Freshness:** the index is built in memory when the layout is ready, and whenever the Zettelkasten folder setting changes. After that it is updated from vault events; changes made during a rebuild are replayed once the rebuild finishes. (Planned: persist the index so unchanged notes are skipped at startup.)
- **Stages:** each note's stage comes from its folder. A frontmatter `type` that names a stage overrides the folder.

Local hybrid is an explicit experimental option; BM25 remains the default. Ollama runs Qwen3-Embedding-0.6B locally (1024 dimensions), while the plugin maintains a revision-validated exact cosine index and persistent cache outside the vault, partitioned by vault root. Host lifecycle events and Settings build/update the index; Agent queries cannot rebuild or write cache files. Search asynchronously embeds queries, checks the installed model digest, merges bounded BM25/dense section candidates through RRF and delivers ordinary citation-bound excerpts. Stale/missing/failed local retrieval visibly falls back to BM25. Replay makes no local requests. New AI-reviewed common labels and a development-selected 1:2 BM25:dense fusion show retrieval gains; one new synthetic query checkpoint is complete. Paired answer evaluation, independent calibration and completion of the final gate are still required before changing the default. Fake-vector benchmarks measure mechanics only. No vector database or sixth tool is introduced. See [ADR-0023](adr/0023-offline-vectors-cache-and-hybrid-gate.md) and [ADR-0024](adr/0024-local-ollama-hybrid-retrieval.md).

## UI

- **User-created notes.** Three commands, a ribbon entry and the chat pane's New note buttons open a dialog that creates fleeting, literature or permanent notes from fixed scaffolds, without calling a model. The dialog shows the destination and accepts optional source metadata; submission creates a new file and opens its editor. Existing notes are never overwritten. This user-only creation path lives in `ui/` and is not available to the agent or session. The chat host can only open the dialog, from a button click; it cannot create a note. See [ADR-0012](adr/0012-user-triggered-note-creation.md) and [ADR-0029](adr/0029-new-note-buttons-in-chat-pane.md).

- The chat view lives in the right sidebar. The conversation belongs to the plugin, so closing the view keeps it and stops the active turn. Turn identity guards isolate late initialization, events and completion from a new or loaded session.
- **Saved chats.** After every turn, the conversation is saved to the plugin folder: its items, model transcript and evidence ledger. Writes are serialized immutable snapshots with schema/ID validation, pending files, backups and deletion tombstones; individual files are authoritative and bad records are isolated. Save/load failures are visible. The history panel lists saved chats newest first. Reopening one restores the answers with working citations, and a follow-up question continues the original transcript.
- **Context.** Type `@` to attach any Zettelkasten note. The note you have open, and any text selected in the editor, are offered as one-click chips. Attached notes are read with the `read` tool before the question is sent, so they get evidence ids and can be cited. Selections are quoted as note data.
- **Retry.** _Ask again_ on the last answer cuts the transcript back to where that turn started and re-asks the same question with the same attachments. Only the tail of the transcript is dropped; earlier turns are never edited. Esc stops a running turn.
- Each message is its own memoized component, so a streamed delta re-renders only the last message. While streaming, Markdown is re-rendered with Obsidian's `MarkdownRenderer` at most every 120 ms.
- Setup guidance and the research folder/note count appear in chat, with a direct Settings button. Settings puts model/key and research scope first; recording, review, hybrid retrieval and note-folder mappings live in an optional Advanced disclosure. Readiness is local configuration, not an API connection test.
- The chronological research trace stays intact inside a collapsed Research details disclosure. Final text stays outside it; Copy/Insert transfer that final text with resolved note links. Research limits and failed steps remain visible as concise notices with inspectable details. Individual tool calls and thinking can still expand inside the trace. Citation chips support keyboard activation, and history supports Escape and focus return.
- `[E3]` citations render as chips. Hovering one shows the note and heading; clicking opens the exact existing file/section using `openFile`. Missing/renamed targets fail visibly, changed content warns, and ordinary `[[links]]` also use non-creating opens. App-command and local-file URLs are disabled in chat.
- **Copy** and **Insert at cursor** turn new citations into exact vault-relative `[[Path#Heading]]` links (historical ledger entries retain their title links). Insert writes at the cursor of the note you last edited, as your own action, and can be undone with the editor's undo.
- Each turn shows its token and cache usage, and why it stopped when it did not simply answer.
- Planned: `/` commands (`/link`, `/critique`, `/gaps`, `/outline`).

## Evaluation

`npm run eval` runs 120 English retrieval questions against the unchanged 318-note learning corpus. `eval/suites/expanded` freezes 96 dev/24 test retrieval queries and 48 dev/12 test Agent tasks by question family and primary source work. The original 20-query/12-task pilot is preserved; use `EVAL_SUITE=pilot` to reproduce it.

- **Integrity:** SHA-256 corpus, source-audit, annotation and implementation bindings; strict source/metadata/link/excerpt checks; Recall@5/10, MRR@10 and linear-gain nDCG@10 with denominators and explicit unjudged counts. Expanded pools remain incompletely reviewed, so retrieval metrics are provisional.
- **Answer evaluation:** production `runTurn` and tools in Node, exact delivered scopes, follow-up history, semantic answer/citation grading, occurrence-level citation completeness and note/section quotation binding. Grader repair attempts, failed grades and original requests remain recorded. Correctness references never establish delivery grounding.
- **Complete runner:** `eval:full` declares 86 jobs: 60 Agent tasks, six repeats, six fixed top-five retrieval comparators, six no-vault comparators and eight isolated attacks. It reports per-split quality, paired comparisons, repeat reliability, cost and latency. Two workers share an explicit allowance; smoke and strict replay make zero live calls. Test runs follow development and robustness. See [ADR-0020](adr/0020-frozen-expanded-evaluation-and-isolated-comparisons.md).
- **Review status:** synthetic AI annotations and the owner's delegated AI adjudication. The earlier review was unblinded; no human or blind calibration is claimed. Human calibration tooling remains separate. Structural validation is not proof of entailment or exhaustive claim extraction.
- **Read-only boundary:** solver comparators are evaluation-only. Independent synthetic robustness notes live in memory, never in the learning corpus or owner's vault. Runtime tools remain unchanged and read-only. Historical recordings concern their own corpus.

See [operator guide](../eval/agent-evaluation.md), [ADR-0017](adr/0017-frozen-learning-corpus-evaluation-pilot.md) and [ADR-0016](adr/0016-source-grounded-learning-dataset.md).

Near-limit research reserves 4096 estimated input bytes for final synthesis;
an output-budget rejection ends research rather than repeatedly expanding it.
Bounded answers disclose failed/partial queries and scope missing-evidence claims
in their opening. This preserves transcript pairing and hard caps; it does not
prove absence. See [ADR-0028](adr/0028-reserve-final-synthesis-context.md).
