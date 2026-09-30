import { ItemView, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import type AgenticZettelkastenPlugin from "../main";
import { ChatApp } from "./ChatApp";

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
        <ChatApp model={this.plugin.settings.model} />
      </StrictMode>,
    );
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }
}
