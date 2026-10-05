import type { ResultContract } from "./tool-contract";

/**
 * Provider-neutral conversation format. The agent loop, the session and the tools only
 * speak this; each provider adapter converts it to and from its own wire format.
 *
 * Assistant messages can also carry `raw`: the provider's own content, kept verbatim so it
 * can be sent back unchanged to the same provider and model. That preserves what the
 * neutral parts cannot express: Anthropic thinking signatures, OpenAI encrypted reasoning,
 * DeepSeek `reasoning_content`. When the conversation moves to another model, adapters
 * fall back to the neutral parts.
 */

export interface TextPart {
  type: "text";
  text: string;
}

interface ThinkingPart {
  type: "thinking";
  text: string;
}

export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultPart {
  type: "tool_result";
  callId: string;
  content: string;
  isError: boolean;
  /** Local provenance; adapters send only content/isError to providers. */
  contract?: ResultContract;
}

interface UserMessage {
  role: "user";
  /** Host control messages are not new human turns when selecting a context window. */
  origin?: "control";
  parts: (TextPart | ToolResultPart)[];
  /** Attached note deliveries; never sent as provider wire metadata. */
  deliveries?: ResultContract[];
}

interface RawContent {
  provider: string;
  model: string;
  content: unknown;
}

export interface AssistantMessage {
  role: "assistant";
  parts: (TextPart | ThinkingPart | ToolCallPart)[];
  raw?: RawContent;
}

export type ChatMessage = UserMessage | AssistantMessage;

export function userText(text: string): UserMessage {
  return { role: "user", parts: [{ type: "text", text }] };
}

export function textOf(message: AssistantMessage): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

export function toolCallsOf(message: AssistantMessage): ToolCallPart[] {
  return message.parts.filter((part): part is ToolCallPart => part.type === "tool_call");
}

/** Every recorded delivery in these messages: attached notes and tool results, in order. */
export function deliveries(
  messages: readonly ChatMessage[],
): { contract: ResultContract; attached: boolean }[] {
  return messages.flatMap((message) =>
    message.role === "user"
      ? [
          ...(message.deliveries ?? []).map((contract) => ({ contract, attached: true })),
          ...message.parts.flatMap((part) =>
            part.type === "tool_result" && part.contract
              ? [{ contract: part.contract, attached: false }]
              : [],
          ),
        ]
      : [],
  );
}

export function deliveredContracts(messages: readonly ChatMessage[]): ResultContract[] {
  return deliveries(messages).map((delivery) => delivery.contract);
}

/** The raw content, if it was produced by exactly this provider and model. */
export function rawFor<T>(message: AssistantMessage, provider: string, model: string): T | null {
  const raw = message.raw;
  return raw && raw.provider === provider && raw.model === model ? (raw.content as T) : null;
}

/** Parses a JSON tool-argument string; malformed input is kept so validation can report it. */
export function parseToolInput(json: string): unknown {
  if (json.trim() === "") return {};
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return { __unparsed_arguments: json };
  }
}
