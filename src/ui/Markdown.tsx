import { Component, Keymap, MarkdownRenderer } from "obsidian";
import { memo, useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";

import { safeExternalLink } from "./link-safety";
import { citationIdOf, citationsToHtml } from "./citation-markup";
import { useHost, type ChatHost } from "./host";

/** While streaming, re-render Markdown at most this often. */
const STREAM_RENDER_MS = 120;

/**
 * Renders assistant Markdown with Obsidian's renderer, so [[links]], callouts and code
 * look like the rest of the vault. [E3] citations are turned into chip elements in the
 * Markdown source (citationsToHtml), so they render as chips however Obsidian renders;
 * the DOM pass afterwards only adds hover titles and marks links to missing notes.
 */
export const Markdown = memo(function Markdown(props: { text: string; streaming: boolean }) {
  const host = useHost();
  const ref = useRef<HTMLDivElement>(null);
  const text = useThrottled(props.text, props.streaming ? STREAM_RENDER_MS : 0);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const child = new Component();
    host.component.addChild(child);
    const staging = document.createElement("div");
    let cancelled = false;
    // Obsidian can keep filling in rendered Markdown after render() resolves, so nodes are
    // decorated as they arrive, not only once. Decoration is cosmetic (titles, styles).
    const observer = new MutationObserver(() => {
      describeCitations(container, host);
      markUnresolvedLinks(container, host);
    });
    void MarkdownRenderer.render(host.app, citationsToHtml(text), staging, "", child).then(() => {
      if (cancelled) return;
      describeCitations(staging, host);
      markUnresolvedLinks(staging, host);
      container.replaceChildren(...Array.from(staging.childNodes));
      observer.observe(container, { childList: true, subtree: true, characterData: true });
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      host.component.removeChild(child);
    };
  }, [host, text]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const newLeaf = Keymap.isModEvent(event.nativeEvent) !== false;
    const cite = target.closest<HTMLElement>(".za-cite");
    const id = cite ? citationIdOf(cite) : null;
    if (id) {
      event.preventDefault();
      event.stopPropagation();
      host.openEvidence(id, newLeaf);
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a.internal-link");
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      host.openLink(link.dataset.href ?? link.getAttribute("href") ?? "", newLeaf);
      return;
    }
    const anchor = target.closest<HTMLAnchorElement>("a");
    if (anchor && !safeExternalLink(anchor.getAttribute("href") ?? "")) {
      event.preventDefault();
      event.stopPropagation();
      host.notify(
        "This app or local-file link is disabled in chat. Use a note link or a web source.",
      );
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    const chip = target.closest<HTMLElement>(".za-cite");
    const id = chip ? citationIdOf(chip) : null;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    host.openEvidence(id, event.metaKey || event.ctrlKey);
  };

  return (
    <div
      ref={ref}
      className="za-markdown markdown-rendered"
      onClickCapture={onClick}
      onAuxClickCapture={onClick}
      onKeyDownCapture={onKeyDown}
    />
  );
});

/** Links to notes that do not exist get Obsidian's faded "unresolved" style. */
function markUnresolvedLinks(root: HTMLElement, host: ChatHost): void {
  for (const link of Array.from(
    root.querySelectorAll<HTMLAnchorElement>("a:not(.internal-link)[href]"),
  )) {
    if (!safeExternalLink(link.getAttribute("href") ?? "")) {
      link.removeAttribute("href");
      link.title = "App commands and local-file links are disabled in chat";
    }
  }
  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
    const target = link.dataset.href ?? link.getAttribute("href") ?? "";
    if (!host.resolveLink(target)) {
      link.classList.add("is-unresolved");
      link.title = "This note does not exist in your vault";
    }
  }
}

/** Hover titles for citation chips; ids never retrieved are marked. */
function describeCitations(root: HTMLElement, host: ChatHost): void {
  for (const chip of Array.from(root.querySelectorAll<HTMLElement>(".za-cite:not([title])"))) {
    const id = citationIdOf(chip);
    if (!id) continue;
    const description = host.describeEvidence(id);
    chip.title = description ?? `${id}: the agent never read this source`;
    chip.setAttribute("role", "link");
    chip.tabIndex = 0;
    chip.setAttribute(
      "aria-label",
      description ? `Open source: ${description}` : `${id}: the agent never read this source`,
    );
    if (!description) chip.classList.add("za-cite-unknown");
  }
}

/** Returns `value`, updated at most every `ms` milliseconds (immediately when ms is 0). */
function useThrottled<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  useEffect(() => {
    if (ms === 0) return; // not throttling: the latest value is returned directly below
    const wait = Math.max(0, lastUpdate.current + ms - Date.now());
    const timer = window.setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return ms === 0 ? value : throttled;
}
