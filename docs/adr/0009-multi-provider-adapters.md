# ADR-0009: Provider-neutral transcript with per-provider adapters

- Status: Accepted
- Date: 2026-09-30
- Refines: ADR-0008 (decision 1, "The loop is ours")

## Context

The first version of the loop used Anthropic's message types as its transcript format. The owner wants to choose between Claude, OpenAI and DeepSeek. The main reason is cost: at September 2026 prices, DeepSeek Flash costs a small fraction of Claude Opus per question, which suits everyday development. A second reason is that the same judged queries can then compare how well each model does agentic retrieval.

The three APIs differ in ways that matter to an agent loop:

- **Anthropic Messages.** Thinking blocks carry signatures and must be echoed back verbatim to the same model. Caching is explicit, via `cache_control`. `tool_choice: none` is supported.
- **OpenAI.** GPT-6 Astra and GPT-6.1 Sol support tool calling only through the **Responses API**; Chat Completions works for them only without tools. To keep a conversation stateless (`store: false`), each response's output items, including the encrypted reasoning, have to be sent back on the next request.
- **DeepSeek (Chat Completions).** When a request includes tools, every earlier assistant message must carry `reasoning_content`. In thinking mode `tool_choice` is not supported, so thinking has to be switched off for any request that sets `tool_choice: "none"`.

Common practice (the Vercel AI SDK, LangChain, LiteLLM) is to use one neutral message and stream format, with one adapter per provider.

## Decision

1. **A neutral transcript.** `agent/messages.ts` defines user and assistant messages built from text, thinking, tool-call and tool-result parts. The loop, the session and the tools see only this format.
2. **Raw replay.** Each assistant message stores the provider's own content in `raw`, tagged with provider and model. When the next request goes to that same provider and model, the adapter sends `raw` back verbatim. This keeps signatures, encrypted reasoning and `reasoning_content` intact. When the request goes to any other model, the adapter rebuilds the message from the neutral parts instead.
3. **Three adapters behind `ModelProvider`,** each built on the official SDK for its API:
   - `AnthropicProvider`: `@anthropic-ai/sdk`, beta Messages streaming, top-level prompt caching, adaptive thinking, explicit effort, server-side refusal fallbacks.
   - `OpenAIResponsesProvider`: `openai`, Responses API with `store: false`, `include: ["reasoning.encrypted_content"]`, and reasoning summaries streamed as thinking.
   - `ChatCompletionsProvider`: `openai` pointed at `baseURL`, configured here for DeepSeek. It enables thinking while tools are allowed and disables it on the final forced-answer request. The same adapter can serve other Chat Completions endpoints later, such as Ollama or OpenRouter.
4. **Normalized results.** Every adapter returns an assistant message, a finish reason (`end`, `tool_calls`, `max_tokens`, `refusal` or `pause`) and usage, meaning billed input, output, cache-read and cache-write tokens. Errors are described from their HTTP status, not from class names, because class names do not survive minification.
5. **Settings** store the chosen provider, plus one model and one secret-storage key id for each provider. Settings from v0.1 are migrated.

We considered the Vercel AI SDK and did not adopt it. Its main value is its own agent loop, which duplicates ours. Its Anthropic provider also tends to trail beta features we use, such as refusal fallbacks and adaptive thinking display. The adapters follow its conventions instead: a neutral format, normalized stream events, and provider-specific options kept inside each adapter.

## Consequences

- Choosing a model is a settings change. The judged queries can also be run across providers.
- Switching models mid-conversation works, but earlier reasoning is not replayed to the new model.
- The bundle grows to about 1.3 MB because of the `openai` SDK.
- Contract tests pin each adapter's wire format. For DeepSeek, the real SDK runs against a fake SSE `fetch`, so the tests check the request bodies it actually sends. The Anthropic and OpenAI converters are tested as pure functions. Streaming against each live API still needs a manual smoke test.
- The system prompt and tool list are tuned on Claude. Other models may need prompt adjustments, and the evaluation should show where.
