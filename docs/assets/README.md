# Fixture visual assets

`fixture-scripted-answer.png` is an unedited Chrome DevTools Protocol screenshot
of the actual fixture Obsidian 1.13.7 window, captured by
`e2e/release-assets.e2e.ts`. Source: the frozen QLoRA permanent note plus its
literature link. Answer: scripted SSE through the real DeepSeek SDK adapter,
then strict offline replay with zero network. The screenshot is not a mockup,
paid model result, or answer-quality evaluation. It contains no personal notes,
keys or key settings. The timestamp in the question identifies its synthetic SDK
fixture run. The older `docs/images/chat.png` remains untouched historical material.

The architecture diagram is editable Mermaid in the root `README.md`, under
“Architecture and design.”
`fixture-answer.png` is a separate unedited real-API screenshot captured in
scenario 1 of `live-2026-10-03T06-25-23-565Z` by `release-live.e2e.ts`. It shows the
actual DeepSeek Flash answer, BM25 search/read steps and the frozen QLoRA source
note on macOS / Obsidian 1.13.7. No secret, settings page or personal note is visible.
It illustrates basic UI/evidence behavior, not a quality guarantee. The scripted
screenshot remains separately labeled and unchanged by the live capture.
