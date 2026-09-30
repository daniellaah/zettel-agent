import { Plugin } from "obsidian";

import { resolveSettings, type PluginSettings } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./ui/ChatView";
import { SettingsTab } from "./ui/SettingsTab";

export default class AgenticZettelkastenPlugin extends Plugin {
  declare settings: PluginSettings;

  override async onload(): Promise<void> {
    this.settings = resolveSettings(await this.loadData());

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("messages-square", "Open Zettelkasten chat", () => {
      void this.activateChatView();
    });
    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      callback: () => void this.activateChatView(),
    });
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateChatView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
    await workspace.revealLeaf(leaf);
  }
}
