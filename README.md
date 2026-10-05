# Zettel Agent

An Obsidian plugin that answers questions about your Zettelkasten, with citations to your notes.

## Semantic search with Ollama

Search combines keywords with meaning, so a question can find notes that use other words or another language, such as a Chinese question about English notes. [Ollama](https://ollama.com) computes the embeddings on your computer; your notes are not uploaded.

1. Install Ollama and keep it running.
2. Download the embedding model once (about 1.2 GB):

   ```bash
   ollama pull bge-m3
   ```

3. Open **Settings → Zettel Agent → Semantic search**. It is on by default. The Index line shows progress and says "Ready" once every note is embedded.

The first indexing takes about 15 seconds for 300 notes on an Apple M1 Pro. Vectors are cached in `.obsidian/plugins/zettel-agent/vectors/`, and edited notes are embedded again automatically. While Ollama is not running, or until 95% of notes are embedded, search uses keywords only.

The default model is `bge-m3`. `qwen3-embedding:0.6b` also works. Other Ollama embedding models work too, but their results are merged with keyword results by rank instead of tuned weights. If you set the Ollama address to another computer, your notes are sent there to be embedded.

## Development

Requires Node 24.

```bash
npm ci
npm run check       # typecheck, lint, format and unit tests
npm run build       # builds main.js
npm run eval        # retrieval evaluation on the sample vault, no model calls
npm run eval:embed  # embeds the sample vault and evaluation queries with the local Ollama
npm run e2e         # end-to-end tests in Obsidian with scripted answers (macOS)
```

More retrieval evaluations: `eval:crosslingual`, `eval:exact`, `eval:exact-terms`, `eval:sweep` and `eval:rewrite`. `AGENT_SMOKE=1 npm run eval:agent-smoke` calls a paid model API.

To try it, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/zettel-agent/`.

## License

[MIT](LICENSE)
