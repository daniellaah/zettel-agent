import { PluginSettingTab, SecretComponent, Setting, setIcon, type App } from "obsidian";

import { localOllamaUrl } from "../retrieval/ollama";
import type ZettelAgentPlugin from "../main";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../agent/providers/catalog";
import { STAGES, normalizeFolder, type RecordingMode } from "../settings";

const CUSTOM_MODEL = "__custom__";

export class SettingsTab extends PluginSettingTab {
  private advancedOpen = false;
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
    containerEl.addClass("za-settings");
    containerEl.createEl("h2", { text: "Set up Zettel Agent" });
    containerEl.createEl("p", {
      cls: "za-settings-intro",
      text: "Connect a model and choose which notes to research. Changes are saved automatically.",
    });
    new Setting(containerEl).setName("Model connection").setHeading();

    new Setting(containerEl)
      .setName("Model provider")
      .setDesc(
        "Questions and selected note excerpts go to this provider. The agent only reads notes.",
      )
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

    new Setting(containerEl).setName("Research scope").setHeading();

    new Setting(containerEl)
      .setName("Zettelkasten folder")
      .setDesc(
        "Vault-relative folder the agent searches. Leave empty for the whole vault. Fleeting notes are excluded.",
      )
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

    containerEl.createEl("p", {
      cls: "za-settings-intro",
      text: "Start with keyword search and citation checks; no local model is needed. Advanced settings are optional.",
    });
    const advanced = containerEl.createEl("details", { cls: "za-settings-advanced" });
    advanced.open = this.advancedOpen;
    const summary = advanced.createEl("summary");
    setIcon(summary.createSpan({ cls: "za-disclosure-icon" }), "chevron-right");
    summary.createSpan({ text: "Advanced settings" });
    advanced.addEventListener("toggle", () => {
      this.advancedOpen = advanced.open;
    });
    const advancedEl = advanced.createDiv({ cls: "za-settings-advanced-body" });
    advancedEl.createEl("p", {
      cls: "za-settings-intro",
      text: "Optional answer review, local hybrid search, recording and note-folder mappings. These are not required to start.",
    });
    new Setting(advancedEl)
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

    new Setting(advancedEl)
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

    new Setting(advancedEl).setName("Local retrieval").setHeading();
    new Setting(advancedEl)
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
    new Setting(advancedEl)
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
    new Setting(advancedEl)
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

    new Setting(advancedEl).setName("Note folders").setHeading();
    advancedEl.createEl("p", {
      cls: "za-settings-intro",
      text: "Sub-folders below the research folder. A note’s type property overrides its folder. Fleeting folders are used for manual capture and excluded from research.",
    });
    for (const stage of STAGES) {
      new Setting(advancedEl)
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
