import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

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
  const scrollRef = useStickToBottom(items);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="za-chat">
      <header className="za-header">
        <span className="za-header-title">Zettelkasten</span>
        <span
          className="za-header-model"
          title={`Questions and note excerpts go to ${host.providerLabel()}`}
        >
          {host.model()}
        </span>
        {host.recordingMode() !== "off" && (
          <span
            className={`za-mode-badge za-mode-${host.recordingMode()}`}
            title={
              host.recordingMode() === "replay"
                ? "Offline: answers are replayed from recordings, at no cost"
                : "Recording: each answer is saved for offline replay"
            }
          >
            {host.recordingMode() === "replay" ? "Replay" : "Recording"}
          </span>
        )}
        <IconButton
          icon="history"
          label="Chat history"
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
      </header>

      {showHistory && (
        <HistoryPanel currentId={conversationId} onClose={() => setShowHistory(false)} />
      )}

      <div ref={scrollRef} className="za-transcript" role="log" aria-live="polite">
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
    void host.recordedQuestions().then((questions) => {
      if (current) setRecorded(questions);
    });
    return () => {
      current = false;
    };
  }, [host, replay]);

  const starters = replay ? (recorded ?? []).slice(0, 8) : STARTERS;
  return (
    <div className="za-empty">
      <p>
        {replay
          ? "Replay mode: pick a recorded question to see its answer again, offline and free."
          : "Ask anything about your notes. Answers cite the notes they come from."}
      </p>
      {replay && recorded?.length === 0 && (
        <p>
          No recordings for this model yet. Switch Offline mode to Record and ask a few questions.
        </p>
      )}
      <div className="za-starters">
        {starters.map((starter) => (
          <button key={starter} type="button" onClick={() => onAsk(starter)}>
            {starter}
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
  const answer = running ? "" : session.answerMarkdown(item);

  return (
    <div className="za-message za-message-assistant">
      {item.parts.map((part, index) => (
        <Part
          key={part.kind === "tool" ? part.id : `${part.kind}-${index}`}
          part={part}
          streaming={running && index === item.parts.length - 1}
        />
      ))}
      {running && item.parts.at(-1)?.kind !== "text" && (
        <div className="za-working" aria-label="Working">
          <span />
          <span />
          <span />
        </div>
      )}
      {!running && (
        <>
          <StopNote stop={item.stop} error={item.error} />
          {item.citations && item.citations.unknown.length > 0 && (
            <div className="za-note za-note-warning">
              Cited evidence that was never retrieved: {item.citations.unknown.join(", ")}
            </div>
          )}
          <div className="za-message-footer">
            {answer !== "" && (
              <>
                <IconButton
                  icon="copy"
                  label="Copy answer (citations become note links)"
                  onClick={() =>
                    void navigator.clipboard.writeText(answer).then(() => host.notify("Copied"))
                  }
                />
                <IconButton
                  icon="text-cursor-input"
                  label="Insert answer at the cursor in the last note you edited"
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

function Part({ part, streaming }: { part: AssistantPart; streaming: boolean }) {
  switch (part.kind) {
    case "text":
      return <Markdown text={part.text} streaming={streaming} />;
    case "thinking":
      return (
        <details className="za-thinking">
          <summary>{streaming ? "Thinking…" : "Thought process"}</summary>
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
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <span className="za-usage">
      {usage.toolCalls} tool{usage.toolCalls === 1 ? "" : "s"} · {k(input)} in ({cached}% cached) ·{" "}
      {k(usage.outputTokens)} out
    </span>
  );
}

/** Keeps the transcript scrolled to the bottom unless the user has scrolled up. */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    };
    element.addEventListener("scroll", onScroll);
    return () => element.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [dependency]);
  return ref;
}
