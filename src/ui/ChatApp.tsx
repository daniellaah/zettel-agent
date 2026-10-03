import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { StopReason, TurnUsage } from "../agent/loop";
import type {
  AssistantItem,
  AssistantPart,
  ChatItem,
  ChatSession,
  UserItem,
} from "../session/chat-session";
import { AttachmentChip, Composer } from "./Composer";
import { HistoryPanel } from "./HistoryPanel";
import { useHost } from "./host";
import { Icon, IconButton } from "./icons";
import { Markdown } from "./Markdown";
import { BRAND_ICON } from "./brand-icon";
import { NOTE_HINTS, NOTE_ICONS, NOTE_KINDS, NOTE_LABELS } from "./note-template";
import {
  citationWarnings,
  researchActivity,
  researchPresentation,
  setupMessage,
} from "./presentation";

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
        {config.mode !== "off" && (
          <span
            className={`za-mode-badge za-mode-${config.mode}`}
            title={
              config.mode === "replay"
                ? "Offline: answers are replayed from recordings, at no cost"
                : "Recording: each answer is saved for offline replay"
            }
          >
            {config.mode === "replay" ? "Replay" : "Recording"}
          </span>
        )}
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
            onClick={() => setShowNoteMenu(!showNoteMenu)}
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
          onClick={() => setShowHistory(!showHistory)}
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
          {config.indexed || !config.model || (config.mode !== "replay" && !config.hasKey) ? (
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
        <div ref={scrollRef} className="za-transcript" role="log" aria-live="polite">
          {items.length === 0 ? (
            <EmptyState
              key={`${config.provider}:${config.mode}:${config.model}`}
              onAsk={(question) => void session.send(question)}
            />
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
  const replay = host.recordingMode() === "replay";
  const [recorded, setRecorded] = useState<string[] | null>(null);
  useEffect(() => {
    if (!replay) return;
    let current = true;
    void host
      .recordedQuestions()
      .then((questions) => {
        if (current) setRecorded(questions);
      })
      .catch(() => {
        if (current) {
          setRecorded([]);
          host.notify("Recordings could not be loaded. Check plugin storage access.");
        }
      });
    return () => {
      current = false;
    };
  }, [host, replay]);

  const starters = replay ? (recorded ?? []).slice(0, 8) : STARTERS;
  return (
    <div className="za-empty">
      <Icon icon={BRAND_ICON} className="za-empty-icon" />
      <p className="za-empty-title">{replay ? "Replay mode" : "Ask your Zettelkasten"}</p>
      {replay && (
        <p className="za-empty-help">
          Pick a recorded question to see its answer again, offline and free.
        </p>
      )}
      {replay && recorded?.length === 0 && (
        <p className="za-empty-help">
          No recordings for this model yet. Switch Offline mode to Record and ask a few questions.
        </p>
      )}
      {starters.length > 0 && <p className="za-section-label">Try asking</p>}
      <div className="za-starters">
        {starters.map((starter) => (
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

const Message = memo(function Message(props: {
  item: ChatItem;
  session: ChatSession;
  isLast: boolean;
}) {
  if (props.item.kind === "user") return <UserMessage item={props.item} />;
  return <AssistantMessage item={props.item} session={props.session} isLast={props.isLast} />;
});

function UserMessage({ item }: { item: UserItem }) {
  return (
    <div className="za-message za-message-user">
      {item.attachments.length > 0 && (
        <div className="za-attachments">
          {item.attachments.map((attachment) => (
            <AttachmentChip key={`${attachment.kind}:${attachment.path}`} attachment={attachment} />
          ))}
        </div>
      )}
      {item.text}
    </div>
  );
}

function AssistantMessage(props: { item: AssistantItem; session: ChatSession; isLast: boolean }) {
  const { item, session } = props;
  const host = useHost();
  const running = item.status === "running";
  const presentation = researchPresentation(item.parts);
  const answer = running ? "" : session.answerMarkdown({ ...item, parts: presentation.answer });

  return (
    <div className="za-message za-message-assistant">
      {presentation.research.length > 0 && (
        <details className={`za-research${running ? " is-running" : ""}`}>
          <summary>
            <Icon icon="chevron-right" className="za-disclosure-icon" />
            <span className="za-research-label">
              {running ? researchActivity(item.parts) : "Research details"}
            </span>
            {presentation.steps > 0 && (
              <span className="za-research-count">
                {presentation.steps} {presentation.steps === 1 ? "step" : "steps"}
              </span>
            )}
          </summary>
          <div className="za-research-body">
            {presentation.research.map((part, index) => (
              <Part
                key={part.kind === "tool" ? part.id : `${part.kind}-${index}`}
                part={part}
                streaming={running && index === item.parts.length - 1}
              />
            ))}
          </div>
        </details>
      )}
      {presentation.answer.map((part, index) => (
        <Part
          key={part.kind === "tool" ? part.id : `${part.kind}-${index}`}
          part={part}
          streaming={running && index === presentation.answer.length - 1}
        />
      ))}
      {/* Before the first part arrives; after that the research line names the step. */}
      {running && item.parts.length === 0 && (
        <div className="za-working" aria-label="Working">
          <span />
          <span />
          <span />
        </div>
      )}
      {!running && (
        <>
          <StopNote stop={item.stop} error={item.error} />
          {presentation.limited && item.stop !== "budget_exhausted" && (
            <div className="za-note">
              Research limit reached; the answer uses the evidence gathered so far. Expand Research
              details to see the limit.
            </div>
          )}
          {presentation.failed && item.stop !== "error" && (
            <div className="za-note za-note-warning">
              Some research steps failed. Expand Research details to see what could not be
              retrieved.
            </div>
          )}
          {!!item.context?.omittedTurns && (
            <div className="za-note">
              Earlier turns were omitted from this request; the full conversation remains saved.
            </div>
          )}
          {item.reliability?.mode === "self-review" && (
            <div className="za-note">
              {item.reliability.status === "self-reviewed"
                ? "Evidence and coverage checked by the same model; not independently verified."
                : "Self-review did not finish successfully; no unchecked draft was delivered."}
            </div>
          )}
          {citationWarnings(
            item.reliability?.mode === "structural" ? item.reliability.issues : [],
            item.citations?.unknown ?? [],
          ).map((warning) => (
            <div key={warning} className="za-note za-note-warning">
              {warning}
            </div>
          ))}
          <div className="za-message-footer">
            {answer !== "" && (
              <>
                <CopyButton answer={answer} />
                <IconButton
                  icon="text-cursor-input"
                  label="Insert answer at the cursor in the last note you edited"
                  text="Insert"
                  onClick={() => {
                    if (!host.insertAtCursor(answer)) host.notify("Open a note to insert into.");
                  }}
                />
              </>
            )}
            {props.isLast && (
              <IconButton
                icon="rotate-ccw"
                label="Ask again (discards this answer)"
                text="Ask again"
                onClick={() => void session.retry()}
              />
            )}
            {item.usage && <UsageLine usage={item.usage} />}
          </div>
        </>
      )}
    </div>
  );
}

/** Copy confirms in place, where the user is looking, instead of in a distant notice. */
function CopyButton({ answer }: { answer: string }) {
  const host = useHost();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <IconButton
      icon={copied ? "check" : "copy"}
      label="Copy answer (citations become note links)"
      text={copied ? "Copied" : "Copy"}
      className={copied ? "is-done" : ""}
      onClick={() =>
        void navigator.clipboard
          .writeText(answer)
          .then(() => setCopied(true))
          .catch(() => host.notify("Could not copy. Select the answer and copy it manually."))
      }
    />
  );
}

function Part({ part, streaming }: { part: AssistantPart; streaming: boolean }) {
  switch (part.kind) {
    case "text":
      return <Markdown text={part.text} streaming={streaming} />;
    case "thinking":
      return (
        <details className="za-thinking">
          <summary>
            <Icon icon="brain" className="za-tool-icon" />
            <span>{streaming ? "Thinking…" : "Thought process"}</span>
          </summary>
          <div className="za-thinking-text">{part.text}</div>
        </details>
      );
    case "tool":
      return (
        <details
          className={`za-tool${part.summary === null ? " is-running" : ""}${part.isError ? " is-error" : ""}`}
        >
          <summary>
            <ToolIcon name={part.name} />
            <span className="za-tool-summary">{part.summary ?? `${part.name}…`}</span>
          </summary>
          <pre className="za-tool-input">{JSON.stringify(part.input, null, 2)}</pre>
        </details>
      );
  }
}

const TOOL_ICONS: Record<string, string> = {
  search: "search",
  match: "text-search",
  read: "file-text",
  links: "git-fork",
  list: "list",
};

function ToolIcon({ name }: { name: string }) {
  return <Icon icon={TOOL_ICONS[name] ?? "wrench"} className="za-tool-icon" />;
}

const STOP_NOTES: Partial<Record<StopReason, string>> = {
  budget_exhausted: "Research budget reached; this answer uses the evidence gathered so far.",
  refusal: "The model declined to answer this.",
  max_tokens: "The response was cut off because it reached the length limit.",
  aborted: "Stopped.",
};

function StopNote({ stop, error }: { stop: StopReason | null; error: string | null }) {
  if (stop === "error") return <div className="za-note za-note-error">{error}</div>;
  const note = stop ? STOP_NOTES[stop] : undefined;
  return note ? <div className="za-note">{note}</div> : null;
}

function UsageLine({ usage }: { usage: TurnUsage }) {
  const input = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const cached = input > 0 ? Math.round((usage.cacheReadTokens / input) * 100) : 0;
  // A turn that failed before any request completed has nothing to account for.
  if (input === 0 && usage.outputTokens === 0) return null;
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <span className="za-usage">
      {usage.toolCalls} tool{usage.toolCalls === 1 ? "" : "s"} · {k(input)} in ({cached}% cached) ·{" "}
      {k(usage.outputTokens)} out
    </span>
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
