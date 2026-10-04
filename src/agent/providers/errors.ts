import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * User-facing messages for SDK errors, keyed on HTTP status (class names do not survive
 * minification). Both SDKs expose `status` on API errors.
 */
export function describeSdkError(error: unknown, providerLabel: string): string {
  if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) {
    return `Could not reach ${providerLabel}. Check your network connection.`;
  }
  if (!(error instanceof Error)) return "The request failed.";
  // A connection that drops mid-stream surfaces as a plain fetch/stream error.
  if (/network error|failed to fetch|terminated|ECONNRESET|socket hang up/i.test(error.message)) {
    return `The connection to ${providerLabel} dropped. Check your network and try again.`;
  }
  const status = (error as { status?: unknown }).status;
  switch (status) {
    case 401:
      return `${providerLabel} rejected the API key. Check it in the plugin settings.`;
    case 402:
      return `${providerLabel} reports insufficient balance on this account.`;
    case 403:
      return `This ${providerLabel} API key cannot use the selected model.`;
    case 404:
      return `${providerLabel} does not recognise the selected model. Check the model name in settings.`;
    case 429:
      return `Rate limited by ${providerLabel}, or the account is out of credit. Try again shortly.`;
  }
  if (typeof status === "number") {
    // SDK messages already start with the status ("400 The supported …").
    const detail = error.message.replace(new RegExp(`^${status}\\s*`), "");
    return `${providerLabel} API error ${status}: ${detail}`;
  }
  return error.message;
}
