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
    await Promise.resolve();
    const { session, notifications } = makeSession([
      [text("先搜一下。"), call("search", { query: "间隔重复" })],
      [text("间隔重复更持久 [E1]。")],
    ]);
    await session.send("间隔重复有用吗？");

    const item = lastAssistant(session);
    expect(item.parts.map((part) => part.kind)).toEqual(["text", "tool", "text"]);
    expect(item.parts[1]).toMatchObject({
      name: "search",
      summary: 'search "间隔重复" → 1 section',
    });
    expect(item.status).toBe("done");
    expect(item.citations).toEqual({ valid: ["E1"], unknown: [] });
    expect(session.evidence("E1")?.path).toBe("Z/Permanent/间隔重复.md");
    expect(session.getSnapshot().running).toBe(false);
    expect(notifications()).toBeGreaterThan(3);
  });

  it("puts the vault context and the active note in the user turn", async () => {
    await Promise.resolve();
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
    await Promise.resolve();
    const { session, provider } = makeSession([[text("first")], [text("second")]]);
    await session.send("one");
    await session.send("two");
    const second = (provider as ScriptedProvider).requests[1]!;
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("shows a setup problem instead of calling the model", async () => {
    await Promise.resolve();
    const { session } = makeSession("Set your Anthropic API key in settings.");
    await session.send("hi");
    expect(lastAssistant(session)).toMatchObject({
      stop: "error",
      error: "Set your Anthropic API key in settings.",
    });
  });

  it("drops a turn that failed before any response", async () => {
    await Promise.resolve();
    const { session, provider } = makeSession([new Error("offline"), [text("ok")]]);
    await session.send("one");
    expect(lastAssistant(session)).toMatchObject({ stop: "error", error: "offline" });
    await session.send("two");
    const retry = (provider as ScriptedProvider).requests[1]!;
    expect(retry.messages).toHaveLength(1);
  });

  it("ignores empty input and clears everything on reset", async () => {
    await Promise.resolve();
    const { session } = makeSession([[text("ok")]]);
    await session.send("   ");
    expect(session.getSnapshot().items).toEqual([]);
    await session.send("hi");
    session.reset();
    expect(session.getSnapshot()).toEqual({ conversationId: null, items: [], running: false });
    expect(session.evidence("E1")).toBeUndefined();
  });

  it("saves the conversation after every turn", async () => {
    await Promise.resolve();
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
    await Promise.resolve();
    const first = makeSession([[call("search", { query: "间隔重复" })], [text("更持久 [E1]。")]]);
    await first.session.send("间隔重复有用吗？");
    const record = first.saved.at(-1)!;

    const second = makeSession([[text("接着说")]]);
    second.session.load(record);
    expect(second.session.getSnapshot().items).toEqual(record.items);
    expect(second.session.evidence("E1")?.path).toBe("Z/Permanent/间隔重复.md");
    expect(
      second.session.answerMarkdown(second.session.getSnapshot().items[1] as AssistantItem),
    ).toBe("更持久 [[Z/Permanent/间隔重复]]。");

    await second.session.send("然后呢？");
    const request = (second.provider as ScriptedProvider).requests[0]!;
    expect(request.messages).toHaveLength(record.history.length + 1);
    expect(new Set(second.session.getSnapshot().items.map((item) => item.id)).size).toBe(4);
  });

  it("retries the last question, dropping only the last answer from the transcript", async () => {
    await Promise.resolve();
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
    await Promise.resolve();
    const { session } = makeSession([new Error("offline"), [text("ok")]]);
    await session.send("q");
    await session.retry();
    expect(lastAssistant(session)).toMatchObject({ stop: "answered", error: null });
    expect(session.getSnapshot().items).toHaveLength(2);
  });

  it("reads attached notes as citable evidence and quotes selections", async () => {
    await Promise.resolve();
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

it("persists attachment delivery scopes and excludes outside-corpus selections", async () => {
  await Promise.resolve();
  const { session } = makeSession([[text("answer")]]);
  await session.send("question", [
    { kind: "note", path: "Z/Permanent/Retrieval practice.md", title: "Retrieval practice" },
    { kind: "selection", path: "outside.md", title: "Outside", text: "PRIVATE SELECTION" },
  ]);
  const record = session.toRecord();
  expect(JSON.stringify(record!.history)).not.toContain("PRIVATE SELECTION");
  const first = record!.history[0]!;
  expect(first.role).toBe("user");
  if (first.role === "user") {
    expect(first.deliveries?.[0]?.tool).toBe("read");
    expect(first.deliveries?.[0]?.exposures.some((span) => span.scope === "body")).toBe(true);
  }
});

it("recovers from provider and corpus initialization failures and reports save failure", async () => {
  await Promise.resolve();
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("P/Test.md", "# Test\nFixture");
  let fail = true;
  const session = new ChatSession({
    corpus: async () => {
      await Promise.resolve();
      if (fail) throw new Error("secret corpus error");
      return corpus;
    },
    provider: async () => {
      await Promise.resolve();
      if (fail) throw new Error("secret provider error");
      return new ScriptedProvider([[text("ok")]]);
    },
    activeNotePath: () => null,
    store: {
      save: async () => {
        await Promise.resolve();
        throw new Error("secret storage error");
      },
    },
  });
  await session.send("first");
  expect(session.getSnapshot().running).toBe(false);
  expect(lastAssistant(session).error).not.toContain("secret");
  fail = false;
  await session.send("second");
  expect(lastAssistant(session)).toMatchObject({
    status: "done",
  });
  expect(lastAssistant(session).error).toContain("could not be saved");
  expect(session.answerMarkdown(lastAssistant(session))).toBe("ok");
});

it("cancels pending initialization and prevents late results contaminating a new turn", async () => {
  await Promise.resolve();
  let resolve!: (value: ScriptedProvider) => void;
  const late = new ScriptedProvider([[text("old answer")]]);
  let first = true;
  const session = new ChatSession({
    corpus: () => {
      const c = new Corpus({ stageForPath: () => "permanent" });
      c.upsert("P/Test.md", "# Test\nFixture");
      return Promise.resolve(c);
    },
    provider: () =>
      first
        ? ((first = false),
          new Promise((r) => {
            resolve = r;
          }))
        : Promise.resolve(new ScriptedProvider([[text("new answer")]])),
    activeNotePath: () => null,
  });
  const old = session.send("old");
  session.stop();
  expect(lastAssistant(session)).toMatchObject({ status: "done", stop: "aborted" });
  session.reset();
  await session.send("new");
  resolve(late);
  await old;
  expect(late.requests).toHaveLength(0);
  expect(session.answerMarkdown(lastAssistant(session))).toBe("new answer");
  expect(session.getSnapshot().running).toBe(false);
});

it("isolates corpus initialization across loading history", async () => {
  await Promise.resolve();
  let release!: (c: Corpus) => void;
  const session = new ChatSession({
    corpus: () =>
      new Promise((r) => {
        release = r;
      }),
    provider: () => Promise.resolve(new ScriptedProvider([[text("old")]])),
    activeNotePath: () => null,
  });
  const pending = session.send("old");
  await Promise.resolve();
  await Promise.resolve();
  session.load({
    version: 1,
    id: "loaded",
    title: "Loaded",
    createdAt: "2026-10-02",
    updatedAt: "2026-10-02",
    items: [],
    history: [],
    evidence: [],
  });
  release(new Corpus({ stageForPath: () => "permanent" }));
  await pending;
  expect(session.getSnapshot()).toEqual({ conversationId: "loaded", items: [], running: false });
});

it("recovers a failed corpus initialization before any model dispatch", async () => {
  const provider = new ScriptedProvider([[text("recovered")]]);
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("P/Test.md", "# Test\nFixture");
  let fail = true;
  const session = new ChatSession({
    corpus: () => (fail ? Promise.reject(new Error("private failure")) : Promise.resolve(corpus)),
    provider: () => Promise.resolve(provider),
    activeNotePath: () => null,
  });
  await session.send("first");
  expect(session.getSnapshot().running).toBe(false);
  expect(provider.requests).toHaveLength(0);
  fail = false;
  await session.send("second");
  expect(session.answerMarkdown(lastAssistant(session))).toBe("recovered");
});

describe("answer provenance in a session", () => {
  it("bounds each answer's consulted notes by its own turn", async () => {
    await Promise.resolve();
    const { session } = makeSession([
      [call("search", { query: "间隔重复" })],
      [text("间隔重复更持久 [E1]。")],
      [call("read", { target: "Z/Permanent/Retrieval practice.md" })],
      [text("Testing beats rereading [E2], as before [E1].")],
    ]);
    await session.send("间隔重复有用吗？");
    await session.send("And retrieval practice?");
    const [first, second] = session
      .getSnapshot()
      .items.filter((item): item is AssistantItem => item.kind === "assistant");
    const one = session.provenance(first!);
    const two = session.provenance(second!);
    expect(one.cited.map((s) => [s.id, s.seen])).toEqual([["E1", "excerpt"]]);
    expect(one.consulted).toEqual([]);
    expect(two.cited.map((s) => [s.id, s.title, s.seen])).toEqual([
      ["E2", "Retrieval practice", "body"],
      ["E1", "间隔重复", "excerpt"],
    ]);
    expect(two.notes).toBe(2);
  });
});
