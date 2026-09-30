# Architecture

Agentic Zettelkasten is an Obsidian desktop plugin. It lets you ask questions about a Zettelkasten folder (Fleeting / Literature / Permanent / Writing) in a chat sidebar, and it answers with citations to your notes. It helps you think: it searches, reads, compares, questions and suggests links. It never writes to your notes. See [ADR-0008](adr/0008-read-only-agent-own-loop.md).

## Components

```text
┌──────────────────────────── Obsidian plugin (single bundle) ────────────────────────────┐
│                                                                                         │
│  ui/ (React)              agent/                         retrieval/                     │
│  ChatView ──── turn ────▶ AgentLoop ── tool calls ─────▶ Tools ──▶ LexicalIndex (BM25)  │
│   ▲  stream events         │  ▲                           │         LinkGraph           │
│   └────────────────────────┘  │ ModelProvider             │         NoteReader          │
│                               ▼ (Anthropic)               ▼                             │
│  session/                   Claude Messages API        vault/ adapter                   │
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

One user message produces one **turn**:

1. Build the request: the system prompt (stable, so it can be cached), a vault profile (folder stages and note counts), the conversation so far, and the active note if it is attached.
2. Stream the model response. Text deltas go to the UI as _provisional_ content.
3. If the response contains `tool_use` blocks, validate each input, execute the tool, and send back a `tool_result`. Every result that returns content carries **evidence refs** of the form `{path, chunkId, contentHash}`.
4. Repeat until one of these happens:
   - the model calls `finish`;
   - the model replies with plain text;
   - a budget runs out. The final request is reserved for answering with tools disabled.
5. Commit the turn to the transcript. An answer may only cite refs that were delivered during the turn. The UI checks each citation against the current `contentHash` and marks it stale if the note has changed since.

Budgets are set per turn: maximum model requests (default 8), tool calls, evidence tokens and wall-clock time. If several consecutive searches return only evidence already seen, the loop injects a stop reminder.

Interrupting a turn aborts the HTTP stream and keeps only content that was already completed. Partial deltas are never committed.

## Tools (all read-only)

| Tool     | Purpose                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `search` | BM25 over chunks, with optional filters for stage, folder, tag and path prefix. Returns ranked excerpts, match reasons and refs. |
| `match`  | Exact or regex occurrences in the current note text, for questions like "which notes mention X".                                 |
| `read`   | Opens a ref (section expansion by default) or a note by path. Size-capped.                                                       |
| `links`  | Outlinks, backlinks, and unlinked mentions for a note. `depth` ≤ 2 for multi-hop.                                                |
| `list`   | Lists notes by stage, folder or tag, with titles and modification times.                                                         |
| `finish` | Ends the turn with `{answer, status: answered                                                                                    | partial | insufficient_evidence, refs}`. |

Tool results are wrapped as untrusted note content, and the system prompt tells the model never to follow instructions found inside notes.

## Retrieval

- **Chunks:** one chunk per heading section, including its sub-headings. Oversized sections are split at block boundaries. Chunk IDs are a hash of path, heading path and occurrence index.
- **Fields and weights:** title 10, aliases 8, headings 6, tags 5, body 1, link targets 0.25. BM25 uses k1 = 1.2 and b = 0.75.
- **Tokenization:** text is NFKC-normalized and lower-cased. Latin text is split into words. CJK runs are segmented with `Intl.Segmenter('zh', {granularity: 'word'})`, and overlapping bigrams are also indexed for recall. The evaluation set decides the final mix.
- **Link graph:** built from `metadataCache.resolvedLinks` once the cache reports `resolved`, then updated on `changed`, `rename` and `delete`.
- **Freshness:** the index updates on vault events and persists as JSON in the plugin data folder. A content hash per note lets unchanged notes be skipped on startup.
- **Stages:** each note's stage comes from its folder (for example `02-Zettelkasten/Permanent`), configured in settings. The frontmatter `type` overrides it.

## UI

- The chat view lives in the right sidebar. Each message is its own component, so a streamed token re-renders only the last message.
- Assistant Markdown is rendered with Obsidian's `MarkdownRenderer`, so `[[links]]` are clickable.
- Tool calls appear as collapsible rows with a one-line summary, for example `search "卡片盒 原子性" → 7 hits`.
- Citations are chips that open the note at the cited heading.
- Candidate links have **Copy `[[link]]`** and **Insert at cursor** buttons.
- The composer supports `@` to attach a note, `/` for commands (`/ask`, `/link`, `/critique`, `/gaps`, `/outline`), Enter to send and Shift+Enter for a new line.
- A session list supports new, resume and delete. A header line shows which provider and model each request is sent to.

## Evaluation

`eval/` runs under Vitest against a fixture vault with bilingual notes on several topics.

- **Retrieval:** Recall@5/10, MRR and nDCG@10 on 30–50 judged queries. Ablations compare bigram-only, segmenter-only, both, and both plus link-graph expansion. Latency is measured on a synthetic 5k-note vault.
- **Agent:** run against recorded API fixtures, it checks citation validity (every cited ref was delivered and supports the claim), honest `insufficient_evidence` on out-of-vault questions, and refusal to ghostwrite ("write this note for me" should produce questions, not a finished note).
