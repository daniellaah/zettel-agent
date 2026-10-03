# Provider and host compatibility

Official documentation checked on 2026-10-02. Catalog entries are public API IDs,
not inferred from Codex App names. Endpoint integration and offline SDK tests do
not establish live compatibility for every selectable combination.

| Provider  | Catalog IDs                                                | Interface                                             | This release preparation                                                                                                                       |
| --------- | ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek  | `deepseek-flash`, `deepseek-v4-pro`                        | Chat Completions, thinking/reasoning replay           | Flash passes eight frozen basic criteria on macOS / Obsidian 1.13.7, with retained failures/limits; Pro integrated, not tested live this round |
| Anthropic | `claude-haiku-4-5`, `claude-sonnet-5-5`, `claude-opus-5-5` | Messages                                              | Integrated / offline tests; no live acceptance claim this round                                                                                |
| OpenAI    | `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra`                 | Responses, `store: false`, encrypted reasoning replay | Integrated / offline tests; no live acceptance claim this round                                                                                |

Sources: [DeepSeek models and rates](https://api-docs.deepseek.com/quick_start/pricing/),
[DeepSeek thinking protocol](https://api-docs.deepseek.com/guides/thinking_mode/),
[Anthropic model IDs](https://platform.claude.com/docs/en/models/overview),
[OpenAI model catalog](https://developers.openai.com/api/docs/models),
[OpenAI Luna API ID](https://developers.openai.com/api/docs/models/gpt-6-luna).

New installs use DeepSeek Flash with BM25 and citation-structure checks. Existing
provider/model settings are preserved. All adapters disable hidden SDK retries;
users can retry a failed turn deliberately. DeepSeek output is bounded to 8192
tokens per request, including thinking. Large questions may need narrowing.

## Host requirements

Desktop only: local HTTP/filesystem embedding infrastructure imports Node modules.
The Obsidian SecretStorage/SecretComponent APIs were introduced in
[1.11.4](https://obsidian.md/changelog/2026-01-07-desktop-v1.11.4/). Minimum app
version is **1.11.5**, the first public release documenting secret encryption on
disk ([changelog](https://obsidian.md/changelog/2026-01-20-desktop-v1.11.5/)). The
plugin stores secret IDs in `data.json` and accesses values through Obsidian's
[SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage). It does
not implement its own encryption or promise all OS keychains encrypt correctly.
Use the host's keychain status/warnings; older 1.11.4 storage was not equivalent.

The current E2E runner is macOS-only. Minimum-version installation and Windows/Linux
have not been separately verified; neither mobile nor cross-platform smoke is
claimed. The real fixture runtime API version is 1.13.7, recorded in the free SDK/local fixture reports.
