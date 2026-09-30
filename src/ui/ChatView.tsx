import { ItemView, MarkdownView, Notice, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { linkTarget } from "../agent/evidence";
import { PROVIDERS } from "../agent/providers/catalog";
import type ZettelAgentPlugin from "../main";
import { ChatApp } from "./ChatApp";
import { HostContext, type ChatHost } from "./host";

export const VIEW_TYPE_CHAT = "zettel-agent-chat";

export class ChatView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ZettelAgentPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  override getDisplayText(): string {
    return "Zettelkasten chat";
  }

  override getIcon(): string {
    return "messages-square";
  }

  override onOpen(): Promise<void> {
    this.contentEl.addClass("za-view");
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <HostContext.Provider value={this.createHost()}>
          <ChatApp session={this.plugin.session} />
        </HostContext.Provider>
      </StrictMode>,
    );
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }

  private createHost(): ChatHost {
    const { app, plugin } = this;
    const session = plugin.session;
    const resolveLink = (linkText: string) =>
      app.metadataCache.getFirstLinkpathDest(linkText.split(/[#|]/)[0]!.trim(), "")?.path ?? null;
    return {
      app,
      component: this,
      model: () => plugin.settings.models[plugin.settings.provider],
      providerLabel: () => PROVIDERS[plugin.settings.provider].label,
      describeEvidence: (id) => {
        const evidence = session.evidence(id);
        return evidence ? linkTarget(evidence).replace("#", " › ") : null;
      },
      openEvidence: (id, newLeaf) => {
        const evidence = session.evidence(id);
        if (!evidence) return;
        const heading = evidence.headingPath.length > 1 ? `#${evidence.headingPath.at(-1)}` : "";
        void app.workspace.openLinkText(
          `${evidence.path.replace(/\.md$/, "")}${heading}`,
          "",
          newLeaf,
        );
      },
      resolveLink,
      openLink: (linkText, newLeaf) => {
        // Obsidian's openLinkText creates a note for an unresolved link; the agent must not.
        if (!resolveLink(linkText)) {
          new Notice(`"${linkText.split("#")[0]}" does not exist in your vault.`);
          return;
        }
        void app.workspace.openLinkText(linkText, "", newLeaf);
      },
      insertAtCursor: (text) => {
        const view = app.workspace.getMostRecentLeaf()?.view;
        if (!(view instanceof MarkdownView)) return false;
        view.editor.replaceSelection(text);
        view.editor.focus();
        return true;
      },
      notify: (message) => new Notice(message),
    };
  }
}
