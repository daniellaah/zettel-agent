import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ChatSession } from "../session/chat-session";
import { BRAND_ICON } from "./brand-icon";
import { Composer } from "./Composer";
import { HistoryPanel } from "./HistoryPanel";
import { useHost } from "./host";
import { Icon, IconButton } from "./icons";
import { Message } from "./Message";
import { NOTE_HINTS, NOTE_ICONS, NOTE_KINDS, NOTE_LABELS } from "./note-template";
import { setupMessage } from "./presentation";

const STARTERS = [
  "Which ideas in my literature notes are worth developing further?",
  "Which permanent notes have no links at all?",
  "Do my notes contain conflicting views?",
];

export function ChatApp({ session }: { session: ChatSession }) {
  const host = useHost();
  const { items, running, conversationId } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const { ref: scrollRef, away, jump } = useStickToBottom(items);
  const [showHistory, setShowHistory] = useState(false);
  const [config, setConfig] = useState(() => host.configuration());
  const [showNoteMenu, setShowNoteMenu] = useState(false);
  const historyId = useId();
  const noteMenuId = useId();
  useEffect(() => host.onConfigurationChange(() => setConfig(host.configuration())), [host]);
  const setup = setupMessage(config);

  return (
    <div className="za-chat">
      <header className="za-header">
        <Icon icon={BRAND_ICON} className="za-header-logo" />
        <span className="za-header-title">Zettel Agent</span>
        <span
          className="za-header-model"
          title={`Questions and note excerpts go to ${config.provider}`}
        >
          {config.model || "Choose a model"}
        </span>
        <div
          className="za-note-menu-anchor"
          onKeyDown={(event) => {
            if (event.key === "Escape") setShowNoteMenu(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setShowNoteMenu(false);
          }}
        >
          <IconButton
            icon="file-plus"
            label="New note"
            expanded={showNoteMenu}
            controls={noteMenuId}
            onClick={() => setShowNoteMenu((open) => !open)}
          />
          {showNoteMenu && (
            <div id={noteMenuId} className="za-note-menu" role="menu" aria-label="New note">
              {NOTE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowNoteMenu(false);
                    host.openNoteDialog(kind);
                  }}
                >
                  <Icon icon={NOTE_ICONS[kind]} className="za-note-icon" />
                  <span className="za-note-label">{NOTE_LABELS[kind]}</span>
                  <span className="za-note-hint">{NOTE_HINTS[kind]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <IconButton
          icon="history"
          label="Chat history"
          expanded={showHistory}
          controls={historyId}
          onClick={() => setShowHistory((open) => !open)}
          disabled={running}
        />
        <IconButton
          icon="square-pen"
          label="New chat"
          onClick={() => {
            session.reset();
            setShowHistory(false);
          }}
        />
        <IconButton
          icon="settings"
          label="Zettel Agent settings"
          onClick={() => host.openSettings()}
        />
      </header>

      <div
        className="za-scope"
        title={`Research folder: ${config.folder}. Fleeting notes are excluded.`}
      >
        <Icon icon="folder-search" />
        <span className="za-scope-folder">{config.folder}</span>
        <span>{config.indexed ? `${config.notes} notes` : "Loading…"}</span>
      </div>
      {setup && (
        <div className="za-setup" role="status">
          <span>{setup}</span>
          {config.indexed || !config.model || !config.hasKey ? (
            <button type="button" onClick={() => host.openSettings()}>
              Open settings
            </button>
          ) : null}
        </div>
      )}

      {showHistory && (
        <HistoryPanel
          id={historyId}
          currentId={conversationId}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="za-transcript-wrap">
        {/* aria-busy holds back screen-reader announcements until the answer finishes. */}
        <div
          ref={scrollRef}
          className="za-transcript"
          role="log"
          aria-live="polite"
          aria-busy={running}
        >
          {items.length === 0 ? (
            <EmptyState onAsk={(question) => void session.send(question)} />
          ) : (
            items.map((item, index) => (
              <Message
                key={item.id}
                item={item}
                session={session}
                isLast={index === items.length - 1}
              />
            ))
          )}
        </div>
        {away && (
          <IconButton icon="arrow-down" label="Jump to latest" className="za-jump" onClick={jump} />
        )}
      </div>

      <Composer
        running={running}
        onSend={(text, attachments) => void session.send(text, attachments)}
        onStop={() => session.stop()}
      />
    </div>
  );
}

function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  const host = useHost();
  return (
    <div className="za-empty">
      <Icon icon={BRAND_ICON} className="za-empty-icon" />
      <p className="za-empty-title">Ask your Zettelkasten</p>
      <p className="za-section-label">Try asking</p>
      <div className="za-starters">
        {STARTERS.map((starter) => (
          <button key={starter} type="button" onClick={() => onAsk(starter)}>
            <span>{starter}</span>
            <Icon icon="arrow-up-right" className="za-starter-icon" />
          </button>
        ))}
      </div>
      <p className="za-section-label">New note</p>
      <div className="za-create">
        {NOTE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            title={`Create a ${kind} note: ${NOTE_HINTS[kind].toLowerCase()}`}
            onClick={() => host.openNoteDialog(kind)}
          >
            <Icon icon={NOTE_ICONS[kind]} className="za-note-icon" />
            <span className="za-note-label">{NOTE_LABELS[kind]}</span>
            <span className="za-note-hint">{NOTE_HINTS[kind]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Keeps the transcript scrolled to the bottom unless the user has scrolled up; `away`
 * says they have, so a jump-to-latest button can be offered.
 */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
      setAway(!pinned.current);
    };
    element.addEventListener("scroll", onScroll);
    return () => element.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [dependency]);
  // Markdown is rendered asynchronously, after the layout effect above has run, so the
  // transcript also follows content as it lands (a finished answer, a reopened chat).
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new MutationObserver(() => {
      if (pinned.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  const jump = () => {
    const element = ref.current;
    if (!element) return;
    pinned.current = true;
    setAway(false);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  };
  return { ref, away, jump };
}
