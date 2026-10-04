import { mkdir, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";

import { connectToFixtureVault } from "./obsidian";
import { DEBUG_PORT, ObsidianPage } from "./cdp";

/** Obsidian 1.13 can put Settings in a separate about:blank window. Capture only
 * the document marked from the verified fixture's active settings tab. */
async function settingsScreenshot(page: ObsidianPage): Promise<string> {
  const marker = `zettel-ui-${Date.now()}`;
  const mainDocument = await page.evaluate<boolean>(
    `
    const doc = app.setting.activeTab.containerEl.ownerDocument;
    doc.body.dataset.zettelUiCapture = args.marker;
    return doc === document;
  `,
    { marker },
  );
  if (mainDocument) return page.screenshot();
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
  const targets = (await response.json()) as {
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
  }[];
  for (const target of targets.filter((t) => t.type === "page" && t.url === "about:blank")) {
    const popup = await ObsidianPage.connect(target.webSocketDebuggerUrl);
    try {
      // Inspect just the marker; never read another window's notes or settings.
      const matched = await popup.evaluate<boolean>(
        "return document.body?.dataset.zettelUiCapture === args.marker;",
        { marker },
      );
      if (matched) return await popup.screenshot();
    } finally {
      popup.close();
    }
  }
  throw new Error("Fixture Settings screenshot target could not be identified.");
}

/** Real fixture UI; scripted answers and in-memory settings only. No paid requests. */
it("guides setup, folds research, exposes answer actions and supports keyboard source/history navigation", async () => {
  const page = await connectToFixtureVault();
  const output = `artifacts/ui-polish/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(output, { recursive: true });
  try {
    const setup = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      const saved = window.__uiPolish = {
        settings: structuredClone(plugin.settings), provider: session.deps.provider,
        store: session.deps.store, list: plugin.conversations.list,
        bodyClass: document.body.className,
        files: app.vault.getMarkdownFiles().map(f => f.path).sort(),
      };
     
      plugin.settings.apiKeySecretIds[plugin.settings.provider] = "";
      session.deps.store = { save: async () => {} };
      await plugin.activateChatView(); session.reset(); plugin.notifyConfiguration();
      await new Promise(r => setTimeout(r, 100));
      const missingKey = document.querySelector(".za-setup")?.textContent.includes("API key");
      const scope = document.querySelector(".za-scope")?.textContent.includes("318 notes");
      const input = document.querySelector(".za-composer-input");
      const accessibleInput = input.getAttribute("aria-label") === "Ask your Zettelkasten" && !!document.getElementById(input.getAttribute("aria-describedby"));
      document.querySelector(".za-setup button").click();
      await new Promise(r => setTimeout(r, 400));
      const tab = app.setting.activeTab;
      const names = [...tab.containerEl.querySelectorAll(".setting-item-name")].map(n => n.textContent);
      return { missingKey, scope, accessibleInput, settingsOpened: tab.id === "zettel-agent", modelFirst: names.slice(0, 3).join("/") === "Model/Provider/API key" };
    `);
    await writeFile(
      `${output}/01-settings.png`,
      Buffer.from(await settingsScreenshot(page), "base64"),
    );
    expect(setup).toEqual({
      missingKey: true,
      scope: true,
      accessibleInput: true,
      settingsOpened: true,
      modelFirst: true,
    });

    const answer = await page.evaluate<Record<string, unknown>>(String.raw`
      app.setting.close();
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      const saved = window.__uiPolish;
      plugin.settings = structuredClone(saved.settings);
     
      plugin.notifyConfiguration();
      const target = plugin.vaultCorpus.current.paths()[0];
      saved.target = target;
      let step = 0;
      session.deps.provider = async () => ({ provider: "scripted", model: "ui-polish", describeError: () => "Fixture UI failure", send: async (request, handlers) => {
        const parts = step++ === 0 ? [{ type: "text", text: "I will read your source." }, { type: "tool_call", id: "ui-read", name: "read", input: { target } }] : [{ type: "text", text: "## Fixture answer\n\nRead the delivered source [E1]." }];
        if (step === 1) handlers.onThinking("Synthetic research trace for the UI test.");
        for (const p of parts) if (p.type === "text") handlers.onText(p.text);
        return { message: { role: "assistant", parts }, finish: step === 1 ? "tool_calls" : "end", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      }});
      session.reset(); await session.send("Show a source for the UI test.");
      await new Promise(r => setTimeout(r, 250));
      saved.record = session.toRecord();
      const details = document.querySelector(".za-research");
      const final = document.querySelector(".za-message-assistant > .za-markdown");
      const visibleAnswer = !!final && final.getClientRects().length > 0 && final.textContent.includes("Fixture answer");
      const traceHidden = !details.open && !details.querySelector(".za-tool").checkVisibility();
      const actions = [...document.querySelectorAll(".za-message-footer button")].map(b => b.textContent);
      const titled = [...document.querySelectorAll(".za-header button")].every(b => b.title === b.getAttribute("aria-label"));
      const writeClipboard = navigator.clipboard.writeText;
      let copied = "";
      try {
        navigator.clipboard.writeText = async text => { copied = text; };
        document.querySelector('button[aria-label^="Copy answer"]').click();
        await new Promise(r => setTimeout(r, 30));
      } finally { navigator.clipboard.writeText = writeClipboard; }
      const copiedFinal = copied.includes("Fixture answer") && copied.includes("[[") && !copied.includes("I will read") && !copied.includes("[E1]");
      const chip = final.querySelector(".za-cite");
      chip.focus(); chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const keyboardSource = chip.tabIndex === 0 && chip.getAttribute("aria-label").includes("Open source") && app.workspace.getMostRecentLeaf().view.file.path === target;
      const history = document.querySelector('button[aria-label="Chat history"]');
      plugin.conversations.list = async () => [];
      history.focus(); history.click(); await new Promise(r => setTimeout(r, 100));
      const dialog = document.querySelector(".za-history");
      const focused = dialog.contains(document.activeElement);
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const historyKeyboard = focused && !document.querySelector(".za-history") && document.activeElement === history && history.getAttribute("aria-expanded") === "false";
      plugin.conversations.list = async () => { throw new Error("fixture storage unavailable"); };
      history.click(); await new Promise(r => setTimeout(r, 100));
      const historyError = document.querySelector(".za-history").textContent.includes("could not be loaded") && !document.querySelector(".za-history").textContent.includes("No saved chats");
      document.querySelector('button[aria-label="Close history"]').click();
      await new Promise(r => setTimeout(r, 100));
      // Deleting asks for a second click on the same row; Escape cancels it without closing.
      const deleted = [];
      const deleteChat = plugin.conversations.delete;
      plugin.conversations.list = async () => [{ id: "fixture-chat", title: "Fixture chat", updatedAt: new Date().toISOString(), questions: 1 }];
      plugin.conversations.delete = async (id) => { deleted.push(id); };
      history.click(); await new Promise(r => setTimeout(r, 100));
      document.querySelector('.za-history button[aria-label="Delete this chat"]').click(); await new Promise(r => setTimeout(r, 100));
      const confirmButton = document.querySelector(".za-history-confirm");
      const asked = confirmButton?.textContent === "Delete" && deleted.length === 0 && document.activeElement === confirmButton;
      document.querySelector(".za-history").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 100));
      const cancelled = !document.querySelector(".za-history-confirm") && !!document.querySelector(".za-history");
      document.querySelector('.za-history button[aria-label="Delete this chat"]').click(); await new Promise(r => setTimeout(r, 100));
      document.querySelector(".za-history-confirm").click(); await new Promise(r => setTimeout(r, 100));
      const deleteConfirm = asked && cancelled && deleted.join() === "fixture-chat" && document.querySelector(".za-history").textContent.includes("No saved chats");
      document.querySelector('button[aria-label="Close history"]').click();
      plugin.conversations.list = saved.list; plugin.conversations.delete = deleteChat;
      return { visibleAnswer, traceHidden, actions, titled, copiedFinal, keyboardSource, historyKeyboard, historyError, deleteConfirm };
    `);
    await writeFile(`${output}/03-answer.png`, Buffer.from(await page.screenshot(), "base64"));
    expect(answer).toEqual({
      visibleAnswer: true,
      traceHidden: true,
      actions: ["Copy", "Insert", "Ask again"],
      titled: true,
      copiedFinal: true,
      keyboardSource: true,
      historyKeyboard: true,
      historyError: true,
      deleteConfirm: true,
    });

    const states = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session, saved = window.__uiPolish;
      const record = structuredClone(saved.record);
      record.items.at(-1).parts.unshift({ kind: "tool", id: "synthetic-budget", name: "search", input: {}, summary: "search → output-budget", isError: true });
      session.load(record); await new Promise(r => setTimeout(r, 100));
      const limited = [...document.querySelectorAll(".za-note")].some(n => n.textContent.includes("Research limit reached"));
      document.querySelector(".za-research > summary").click();
      const traceAvailable = document.querySelector(".za-research").open && document.querySelector(".za-tool.is-error").textContent.includes("output-budget");
      session.load(saved.record);
      // Measure actual rendered layout in a narrow sidebar, then capture its dark theme.
      const chat = document.querySelector(".za-chat"); saved.chatStyle = chat.getAttribute("style");
      chat.style.width = "320px";
      document.body.classList.remove("theme-light"); document.body.classList.add("theme-dark");
      await new Promise(r => setTimeout(r, 100));
      const box = chat.getBoundingClientRect();
      const within = selector => [...chat.querySelectorAll(selector)].every(el => { const r = el.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1; });
      return { limited, traceAvailable, noOverflow: chat.scrollWidth <= chat.clientWidth + 1, controlsFit: within(".za-header button, .za-message-footer button, .za-composer-input"), dark: document.body.classList.contains("theme-dark") };
    `);
    await writeFile(`${output}/04-narrow-dark.png`, Buffer.from(await page.screenshot(), "base64"));
    expect(states).toEqual({
      limited: true,
      traceAvailable: true,
      noOverflow: true,
      controlsFit: true,
      dark: true,
    });
    await writeFile(`${output}/checks.json`, JSON.stringify({ setup, answer, states }, null, 2));
    console.log(`UI screenshots: ${output}`);
  } finally {
    await page
      .evaluate(
        String.raw`
      const saved = window.__uiPolish;
      if (saved) {
        app.setting.close();
        const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
        session.stop(); session.deps.provider = saved.provider; session.deps.store = saved.store;
        plugin.settings = saved.settings; plugin.conversations.list = saved.list;
        document.body.className = saved.bodyClass;
        const chat = document.querySelector(".za-chat");
        if (chat) { if (saved.chatStyle) chat.setAttribute("style", saved.chatStyle); else chat.removeAttribute("style"); }
        session.reset(); plugin.notifyConfiguration();
        delete window.__uiPolish;
        if (JSON.stringify(saved.files) !== JSON.stringify(app.vault.getMarkdownFiles().map(f => f.path).sort())) throw new Error("Fixture filenames changed.");
      }
    `,
      )
      .finally(() => page.close());
  }
});
