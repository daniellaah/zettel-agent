import { mkdir, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";

import { connectToFixtureVault } from "./obsidian";

/** Real fixture UI with a scripted answer: no paid requests, note files untouched. */
it("shows where an answer came from and links sources with citation chips", async () => {
  const page = await connectToFixtureVault();
  const output = `artifacts/sources/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(output, { recursive: true });
  try {
    const folded = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      window.__sources = {
        settings: structuredClone(plugin.settings), provider: session.deps.provider,
        store: session.deps.store, bodyClass: document.body.className,
        files: app.vault.getMarkdownFiles().map(f => f.path).sort(),
      };
     
      session.deps.store = { save: async () => {} };
      await plugin.activateChatView(); session.reset(); plugin.notifyConfiguration();
      const storage = "02-Zettelkasten/Literature/Storage and computation precision in QLoRA.md";
      const ids = () => { const out = []; for (let i = 1; session.evidence("E" + i); i++) out.push(session.evidence("E" + i)); return out; };
      let step = 0;
      session.deps.provider = async () => ({ provider: "scripted", model: "sources", describeError: () => "Fixture failure", send: async (request, handlers) => {
        const now = step++;
        let parts;
        if (now === 0) parts = [{ type: "tool_call", id: "s1", name: "search", input: { query: "QLoRA four-bit storage computation precision" } }];
        else if (now === 1) parts = [{ type: "tool_call", id: "r1", name: "read", input: { target: storage } }];
        else {
          const read = ids().find(e => e.path === storage).id, excerpt = ids().find(e => e.path !== storage).id;
          window.__sources.ids = { read, excerpt };
          parts = [{ type: "text", text: "Four-bit storage is a storage decision [" + read + "].\n\nDouble quantization is separate [" + excerpt + "]." }];
        }
        for (const p of parts) if (p.type === "text") handlers.onText(p.text);
        return { message: { role: "assistant", parts }, finish: now < 2 ? "tool_calls" : "end", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      }});
      await session.send("Where does QLoRA's four-bit storage leave computation precision?");
      await new Promise(r => setTimeout(r, 300));
      const sources = document.querySelector(".za-message-assistant .za-sources");
      const summary = sources.querySelector("summary").textContent;
      const rows = sources.querySelectorAll(".za-source-list[aria-label='Cited sources'] .za-source");
      return {
        afterAnswer: sources.previousElementSibling?.classList.contains("za-markdown"),
        folded: !sources.open && !rows[0].checkVisibility(),
        summary: summary.includes("2 notes cited") && summary.includes("1 not read in full"),
        icons: [...sources.querySelectorAll("summary .za-disclosure-icon, summary .za-sources-flag-icon")].every(i => !!i.querySelector("svg")),
      };
    `);
    expect(folded).toEqual({ afterAnswer: true, folded: true, summary: true, icons: true });

    const opened = await page.evaluate<Record<string, unknown>>(String.raw`
      const saved = window.__sources, message = document.querySelector(".za-message-assistant");
      const sources = message.querySelector(".za-sources");
      sources.querySelector("summary").click();
      await new Promise(r => setTimeout(r, 100));
      const rows = [...sources.querySelectorAll(".za-source-list[aria-label='Cited sources'] .za-source")];
      const labels = rows.map(r => [r.querySelector(".za-source-number").textContent, r.querySelector(".za-source-seen").textContent]);
      const chip = id => message.querySelector(":scope > .za-markdown .za-cite-" + id);
      // A background test window delivers no native focus events, so dispatch hover and focus explicitly.
      const settle = () => new Promise(r => setTimeout(r, 50));
      const linkedChips = () => [...message.querySelectorAll(":scope > .za-markdown .za-cite.is-linked")].map(c => c.textContent);
      rows[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); await settle();
      const rowToChip = JSON.stringify(linkedChips()) === JSON.stringify([saved.ids.excerpt.slice(1)]);
      chip(saved.ids.read).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); await settle();
      const chipToRow = rows[0].classList.contains("is-linked") && !rows[1].classList.contains("is-linked");
      rows[1].focus(); rows[1].dispatchEvent(new FocusEvent("focusin", { bubbles: true })); await settle();
      const keyboard = rows[1].classList.contains("is-linked") && JSON.stringify(linkedChips()) === JSON.stringify([saved.ids.excerpt.slice(1)]);
      const hint = !!sources.querySelector(".za-sources-hint");
      const more = sources.querySelector(".za-sources-more summary")?.textContent ?? "";
      const described = rows[1].getAttribute("aria-label").includes("only a search excerpt") && !/verified|supported|correct/i.test(sources.textContent);
      rows[0].click(); await new Promise(r => setTimeout(r, 200));
      const opensSource = app.workspace.getMostRecentLeaf().view.file?.path === "02-Zettelkasten/Literature/Storage and computation precision in QLoRA.md";
      return { labels, rowToChip, chipToRow, keyboard, hint, more: /Also looked at \d+ notes? without citing/.test(more), described, opensSource,
        readId: saved.ids.read.slice(1), excerptId: saved.ids.excerpt.slice(1) };
    `);
    await writeFile(`${output}/01-sources.png`, Buffer.from(await page.screenshot(), "base64"));
    expect(opened).toMatchObject({
      rowToChip: true,
      chipToRow: true,
      keyboard: true,
      hint: true,
      more: true,
      described: true,
      opensSource: true,
    });
    expect(opened.labels).toEqual([
      [opened.readId, "Read"],
      [opened.excerptId, "Excerpt"],
    ]);

    const narrow = await page.evaluate<Record<string, unknown>>(String.raw`
      const chat = document.querySelector(".za-chat"); window.__sources.chatStyle = chat.getAttribute("style");
      chat.style.width = "320px";
      document.body.classList.remove("theme-light"); document.body.classList.add("theme-dark");
      const more = document.querySelector(".za-sources-more"); more.open = true;
      document.querySelector(".za-sources").scrollIntoView({ block: "end" });
      await new Promise(r => setTimeout(r, 150));
      const box = chat.getBoundingClientRect();
      const inside = [...chat.querySelectorAll(".za-sources, .za-source, .za-source-seen")].filter(el => el.checkVisibility()).every(el => { const r = el.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1; });
      const uncitedQuiet = [...more.querySelectorAll(".za-source-seen")].every(el => !el.checkVisibility());
      return { noOverflow: chat.scrollWidth <= chat.clientWidth + 1, inside, uncitedQuiet };
    `);
    await writeFile(`${output}/02-narrow-dark.png`, Buffer.from(await page.screenshot(), "base64"));
    expect(narrow).toEqual({ noOverflow: true, inside: true, uncitedQuiet: true });
    console.log(`Sources screenshots: ${output}`);
  } finally {
    await page
      .evaluate(
        String.raw`
      const saved = window.__sources;
      if (saved) {
        const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
        session.stop(); session.deps.provider = saved.provider; session.deps.store = saved.store;
        plugin.settings = saved.settings; document.body.className = saved.bodyClass;
        const chat = document.querySelector(".za-chat");
        if (chat) { if (saved.chatStyle) chat.setAttribute("style", saved.chatStyle); else chat.removeAttribute("style"); }
        session.reset(); plugin.notifyConfiguration();
        delete window.__sources;
        if (JSON.stringify(saved.files) !== JSON.stringify(app.vault.getMarkdownFiles().map(f => f.path).sort())) throw new Error("Fixture filenames changed.");
      }
    `,
      )
      .finally(() => page.close());
  }
});
