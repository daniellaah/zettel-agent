# Zettel Agent

An Obsidian plugin that answers questions about your Zettelkasten, with citations to your notes.

## Features

- **Cited answers.** Answers cite the notes they draw on. The Sources list shows which notes the agent read in full and which it saw only as excerpts.
- **Read-only.** The agent searches, reads and follows links. It never edits your notes and never searches fleeting notes.
- **Search by keywords and meaning.** It finds notes that use other words or another language, such as a Chinese question about English notes.
- **Your own model.** Anthropic, OpenAI or DeepSeek, with your API key.
- **Fits your writing.** Copy or insert an answer with citations as note links, attach notes with `@`, and return to earlier chats.

## Usage

1. Copy `main.js`, `manifest.json` and `styles.css` from a build into `<vault>/.obsidian/plugins/zettel-agent/`, then enable Zettel Agent in **Settings → Community plugins**.
2. In **Settings → Zettel Agent**, choose a provider and add your API key. Set your Zettelkasten folder and its stage folders (Fleeting, Literature, Permanent, Writing by default).
3. Open the chat from the ribbon or with the **Open chat** command, and ask a question.

Questions and the note excerpts the agent reads are sent to your model provider.

### Semantic search with Ollama

Optional. [Ollama](https://ollama.com) computes embeddings on your computer:

```bash
ollama pull bge-m3
```

Semantic search is on by default. **Settings → Zettel Agent → Semantic search** shows indexing progress. About 300 notes take 15 seconds on an Apple M1 Pro. Edited notes are embedded again automatically. Without Ollama, search uses keywords only. `qwen3-embedding:0.6b` also works.

## Development

Requires Node 24.

```bash
npm ci
npm run check   # typecheck, lint, format and unit tests
npm run build   # builds main.js
npm run eval    # retrieval evaluation on the sample vault, no model calls
npm run e2e     # end-to-end tests in Obsidian with scripted answers (macOS)
```

## License

[MIT](LICENSE)
