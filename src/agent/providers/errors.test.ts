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
  ])("explains status %i", (status, text) => {
    expect(describeSdkError(withStatus(status), "DeepSeek")).toContain(text);
  });

  it("explains connection failures and plain errors", () => {
    const offline = new OpenAI.APIConnectionError({ message: "offline" });
    expect(describeSdkError(offline, "OpenAI")).toBe(
      "Could not reach OpenAI. Check your network connection.",
    );
    expect(describeSdkError(new Error("plain"), "OpenAI")).toBe("plain");
    expect(describeSdkError("weird", "OpenAI")).toBe("The request failed.");
  });
});
