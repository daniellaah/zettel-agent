# Zettel Agent

An Obsidian plugin that answers questions about your Zettelkasten, with citations to your notes.

## Development

Requires Node 24.

```bash
npm ci
npm run check   # typecheck, lint, format and unit tests
npm run build   # builds main.js
npm run eval    # retrieval evaluation on the sample vault, no model calls
npm run e2e     # end-to-end tests in Obsidian with scripted answers (macOS)
```

To try it, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/zettel-agent/`.

## License

[MIT](LICENSE)
