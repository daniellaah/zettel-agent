import { Notice, type App } from "obsidian";
import { RecordingStorage } from "../session/recording-storage";

/** Host-only recoverable recording storage; no Agent tool has this port. */
export class RecordingStore extends RecordingStorage {
  constructor(app: App, dir: string) {
    super(app.vault.adapter, dir, (message) => new Notice(message));
  }
}
