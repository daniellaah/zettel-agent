import { ItemView, MarkdownView, Notice, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { linkTarget } from "../agent/evidence";
import type AgenticZettelkastenPlugin from "../main";
import { ChatApp } from "./ChatApp";
import { HostContext, type ChatHost } from "./host";

export const VIEW_TYPE_CHAT = "agentic-zettelkasten-chat";

export class ChatView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AgenticZettelkastenPlugin,
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
    this.contentEl.addClass("azk-view");
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
    return {
      app,
      component: this,
      model: () => plugin.settings.model,
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
      openLink: (linkText, newLeaf) => void app.workspace.openLinkText(linkText, "", newLeaf),
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
