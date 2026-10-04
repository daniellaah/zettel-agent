import { MarkdownView, Plugin, debounce } from "obsidian";

import type { ModelProvider } from "../agent/provider";
import { PROVIDERS } from "../agent/providers/catalog";
import { createProvider } from "../agent/providers";
import { ChatSession } from "../session/chat-session";
import { resolveSettings, type PluginSettings } from "../settings";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { BRAND_ICON, registerBrandIcon } from "./brand-icon";
import { registerNoteCommands } from "./CreateNoteModal";
import { SettingsTab } from "./SettingsTab";
import { FileConversationStore } from "../vault/conversations";
import { VaultCorpus } from "../vault/vault-corpus";

export default class ZettelAgentPlugin extends Plugin {
  declare settings: PluginSettings;
  vaultCorpus!: VaultCorpus;
  session!: ChatSession;
  conversations!: FileConversationStore;
  researchIndexed = false;
  readonly configurationListeners = new Set<() => void>();

  notifyConfiguration(): void {
    for (const listener of this.configurationListeners) listener();
  }

  /** Rebuild the index after the Zettelkasten folder setting stops changing. */
  readonly scheduleRebuild = debounce(
    () => {
      this.researchIndexed = false;
      this.notifyConfiguration();
      void this.vaultCorpus.rebuild();
    },
    800,
    true,
  );

  override async onload(): Promise<void> {
    this.settings = resolveSettings(await this.loadData());
    this.vaultCorpus = new VaultCorpus(
      this.app,
      () => this.settings,
      () => {
        this.researchIndexed = true;
        this.notifyConfiguration();
      },
    );
    const pluginDir =
      this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    this.conversations = new FileConversationStore(this.app, `${pluginDir}/conversations`);
    this.session = new ChatSession({
      corpus: async () => {
        await this.vaultCorpus.whenReady();
        return this.vaultCorpus.current;
      },
      provider: () => this.createProvider(),
      activeNotePath: () => this.activeNotePath(),
      store: this.conversations,
    });

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
    registerBrandIcon();
    this.addRibbonIcon(BRAND_ICON, "Open Zettelkasten chat", () => {
      void this.activateChatView();
    });
    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      callback: () => void this.activateChatView(),
    });
    registerNoteCommands(this, () => this.settings);
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
    this.notifyConfiguration();
    await this.saveData(this.settings);
  }

  private createProvider(): Promise<ModelProvider | string> {
    const { provider, models, apiKeySecretIds } = this.settings;
    const model = models[provider];
    if (!model) return Promise.resolve("Enter a model ID in Settings → Zettel Agent.");
    const secretId = apiKeySecretIds[provider];
    const apiKey = secretId ? this.app.secretStorage.getSecret(secretId) : null;
    if (!apiKey) {
      return Promise.resolve(
        `Add your ${PROVIDERS[provider].label} API key in Settings → Zettel Agent.`,
      );
    }
    return Promise.resolve(createProvider(provider, apiKey, model));
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
