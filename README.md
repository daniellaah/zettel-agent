# Zettel Agent

Ask your Zettelkasten anything, inside Obsidian.

A read-only research agent searches, reads and follows links across your Fleeting, Literature, Permanent and Writing notes. It answers with citations you can click, suggests links along with the relationship behind each one, and questions your drafts. It never writes your notes for you: text reaches a note only when you copy or insert it yourself.

> Status: early development (v0.1). Desktop only. Bring your own API key for Anthropic (Claude), OpenAI or DeepSeek.

## Using it

- Open the chat from the ribbon or the command palette (_Open chat_), and ask in Chinese or English.
- Type `@` to attach a note. The note you have open, and any text you have selected, are offered as chips you can attach with one click.
- Click a citation chip to open the cited section. **Copy** and **Insert at cursor** turn citations into `[[links]]`.
- **Ask again** re-runs the last question. **Esc** stops a running answer.
- Chats are saved automatically. Use **History** to reopen one and continue it.

## How it works

- **A self-written agent loop** runs over a provider-neutral transcript, with thin adapters for the Claude Messages API, the OpenAI Responses API and DeepSeek's Chat Completions: streaming, tool use, reasoning replay and prompt caching, without an agent framework.
- **In-process retrieval**: bilingual (Chinese + English) BM25 over heading-level chunks, plus Obsidian's own link graph for backlinks and multi-hop neighbours.
- **Evidence-bound answers**: every citation points to a chunk the agent actually read, pinned to that chunk's content hash.
- **Evaluation first**: retrieval and agent behaviour are measured against a judged, bilingual query set.

See [docs/architecture.md](docs/architecture.md), [ADR-0008](docs/adr/0008-read-only-agent-own-loop.md) and [ADR-0009](docs/adr/0009-multi-provider-adapters.md).

## Development

```bash
npm install
npm run check    # typecheck, lint, format check, unit tests
npm run eval     # retrieval quality on the fixture vault (no API calls)
npm run e2e      # the real plugin in Obsidian against live model APIs (macOS)
npm run build    # production main.js
```

See [e2e/README.md](e2e/README.md) for how the end-to-end tests drive Obsidian and what they cost.

To try the plugin in a test vault, point the build at the vault's plugin folder, then enable **Zettel Agent** under _Settings → Community plugins_:

```bash
OBSIDIAN_PLUGIN_DIR="/path/to/test-vault/.obsidian/plugins/zettel-agent" npm run dev
```

## Offline mode

_Settings → Offline mode_ has three options:

- **Record** saves the model's responses to each question in the plugin folder.
- **Replay** answers recorded questions again with no network and no cost. The chat shows them as starter questions.
- **Off** is normal live use.

Replay goes through the real SDKs, the agent loop and the tools, so the interface behaves exactly as it does when live. See [ADR-0010](docs/adr/0010-offline-record-replay.md).

## Privacy

Your questions, and the note excerpts the agent reads while answering, are sent to the model provider you choose (Anthropic, OpenAI or DeepSeek). The search index stays on your machine. API keys are kept in Obsidian's secret storage. OpenAI requests use `store: false`.

## License

MIT
