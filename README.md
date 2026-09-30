# Agentic Zettelkasten

Ask your Zettelkasten anything, inside Obsidian.

A read-only research agent searches, reads and follows links across your Fleeting, Literature, Permanent and Writing notes. It answers with citations you can click, suggests links along with the relationship behind each one, and questions your drafts. It never writes your notes for you: text reaches a note only when you copy or insert it yourself.

> Status: early development (v0.1). Desktop only. Requires an Anthropic API key.

## How it works

- **A self-written agent loop** calls the Claude Messages API directly, with streaming, tool use and prompt caching. It does not use an agent framework.
- **In-process retrieval**: bilingual (Chinese + English) BM25 over heading-level chunks, plus Obsidian's own link graph for backlinks and multi-hop neighbours.
- **Evidence-bound answers**: every citation points to a chunk the agent actually read, pinned to that chunk's content hash.
- **Evaluation first**: retrieval and agent behaviour are measured against a judged, bilingual query set.

See [docs/architecture.md](docs/architecture.md) and [ADR-0008](docs/adr/0008-read-only-agent-own-loop.md).

## Development

```bash
npm install
npm run check    # typecheck, lint, format check, tests
npm run build    # production main.js
```

To try the plugin in a test vault, point the build at the vault's plugin folder, then enable **Agentic Zettelkasten** under _Settings → Community plugins_:

```bash
OBSIDIAN_PLUGIN_DIR="/path/to/test-vault/.obsidian/plugins/agentic-zettelkasten" npm run dev
```

## Privacy

Your questions, and the note excerpts the agent reads while answering, are sent to Anthropic. The search index stays on your machine. The API key is kept in Obsidian's secret storage.

## License

MIT
