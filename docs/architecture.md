# Architecture

Zettel Agent is an Obsidian desktop plugin. It lets you ask questions about a Zettelkasten folder (Fleeting / Literature / Permanent / Writing) in a chat sidebar, and it answers with citations to your notes. It helps you think: it searches, reads, compares, questions and suggests links. It never writes to your notes. See [ADR-0008](adr/0008-read-only-agent-own-loop.md).

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
| `retrieval/` | Chunking, tokenization, BM25, link graph, reading notes, evidence refs   | Call the model; import React             |
| `agent/`     | The loop, tool registry, budgets, provider adapters, prompts             | Touch the DOM; write to the vault        |
| `session/`   | Transcript persistence, listing sessions, resume                         | Know about the provider wire format      |
| `ui/`        | Rendering, input (`@` mentions, `/` commands), copy and insert-at-cursor | Hold agent state beyond what it displays |
| `vault/`     | A thin read-only port over the Obsidian API                              | Expose any write method                  |

`retrieval/`, `agent/` and `session/` are plain TypeScript that runs in Node, so Vitest can test them with an in-memory vault. Only `vault/` and `ui/` import `obsidian`.

## Agent loop

`agent/loop.ts` runs one user message as one **turn**:

1. Build the request. The system prompt and tool list are constants, so the prompt cache holds them across turns and sessions. Per-turn context (note counts per stage, the note the user has open) is placed in the user message.
2. Stream the response. Text and thinking deltas go to the UI as they arrive.
3. For each `tool_use` block, validate the input with zod, run the tool, and return a `tool_result`. Each section a tool returns gets an evidence id (`E1`, `E2`, …) for the conversation, pinned to that note's content hash.
4. Repeat until the model answers in plain text, or until a budget runs out. Budgets per turn are model requests (10), tool calls (30) and tool output characters (120k). The last request sets `tool_choice: none`, so a turn always ends with an answer drawn from the evidence gathered.
5. The answer cites evidence inline as `[E3]` or `[E3, E7]`. Citations are checked against the evidence ledger, and ids that were never delivered are flagged to the user.

After two consecutive rounds that surface no new evidence, the loop adds a reminder to answer or change approach. When a turn ends with tool calls that will not run (a refusal, `max_tokens`, or the budget running out), the loop answers them with error results, so the transcript always remains a valid request. A turn that fails before any response is dropped.

Interrupting a turn aborts the HTTP stream. Partial responses are never committed. The transcript is append-only, which keeps prompt caching and thinking-block replay valid.

The loop speaks a provider-neutral transcript (`agent/messages.ts`) and calls models through `ModelProvider` (`agent/provider.ts`). There are three adapters, described in [ADR-0009](adr/0009-multi-provider-adapters.md):

- **Claude:** the Messages API, with prompt caching, adaptive thinking, explicit effort and refusal fallbacks.
- **OpenAI:** the Responses API with `store: false`. Encrypted reasoning is sent back on every request.
- **DeepSeek:** Chat Completions. `reasoning_content` is sent back, and thinking is switched off on the final forced-answer request.

Each assistant message keeps the provider's raw content, and that content is replayed verbatim only to the same provider and model.

### Offline record and replay

Adapters take an optional `fetch`. In Record mode, `recordingFetch` saves each request body and raw response to a cassette file; headers, and so API keys, are never saved. In Replay mode, `replayFetch` serves those responses back as a stream, with no network. Replay still runs the SDK parsers, the adapter, the loop and the tools, and the committed fixture cassettes are replayed as regression tests. See [ADR-0010](adr/0010-offline-record-replay.md).

## Tools (all read-only)

