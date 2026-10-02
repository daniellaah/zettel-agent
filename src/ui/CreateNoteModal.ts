import {
  MarkdownView,
  Modal,
  Notice,
  Setting,
  TFolder,
  type App,
  type ButtonComponent,
  type Plugin,
} from "obsidian";

import { isInZettelkasten, type PluginSettings } from "../settings";
import {
  NOTE_KINDS,
  planNote,
  type NoteDraft,
  type NoteKind,
  type NotePlan,
} from "./note-template";

const LABELS: Record<NoteKind, string> = {
  fleeting: "Fleeting",
  literature: "Literature",
  permanent: "Permanent",
};

const GUIDANCE: Record<NoteKind, string> = {
  fleeting: "Capture a thought quickly. You can make sense of it and connect it later.",
  literature:
    "Faithfully paraphrase selected source material in your own words. Keep your evaluations and deductions separate; source details go in metadata.",
  permanent:
    "One idea you can understand on its own. Title it with a claim or question; explain it in your own words. Keep sources in metadata and explain related-note links in the prose.",
};

/** User commands only. This capability is never passed to ChatSession or agent tools. */
export function registerNoteCommands(plugin: Plugin, settings: () => PluginSettings): void {
  for (const kind of NOTE_KINDS) {
    plugin.addCommand({
      id: `create-${kind}-note`,
      name: `Create ${kind} note`,
      callback: () => new CreateNoteModal(plugin.app, settings(), kind).open(),
    });
  }
  plugin.addRibbonIcon("file-plus", "Create Zettelkasten note", () => {
    new CreateNoteModal(plugin.app, settings(), "fleeting").open();
  });
}

export class CreateNoteModal extends Modal {
  private readonly draft: NoteDraft;
  private busy = false;
  private createdPath: string | null = null;
  private createButton: ButtonComponent | null = null;
  private destinationEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private readonly sourceNote: string | null;

  constructor(
    app: App,
    private readonly settings: PluginSettings,
    kind: NoteKind,
  ) {
    super(app);
    this.draft = { kind, title: "" };
    const view = app.workspace.getMostRecentLeaf()?.view;
    const file = view instanceof MarkdownView ? view.file : null;
    this.sourceNote =
      file && isInZettelkasten(file.path, settings.zettelkastenRoot)
        ? `[[${file.path.replace(/\.md$/i, "")}]]`
        : null;
  }

  override onOpen(): void {
    this.titleEl.setText("Create Zettelkasten note");
    this.contentEl.addClass("za-create-note");
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const form = contentEl.createEl("form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    new Setting(form).setName("Note type").addDropdown((dropdown) => {
      for (const kind of NOTE_KINDS) dropdown.addOption(kind, LABELS[kind]);
      dropdown.selectEl.setAttribute("aria-label", "Note type");
      dropdown.setValue(this.draft.kind).onChange((value) => {
        if (this.busy) return;
        this.draft.kind = value as NoteKind;
        this.render();
      });
    });
    form.createEl("p", { text: GUIDANCE[this.draft.kind], cls: "za-note" });
    this.textField(
      form,
      "Title",
      "title",
      this.draft.kind === "permanent" ? "State one claim" : "Note title",
    );

    if (this.draft.kind === "literature") {
      this.textField(
        form,
        "Source title",
        "sourceTitle",
        "Original title of the book, paper or article",
      );
      this.textField(form, "Author", "author", "Person or organisation");
      this.textField(form, "Year", "year", "Publication year, if known");
      this.textField(form, "Original", "source", "URL or [[Document.pdf]]");
      form.createEl("p", {
        text: "Source fields are optional; you can complete them in the note.",
        cls: "za-note",
      });
    }
    if (this.draft.kind === "permanent" && this.sourceNote) {
      new Setting(form)
        .setName("Use open note as source")
        .setDesc(this.sourceNote)
        .addToggle((toggle) => {
          toggle.toggleEl.setAttribute("aria-label", "Use open note as source");
          toggle.setValue(Boolean(this.draft.sourceNote)).onChange((value) => {
            if (value && this.sourceNote) this.draft.sourceNote = this.sourceNote;
            else delete this.draft.sourceNote;
          });
        });
    }
    this.destinationEl = form.createEl("p", { cls: "za-note za-create-destination" });
    this.errorEl = form.createEl("p", { cls: "za-note-error", attr: { role: "alert" } });
    new Setting(form)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => {
          if (!this.busy) this.close();
        });
        button.buttonEl.type = "button";
        button.buttonEl.setAttribute("aria-label", "Cancel note creation");
      })
      .addButton((button) => {
        this.createButton = button;
        button.setButtonText("Create note").setCta();
        button.buttonEl.type = "submit";
      });
    this.updateDestination();
    form.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.focus();
  }

  private textField(
    container: HTMLElement,
    label: string,
    field: Exclude<keyof NoteDraft, "kind" | "sourceNote">,
    placeholder: string,
  ): void {
    new Setting(container).setName(label).addText((text) => {
      text.inputEl.setAttribute("aria-label", label);
      text
        .setPlaceholder(placeholder)
        .setValue(this.draft[field] ?? "")
        .onChange((value) => {
          this.draft[field] = value;
          if (field === "title") this.updateDestination();
        });
    });
  }

  private updateDestination(): void {
    this.errorEl.setText("");
    const empty = !this.draft.title.trim();
    this.createButton?.setDisabled(empty || this.busy);
    if (empty) {
      this.destinationEl.setText("Enter a title to see where the note will be created.");
      return;
    }
    try {
      this.destinationEl.setText(
        `Create in: ${planNote(this.draft, this.settings, new Date()).path}`,
      );
    } catch (error) {
      this.destinationEl.setText("");
      this.errorEl.setText(error instanceof Error ? error.message : String(error));
      this.createButton?.setDisabled(true);
    }
  }

  private async submit(): Promise<void> {
    if (this.busy || this.createdPath) return;
    this.busy = true;
    this.createButton?.setDisabled(true);
    for (const input of this.contentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    )) {
      input.disabled = true;
    }
    try {
      const plan = planNote(this.draft, this.settings, new Date());
      if (
        this.app.vault
          .getFiles()
          .some((file) => file.path.toLowerCase() === plan.path.toLowerCase())
      ) {
        throw new Error("A file with that name already exists. Choose another title.");
      }
      await this.ensureFolders(plan.folder);
      // Vault.create fails if the destination appeared after the existence check; never overwrite.
      const file = await this.app.vault.create(plan.path, plan.content);
      this.createdPath = file.path;
      this.close();
      try {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { state: { mode: "source" } });
        this.focusEditor(leaf.view, plan);
      } catch {
        new Notice(`Created ${file.path}. Open it from the file explorer to continue writing.`);
      }
    } catch (error) {
      this.errorEl.setText(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy = false;
      this.createButton?.setDisabled(false);
      for (const input of this.contentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input, select",
      )) {
        input.disabled = false;
      }
    }
  }

  private async ensureFolders(folder: string): Promise<void> {
    let path = "";
    for (const part of folder ? folder.split("/") : []) {
      path = path ? `${path}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`A file occupies the destination folder: ${path}`);
      try {
        await this.app.vault.createFolder(path);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw error;
      }
    }
  }

  private focusEditor(view: unknown, plan: NotePlan): void {
    if (!(view instanceof MarkdownView)) return;
    view.editor.setCursor({ line: plan.cursorLine, ch: 0 });
    view.editor.focus();
  }
}
