import { PluginSettingTab, SecretComponent, Setting, type App } from "obsidian";

import { localOllamaUrl } from "../retrieval/ollama";
import type ZettelAgentPlugin from "../main";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../agent/providers/catalog";
import { STAGES, normalizeFolder, type RecordingMode } from "../settings";

const CUSTOM_MODEL = "__custom__";

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ZettelAgentPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Model provider")
      .setDesc("Where questions and the note excerpts the agent reads are sent.")
      .addDropdown((dropdown) => {
        for (const id of PROVIDER_IDS) dropdown.addOption(id, PROVIDERS[id].label);
        dropdown.setValue(settings.provider).onChange((provider) => {
          settings.provider = provider as ProviderId;
          void this.plugin.saveSettings();
          this.display();
        });
      });

    const provider = settings.provider;
    const info = PROVIDERS[provider];

    new Setting(containerEl)
      .setName(`${info.label} API key`)
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText("Kept in Obsidian's secret storage, not in the plugin's data file. ");
          fragment.createEl("a", { text: "Create a key", href: info.keyUrl });
        }),
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(settings.apiKeySecretIds[provider])
          .onChange((id) => {
            settings.apiKeySecretIds[provider] = id;
            void this.plugin.saveSettings();
          }),
      );

    const isKnown = info.models.some((model) => model.id === settings.models[provider]);
    new Setting(containerEl).setName("Model").addDropdown((dropdown) => {
      for (const model of info.models) dropdown.addOption(model.id, model.label);
      dropdown.addOption(CUSTOM_MODEL, "Other model ID…");
      dropdown.setValue(isKnown ? settings.models[provider] : CUSTOM_MODEL).onChange((model) => {
        settings.models[provider] = model === CUSTOM_MODEL ? "" : model;
        void this.plugin.saveSettings();
        this.display();
      });
    });

    if (!isKnown) {
      new Setting(containerEl)
        .setName("Model ID")
        .setDesc("Exact model name as the provider's API expects it.")
        .addText((text) =>
          text.setValue(settings.models[provider]).onChange((value) => {
            settings.models[provider] = value.trim();
            void this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl)
      .setName("Offline mode")
      .setDesc(
        "Record saves each question's model responses in the plugin folder (questions and note excerpts, never API keys). Replay answers recorded questions from those files with no network and no cost, for trying the interface.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("off", "Off")
          .addOption("record", "Record")
          .addOption("replay", "Replay")
          .setValue(settings.recordingMode)
          .onChange((mode) => {
            settings.recordingMode = mode as RecordingMode;
            void this.plugin.saveSettings();
            this.plugin.localEmbeddings.schedule();
          }),
      );

    new Setting(containerEl)
      .setName("Answer checks")
      .setDesc(
        "Structural checks add no model calls. Optional self-review uses the same answer model, may add up to three billed calls within the turn budget, and is not independent verification.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("structural", "Citation structure")
          .addOption("self-review", "Evidence and coverage self-review (experimental)")
          .setValue(settings.answerReviewMode)
          .onChange((value) => {
            settings.answerReviewMode = value === "self-review" ? "self-review" : "structural";
            void this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Local retrieval").setHeading();
    new Setting(containerEl)
      .setName("Search mode")
      .setDesc(
        "Local hybrid combines BM25 with Qwen3 embeddings through Ollama. Research chapters and queries go only to the local service; selected evidence still goes to your answer model. Quality evaluation is pending.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("lexical", "BM25 keywords")
          .addOption("hybrid", "Local hybrid (experimental)")
          .setValue(settings.retrievalMode)
          .onChange((value) => {
            settings.retrievalMode = value === "hybrid" ? "hybrid" : "lexical";
            void this.plugin.saveSettings();
            this.plugin.localEmbeddings.schedule();
          }),
      );
    new Setting(containerEl)
      .setName("Ollama address")
      .setDesc("Loopback only. Install once with: ollama pull qwen3-embedding:0.6b")
      .addText((text) =>
        text.setValue(settings.ollamaEndpoint).onChange((value) => {
          try {
            settings.ollamaEndpoint = localOllamaUrl(value);
            text.inputEl.setCustomValidity("");
            void this.plugin.saveSettings();
            this.plugin.localEmbeddings.schedule();
          } catch {
            text.inputEl.setCustomValidity("Use an HTTP localhost address without a path.");
            text.inputEl.reportValidity();
          }
        }),
      );
    new Setting(containerEl)
      .setName("Local index")
      .setDesc(this.plugin.localEmbeddings.status)
      .addButton((button) =>
        button.setButtonText("Build / retry").onClick(async () => {
          button.setDisabled(true);
          const pending = this.plugin.localEmbeddings.rebuild();
          this.display();
          await pending;
          this.display();
        }),
      )
      .addButton((button) => button.setButtonText("Refresh status").onClick(() => this.display()));

    new Setting(containerEl).setName("Zettelkasten").setHeading();

    new Setting(containerEl)
      .setName("Zettelkasten folder")
      .setDesc("Vault-relative folder the agent searches. Leave empty for the whole vault.")
      .addText((text) =>
        text
          .setPlaceholder("02-Zettelkasten")
          .setValue(settings.zettelkastenRoot)
          .onChange((value) => {
            settings.zettelkastenRoot = normalizeFolder(value);
            void this.plugin.saveSettings();
            this.plugin.scheduleRebuild();
          }),
      );

    for (const stage of STAGES) {
      new Setting(containerEl)
        .setName(`${stage[0]!.toUpperCase()}${stage.slice(1)} notes folder`)
        .setDesc("Sub-folder of the Zettelkasten folder.")
        .addText((text) =>
          text.setValue(settings.stageFolders[stage]).onChange((value) => {
            settings.stageFolders[stage] = normalizeFolder(value);
            void this.plugin.saveSettings();
            this.plugin.scheduleRebuild();
          }),
        );
    }
  }
}
