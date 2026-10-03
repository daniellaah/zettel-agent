import {
  ButtonComponent,
  MarkdownView,
  Modal,
  Notice,
  TFolder,
  ToggleComponent,
  setIcon,
  type App,
  type Plugin,
} from "obsidian";

import { BRAND_ICON } from "./brand-icon";

import { isInZettelkasten, type PluginSettings } from "../settings";
import {
  NOTE_ICONS,
  NOTE_KINDS,
  NOTE_LABELS,
  planNote,
  type NoteDraft,
  type NoteKind,
  type NotePlan,
} from "./note-template";

const GUIDANCE: Record<NoteKind, string> = {
  fleeting: "Capture a thought quickly. You can make sense of it and connect it later.",
  literature:
    "Faithfully paraphrase selected source material in your own words. Keep your evaluations and deductions separate; source details go in metadata.",
  permanent:
    "One idea you can understand on its own. Title it with a claim or question; explain it in your own words. Keep sources in metadata and explain related-note links in the prose.",
};

/**
 * User commands, plus the chat pane's New note buttons, which only open this dialog.
 * Creation itself is never passed to ChatSession or agent tools.
 */
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
    this.modalEl.addClass("za-create-note-modal");
    this.titleEl.empty();
    setIcon(this.titleEl.createSpan({ cls: "za-create-logo" }), BRAND_ICON);
    this.titleEl.createSpan({ text: "New note" });
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

    const kinds = form.createDiv({
      cls: "za-kind-tabs",
      attr: { role: "radiogroup", "aria-label": "Note type" },
    });
    for (const kind of NOTE_KINDS) {
      const selected = kind === this.draft.kind;
      const tab = kinds.createEl("button", {
        cls: `za-kind-tab${selected ? " is-selected" : ""}`,
        attr: { type: "button", role: "radio", "aria-checked": String(selected) },
      });
      setIcon(tab.createSpan({ cls: "za-kind-icon" }), NOTE_ICONS[kind]);
      tab.createSpan({ text: NOTE_LABELS[kind] });
      tab.addEventListener("click", () => {
        if (this.busy || selected) return;
        this.draft.kind = kind;
        this.render();
      });
    }
    form.createEl("p", { text: GUIDANCE[this.draft.kind], cls: "za-kind-guidance" });

    this.textField(
      form,
      "Title",
      "title",
      this.draft.kind === "permanent" ? "State one claim" : "Note title",
    ).addClass("za-field-title");

    if (this.draft.kind === "literature") {
      const source = form.createDiv({ cls: "za-field-group" });
      source.createEl("p", { cls: "za-field-group-label", text: "Source" });
      source.createEl("p", {
        cls: "za-field-group-hint",
        text: "Optional; you can complete these in the note.",
      });
      this.textField(source, "Source title", "sourceTitle", "Book, paper or article");
      const pair = source.createDiv({ cls: "za-field-pair" });
      this.textField(pair, "Author", "author", "Person or organisation");
      this.textField(pair, "Year", "year", "If known");
      this.textField(source, "Original", "source", "URL or [[Document.pdf]]");
    }
    if (this.draft.kind === "permanent" && this.sourceNote) {
      const row = form.createDiv({ cls: "za-source-toggle" });
      const text = row.createDiv();
      text.createDiv({ cls: "za-field-label", text: "Use open note as source" });
      text.createDiv({
        cls: "za-field-group-hint",
        text: this.sourceNote.slice(2, -2).split("/").pop() ?? "",
        attr: { title: this.sourceNote },
      });
      const toggle = new ToggleComponent(row);
      toggle.toggleEl.setAttribute("aria-label", "Use open note as source");
      toggle.setValue(Boolean(this.draft.sourceNote)).onChange((value) => {
        if (value && this.sourceNote) this.draft.sourceNote = this.sourceNote;
        else delete this.draft.sourceNote;
      });
    }

    this.errorEl = form.createEl("p", { cls: "za-create-error", attr: { role: "alert" } });
    const footer = form.createDiv({ cls: "za-create-footer" });
    const destination = footer.createDiv({ cls: "za-create-destination" });
    setIcon(destination.createSpan({ cls: "za-create-destination-icon" }), "folder");
    this.destinationEl = destination.createSpan();
    new ButtonComponent(footer)
      .setButtonText("Cancel")
      .onClick(() => {
        if (!this.busy) this.close();
      })
      .then((button) => {
        button.buttonEl.type = "button";
        button.buttonEl.setAttribute("aria-label", "Cancel note creation");
      });
    this.createButton = new ButtonComponent(footer).setButtonText("Create note").setCta();
    this.createButton.buttonEl.type = "submit";
    this.updateDestination();
    // Deferred: on open, Obsidian focuses the dialog's first control after this runs.
    const title = form.querySelector<HTMLInputElement>('input[aria-label="Title"]');
    title?.focus();
    window.setTimeout(() => {
      if (title?.isConnected) title.focus();
    }, 0);
  }

  /** A labelled text input, stacked so long placeholders and values have the full width. */
  private textField(
    container: HTMLElement,
    label: string,
    field: Exclude<keyof NoteDraft, "kind" | "sourceNote">,
    placeholder: string,
  ): HTMLElement {
    const wrapper = container.createEl("label", { cls: "za-field" });
    wrapper.createSpan({ cls: "za-field-label", text: label });
    const input = wrapper.createEl("input", {
      type: "text",
      placeholder,
      value: this.draft[field] ?? "",
      attr: { "aria-label": label },
    });
    input.addEventListener("input", () => {
      this.draft[field] = input.value;
      if (field === "title") this.updateDestination();
    });
    return wrapper;
  }

  private updateDestination(): void {
    this.errorEl.setText("");
    const empty = !this.draft.title.trim();
    this.createButton?.setDisabled(empty || this.busy);
    if (empty) {
      this.destinationEl.setText("Enter a title to see the destination");
      return;
    }
    try {
      this.destinationEl.setText(planNote(this.draft, this.settings, new Date()).path);
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
    for (const input of this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input, .za-kind-tab",
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
      for (const input of this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        "input, .za-kind-tab",
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
