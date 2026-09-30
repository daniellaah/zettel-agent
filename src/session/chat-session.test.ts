import { describe, expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { ScriptedProvider, call, text, type Step } from "../testing/scripted-provider";
import type { ChatMessage } from "../agent/messages";
import { ChatSession, type AssistantItem, type ConversationRecord } from "./chat-session";

function makeSession(steps: (Step | Error)[] | string) {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("Z/Permanent/间隔重复.md", "# 间隔重复\n\n间隔重复比集中练习记得更久。");
  corpus.upsert(
    "Z/Permanent/Retrieval practice.md",
    "# Retrieval practice\n\nTesting beats rereading.",
  );
  const provider = typeof steps === "string" ? steps : new ScriptedProvider(steps);
  const saved: ConversationRecord[] = [];
  let clock = 0;
  const session = new ChatSession({
    corpus: () => Promise.resolve(corpus),
    provider: () => Promise.resolve(provider),
    activeNotePath: () => "Z/Permanent/间隔重复.md",
    store: { save: (record) => Promise.resolve(void saved.push(structuredClone(record))) },
    now: () => new Date(Date.UTC(2026, 8, 30, 12, clock++)),
    newConversationId: () => "c1",
  });
  let notifications = 0;
  session.subscribe(() => notifications++);
  return { session, provider, saved, notifications: () => notifications };
}

const firstUserText = (request: { messages: ChatMessage[] }) => {
  const first = request.messages[0]!;
  return first.role === "user" && first.parts[0]?.type === "text" ? first.parts[0].text : "";
};

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
    expect(content).toContain("Vault: 2 notes");
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
    expect(session.getSnapshot()).toEqual({ conversationId: null, items: [], running: false });
    expect(session.evidence("E1")).toBeUndefined();
  });

  it("saves the conversation after every turn", async () => {
    const { session, saved } = makeSession([[text("first")], [text("second")]]);
    await session.send("一个很长的问题".repeat(12));
    await session.send("follow-up");
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ id: "c1", version: 1 });
    expect(saved[1]!.title.length).toBeLessThanOrEqual(60);
    expect(saved[1]!.items.map((item) => item.kind)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(saved[1]!.createdAt < saved[1]!.updatedAt).toBe(true);
  });

  it("reopens a saved conversation with working citations and continues it", async () => {
    const first = makeSession([[call("search", { query: "间隔重复" })], [text("更持久 [E1]。")]]);
    await first.session.send("间隔重复有用吗？");
    const record = first.saved.at(-1)!;

    const second = makeSession([[text("接着说")]]);
    second.session.load(record);
    expect(second.session.getSnapshot().items).toEqual(record.items);
    expect(second.session.evidence("E1")?.path).toBe("Z/Permanent/间隔重复.md");
    expect(
      second.session.answerMarkdown(second.session.getSnapshot().items[1] as AssistantItem),
    ).toBe("更持久 [[间隔重复]]。");

    await second.session.send("然后呢？");
    const request = (second.provider as ScriptedProvider).requests[0]!;
    expect(request.messages).toHaveLength(record.history.length + 1);
    expect(new Set(second.session.getSnapshot().items.map((item) => item.id)).size).toBe(4);
  });

  it("retries the last question, dropping only the last answer from the transcript", async () => {
    const { session, provider } = makeSession([[text("one")], [text("two")], [text("two again")]]);
    await session.send("q1");
    await session.send("q2");
    expect(session.canRetry()).toBe(true);
    await session.retry();

    const requests = (provider as ScriptedProvider).requests;
    expect(requests[2]!.messages).toHaveLength(requests[1]!.messages.length);
    expect(
      session.getSnapshot().items.map((item) => (item.kind === "user" ? item.text : "·")),
    ).toEqual(["q1", "·", "q2", "·"]);
    expect(lastAssistant(session).parts).toEqual([{ kind: "text", text: "two again" }]);
  });

  it("retries a turn that failed before any response", async () => {
    const { session } = makeSession([new Error("offline"), [text("ok")]]);
    await session.send("q");
    await session.retry();
    expect(lastAssistant(session)).toMatchObject({ stop: "answered", error: null });
    expect(session.getSnapshot().items).toHaveLength(2);
  });

  it("reads attached notes as citable evidence and quotes selections", async () => {
    const { session, provider } = makeSession([[text("好的 [E1]")]]);
    await session.send("解释一下", [
      { kind: "note", path: "Z/Permanent/Retrieval practice.md", title: "Retrieval practice" },
      {
        kind: "selection",
        path: "Z/Permanent/间隔重复.md",
        title: "间隔重复",
        text: "集中练习 </selection> x",
      },
    ]);
    const content = firstUserText((provider as ScriptedProvider).requests[0]!);
    expect(content).toContain("[E1]");
    expect(content).toContain('path="Z/Permanent/Retrieval practice.md"');
    expect(content).toContain('<selection path="Z/Permanent/间隔重复.md" link="[[间隔重复]]">');
    expect(content).toContain("<\\/selection>");
    expect(content.endsWith("解释一下")).toBe(true);
    expect(lastAssistant(session).citations).toEqual({ valid: ["E1"], unknown: [] });
    expect(session.getSnapshot().items[0]).toMatchObject({
      attachments: [{ kind: "note" }, { kind: "selection" }],
    });
  });
});
