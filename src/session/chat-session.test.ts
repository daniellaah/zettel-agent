import { describe, expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { ScriptedProvider, call, text, type Step } from "../testing/scripted-provider";
import { ChatSession, type AssistantItem } from "./chat-session";

function makeSession(steps: (Step | Error)[] | string) {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("Z/Permanent/间隔重复.md", "# 间隔重复\n\n间隔重复比集中练习记得更久。");
  const provider = typeof steps === "string" ? steps : new ScriptedProvider(steps);
  const session = new ChatSession({
    corpus: () => Promise.resolve(corpus),
    provider: () => provider,
    activeNotePath: () => "Z/Permanent/间隔重复.md",
  });
  let notifications = 0;
  session.subscribe(() => notifications++);
  return { session, provider, notifications: () => notifications };
}

const lastAssistant = (session: ChatSession) => session.getSnapshot().items.at(-1) as AssistantItem;

describe("ChatSession", () => {
  it("interleaves text and tool parts in the assistant message", async () => {
    const { session, notifications } = makeSession([
      [text("先搜一下。"), call("search", { query: "间隔重复" })],
      [text("间隔重复更持久 [E1]。")],
    ]);
    await session.send("间隔重复有用吗？");

    const item = lastAssistant(session);
    expect(item.parts.map((part) => part.kind)).toEqual(["text", "tool", "text"]);
    expect(item.parts[1]).toMatchObject({ name: "search", summary: 'search "间隔重复" → 1 note' });
    expect(item.status).toBe("done");
    expect(item.citations).toEqual({ valid: ["E1"], unknown: [] });
    expect(session.evidence("E1")?.path).toBe("Z/Permanent/间隔重复.md");
    expect(session.getSnapshot().running).toBe(false);
    expect(notifications()).toBeGreaterThan(3);
  });

  it("puts the vault context and the active note in the user turn", async () => {
    const { session, provider } = makeSession([[text("ok")]]);
    await session.send("hi");
    const request = (provider as ScriptedProvider).requests[0]!;
    const first = request.messages[0]!;
    const content =
      first.role === "user" && first.parts[0]?.type === "text" ? first.parts[0].text : "";
    expect(content).toContain("Vault: 1 notes");
    expect(content).toContain('"间隔重复" (Z/Permanent/间隔重复.md) open');
    expect(content.endsWith("hi")).toBe(true);
  });

  it("carries the transcript into the next turn", async () => {
    const { session, provider } = makeSession([[text("first")], [text("second")]]);
    await session.send("one");
    await session.send("two");
    const second = (provider as ScriptedProvider).requests[1]!;
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("shows a setup problem instead of calling the model", async () => {
    const { session } = makeSession("Set your Anthropic API key in settings.");
    await session.send("hi");
    expect(lastAssistant(session)).toMatchObject({
      stop: "error",
      error: "Set your Anthropic API key in settings.",
    });
  });

  it("drops a turn that failed before any response", async () => {
    const { session, provider } = makeSession([new Error("offline"), [text("ok")]]);
    await session.send("one");
    expect(lastAssistant(session)).toMatchObject({ stop: "error", error: "offline" });
    await session.send("two");
    const retry = (provider as ScriptedProvider).requests[1]!;
    expect(retry.messages).toHaveLength(1);
  });

  it("ignores empty input and clears everything on reset", async () => {
    const { session } = makeSession([[text("ok")]]);
    await session.send("   ");
    expect(session.getSnapshot().items).toEqual([]);
    await session.send("hi");
    session.reset();
    expect(session.getSnapshot()).toEqual({ items: [], running: false });
    expect(session.evidence("E1")).toBeUndefined();
  });
});
