import { Notice, type App } from "obsidian";
import { ConversationStorage } from "../session/conversation-storage";

/** Host-only conversation persistence under the plugin directory. */
export class FileConversationStore extends ConversationStorage {
  constructor(app: App, dir: string) {
    super(app.vault.adapter, dir, (message) => new Notice(message));
  }
}
