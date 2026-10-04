import { useEffect, useRef, useState } from "react";

import type { ConversationSummary } from "../session/conversation-storage";
import { useHost } from "./host";
import { IconButton } from "./icons";
import { relativeTime } from "./presentation";

/** Saved conversations, newest first: open one to continue it, or delete it. */
export function HistoryPanel(props: { id: string; currentId: string | null; onClose: () => void }) {
  const host = useHost();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Deleting takes a second click on the same row; moving focus away cancels it.
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    if (confirming) panelRef.current?.querySelector<HTMLElement>(".za-history-confirm")?.focus();
  }, [confirming]);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    let current = true;
    void host
      .listConversations()
      .then((list) => {
        if (current) setConversations(list);
      })
      .catch(() => {
        if (current) {
          setConversations([]);
          setFailed(true);
          host.notify("Chat history could not be loaded. Check plugin storage access.");
        }
      });
    return () => {
      current = false;
    };
  }, [host]);

  const now = new Date();
  return (
    <div
      ref={panelRef}
      id={props.id}
      className="za-history"
      role="dialog"
      tabIndex={-1}
      aria-label="Chat history"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (confirming) setConfirming(null);
          else props.onClose();
        }
      }}
    >
      <div className="za-history-header">
        <span>History</span>
        <IconButton icon="x" label="Close history" onClick={props.onClose} />
      </div>
      {conversations === null ? (
        <p className="za-history-empty">Loading…</p>
      ) : failed ? (
        <p className="za-history-empty za-note-error">
          History could not be loaded. Close this panel and try again.
        </p>
      ) : conversations.length === 0 ? (
        <p className="za-history-empty">No saved chats yet. Chats are saved after each answer.</p>
      ) : (
        <ul className="za-history-list">
          {conversations.map((conversation) => (
            <li
              key={conversation.id}
              className={conversation.id === props.currentId ? "is-current" : ""}
            >
              <button
                type="button"
                className="za-history-open"
                onClick={() => void host.openConversation(conversation.id).then(props.onClose)}
              >
                <span className="za-history-title">{conversation.title}</span>
                <span className="za-history-meta">
                  {relativeTime(conversation.updatedAt, now)} · {conversation.questions}{" "}
                  {conversation.questions === 1 ? "question" : "questions"}
                </span>
              </button>
              {confirming === conversation.id ? (
                <IconButton
                  icon="trash-2"
                  label={`Delete "${conversation.title}" permanently`}
                  text="Delete"
                  className="za-history-confirm"
                  onBlur={() => setConfirming(null)}
                  onClick={() => {
                    setConfirming(null);
                    void host
                      .deleteConversation(conversation.id)
                      .then(() => setConversations(conversations.filter((c) => c !== conversation)))
                      .catch(() =>
                        host.notify("This chat could not be deleted. Check plugin storage access."),
                      );
                  }}
                />
              ) : (
                <IconButton
                  icon="trash-2"
                  label="Delete this chat"
                  onClick={() => setConfirming(conversation.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
