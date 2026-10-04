import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { describeSdkError } from "./errors";

const withStatus = (status: number) => Object.assign(new Error("boom"), { status });

describe("describeSdkError", () => {
  it.each([
    [401, "rejected the API key"],
    [402, "insufficient balance"],
    [404, "does not recognise the selected model"],
    [429, "Rate limited by DeepSeek"],
    [500, "DeepSeek API error 500: boom"],
    [400, "DeepSeek API error 400: boom"],
  ])("explains status %i", (status, text) => {
    expect(describeSdkError(withStatus(status), "DeepSeek")).toContain(text);
  });

  it("does not repeat the status the SDK already put in the message", () => {
    const error = Object.assign(new Error("400 The supported API model names are x"), {
      status: 400,
    });
    expect(describeSdkError(error, "DeepSeek")).toBe(
      "DeepSeek API error 400: The supported API model names are x",
    );
  });

  it("explains connection failures and plain errors", () => {
    const offline = new OpenAI.APIConnectionError({ message: "offline" });
    expect(describeSdkError(offline, "OpenAI")).toBe(
      "Could not reach OpenAI. Check your network connection.",
    );
    expect(describeSdkError(new Error("plain"), "OpenAI")).toBe("plain");
    expect(describeSdkError(new TypeError("network error"), "DeepSeek")).toBe(
      "The connection to DeepSeek dropped. Check your network and try again.",
    );
    expect(describeSdkError("weird", "OpenAI")).toBe("The request failed.");
  });
});