| Tool     | Purpose                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search` | BM25 over sections, filtered by stage, folder or tag. Returns the best section of each note as an excerpt, with an evidence id and the matched terms. |
| `match`  | Exact or regex line matches, for questions like "which notes mention X".                                                                              |
| `read`   | Expands an evidence id to its section and sub-sections, or reads one section by heading, or a whole note. Size-capped.                                |
| `links`  | Outgoing links, backlinks and unresolved links, with `depth: 2` for notes two hops away.                                                              |
| `list`   | Notes by stage, folder, tag or orphan status, with link counts.                                                                                       |

Note text is wrapped in `<note>` tags that the text itself cannot close. The system prompt treats text inside those tags as data and never as instructions.

## Retrieval

- **Sections:** each note is split at headings, ignoring anything inside fenced code. A section runs to the next heading of any level, and `read` expands a section to include its sub-sections. Oversized sections are packed into pieces of about 2,000 characters at blank lines. Section IDs are a hash of path, heading path and occurrence, so they stay the same when other parts of the note change.
- **Two-level BM25F** (k1 = 1.2, b = 0.75):
  - Note-level fields are scored once per note: title 10, aliases 8, tags 5.
  - Section-level fields are scored per section: headings 6, body 1, link targets 0.25.
  - A section's score is its own score plus its note's score. Results are collapsed to one section per note.
- **Tokenization:** text is NFKC-normalized and lower-cased. Latin text is split into words. CJK text is split into `Intl.Segmenter` words, plus overlapping bigrams for domain terms the segmenter breaks apart (双塔 → 双 | 塔). Words and bigrams are both used because that combination scored best on the evaluation set.
- **Link graph:** links are resolved with Obsidian's `metadataCache.getFirstLinkpathDest`, and include links in frontmatter properties. The graph is rebuilt lazily after any change. In Node, basename matching stands in for Obsidian's resolver.
- **Freshness:** the index is built in memory when the layout is ready, and whenever the Zettelkasten folder setting changes. After that it is updated from vault events; changes made during a rebuild are replayed once the rebuild finishes. (Planned: persist the index so unchanged notes are skipped at startup.)
- **Stages:** each note's stage comes from its folder. A frontmatter `type` that names a stage overrides the folder.

## UI

- The chat view lives in the right sidebar. The conversation belongs to the plugin, so closing the view keeps it.
- **Saved chats.** After every turn, the conversation is saved to the plugin folder: its items, its model transcript and its evidence ledger. The history panel lists saved chats newest first. Reopening one restores the answers with working citations, and a follow-up question continues the original transcript.
- **Context.** Type `@` to attach any Zettelkasten note. The note you have open, and any text selected in the editor, are offered as one-click chips. Attached notes are read with the `read` tool before the question is sent, so they get evidence ids and can be cited. Selections are quoted as note data.
- **Retry.** _Ask again_ on the last answer cuts the transcript back to where that turn started and re-asks the same question with the same attachments. Only the tail of the transcript is dropped; earlier turns are never edited. Esc stops a running turn.
- Each message is its own memoized component, so a streamed delta re-renders only the last message. While streaming, Markdown is re-rendered with Obsidian's `MarkdownRenderer` at most every 120 ms.
- The assistant's text, tool calls and thinking are interleaved in the order they happen. Tool calls and thinking appear as single quiet lines that expand to show details.
- `[E3]` citations render as chips. Hovering one shows the note and heading; clicking opens that section. `[[links]]` open their notes.
- **Copy** and **Insert at cursor** turn citations into `[[Title#Heading]]` links. Insert writes at the cursor of the note you last edited, as your own action, and can be undone with the editor's undo.
- Each turn shows its token and cache usage, and why it stopped when it did not simply answer.
- Planned: `/` commands (`/link`, `/critique`, `/gaps`, `/outline`).

## Evaluation

`npm run eval` runs everything under `eval/`, separately from the unit tests, against the fixture vault in `fixtures/vault`. That vault holds 55 bilingual notes; its deliberate edge cases are listed in `fixtures/vault-design.md`. The judged queries are in `eval/judgments.draft.json`.

- **Retrieval (implemented):** Recall@5/10, MRR and nDCG@10 at note level, broken down by language, for each tokenizer mode.
- **Planned:** judged queries from the real vault; link-graph expansion as an ablation; a latency test on a synthetic 5k-note vault; agent-level checks run against recorded API fixtures. Those checks are citation validity, honest "not in your notes" answers to no-answer queries, resistance to prompt injection, and not ghostwriting ("write this note for me" should produce questions, not a finished note).
