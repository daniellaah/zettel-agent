import { MarkdownView, Plugin, debounce } from "obsidian";

import type { ModelProvider } from "./agent/provider";
import { PROVIDERS } from "./agent/providers/catalog";
import { createProvider } from "./agent/providers";
import { ChatSession } from "./session/chat-session";
import { resolveSettings, type PluginSettings } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./ui/ChatView";
import { SettingsTab } from "./ui/SettingsTab";
import { VaultCorpus } from "./vault/vault-corpus";

export default class ZettelAgentPlugin extends Plugin {
  declare settings: PluginSettings;
  vaultCorpus!: VaultCorpus;
  session!: ChatSession;

  /** Rebuild the index after the Zettelkasten folder setting stops changing. */
  readonly scheduleRebuild = debounce(() => void this.vaultCorpus.rebuild(), 800, true);

  override async onload(): Promise<void> {
    this.settings = resolveSettings(await this.loadData());
    this.vaultCorpus = new VaultCorpus(this.app, () => this.settings);
    this.session = new ChatSession({
      corpus: async () => {
        await this.vaultCorpus.whenReady();
        return this.vaultCorpus.current;
      },
      provider: () => this.createProvider(),
      activeNotePath: () => this.activeNotePath(),
    });

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

    this.app.workspace.onLayoutReady(() => {
      this.vaultCorpus.registerEvents(this);
      void this.vaultCorpus.rebuild();
    });
  }

  override onunload(): void {
    this.session.stop();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private createProvider(): ModelProvider | string {
    const { provider, models, apiKeySecretIds } = this.settings;
    const secretId = apiKeySecretIds[provider];
    const apiKey = secretId ? this.app.secretStorage.getSecret(secretId) : null;
    if (!apiKey) return `Add your ${PROVIDERS[provider].label} API key in Settings → Zettel Agent.`;
    if (!models[provider]) return "Enter a model ID in Settings → Zettel Agent.";
    return createProvider(provider, apiKey, models[provider]);
  }

  private activeNotePath(): string | null {
    const view = this.app.workspace.getMostRecentLeaf()?.view;
    return view instanceof MarkdownView ? (view.file?.path ?? null) : null;
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
