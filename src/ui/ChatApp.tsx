import { setIcon } from "obsidian";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import type { StopReason, TurnUsage } from "../agent/loop";
import type { AssistantItem, AssistantPart, ChatItem, ChatSession } from "../session/chat-session";
import { useHost } from "./host";
import { Markdown } from "./Markdown";

const STARTERS = [
  "哪些 fleeting 笔记已经值得发展成永久笔记？",
  "Which permanent notes have no links at all?",
  "我的笔记里有没有互相矛盾的观点？",
];

export function ChatApp({ session }: { session: ChatSession }) {
  const host = useHost();
  const { items, running } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const scrollRef = useStickToBottom(items);

  return (
    <div className="azk-chat">
      <header className="azk-header">
        <span className="azk-header-title">Zettelkasten</span>
        <span className="azk-header-model" title="Questions and note excerpts go to Anthropic">
          {host.model()}
        </span>
        <IconButton icon="square-pen" label="New chat" onClick={() => session.reset()} />
      </header>

      <div ref={scrollRef} className="azk-transcript" role="log" aria-live="polite">
        {items.length === 0 ? (
          <div className="azk-empty">
            <p>Ask anything about your notes. Answers cite the notes they come from.</p>
            <div className="azk-starters">
              {STARTERS.map((starter) => (
                <button key={starter} type="button" onClick={() => void session.send(starter)}>
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map((item) => <Message key={item.id} item={item} session={session} />)
        )}
      </div>

      <Composer
        running={running}
        onSend={(text) => void session.send(text)}
        onStop={() => session.stop()}
      />
    </div>
  );
}

const Message = memo(function Message(props: { item: ChatItem; session: ChatSession }) {
  if (props.item.kind === "user") {
    return <div className="azk-message azk-message-user">{props.item.text}</div>;
  }
  return <AssistantMessage item={props.item} session={props.session} />;
});

function AssistantMessage({ item, session }: { item: AssistantItem; session: ChatSession }) {
  const host = useHost();
  const running = item.status === "running";
  const answer = running ? "" : session.answerMarkdown(item);

  return (
    <div className="azk-message azk-message-assistant">
      {item.parts.map((part, index) => (
        <Part
          key={part.kind === "tool" ? part.id : `${part.kind}-${index}`}
          part={part}
          streaming={running && index === item.parts.length - 1}
        />
      ))}
      {running && item.parts.at(-1)?.kind !== "text" && (
        <div className="azk-working" aria-label="Working">
          <span />
          <span />
          <span />
        </div>
      )}
      {!running && (
        <>
          <StopNote stop={item.stop} error={item.error} />
          {item.citations && item.citations.unknown.length > 0 && (
            <div className="azk-note azk-note-warning">
              Cited evidence that was never retrieved: {item.citations.unknown.join(", ")}
            </div>
          )}
          <div className="azk-message-footer">
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
        <details className="azk-thinking">
          <summary>{streaming ? "Thinking…" : "Thought process"}</summary>
          <div className="azk-thinking-text">{part.text}</div>
        </details>
      );
    case "tool":
      return (
        <details
          className={`azk-tool${part.summary === null ? " is-running" : ""}${part.isError ? " is-error" : ""}`}
        >
          <summary>
            <ToolIcon name={part.name} />
            <span className="azk-tool-summary">{part.summary ?? `${part.name}…`}</span>
          </summary>
          <pre className="azk-tool-input">{JSON.stringify(part.input, null, 2)}</pre>
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
  return <Icon icon={TOOL_ICONS[name] ?? "wrench"} className="azk-tool-icon" />;
}

const STOP_NOTES: Partial<Record<StopReason, string>> = {
  budget_exhausted: "Research budget reached; this answer uses the evidence gathered so far.",
  refusal: "The model declined to answer this.",
  max_tokens: "The response was cut off because it reached the length limit.",
  aborted: "Stopped.",
};

function StopNote({ stop, error }: { stop: StopReason | null; error: string | null }) {
  if (stop === "error") return <div className="azk-note azk-note-error">{error}</div>;
  const note = stop ? STOP_NOTES[stop] : undefined;
  return note ? <div className="azk-note">{note}</div> : null;
}

function UsageLine({ usage }: { usage: TurnUsage }) {
  const input = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const cached = input > 0 ? Math.round((usage.cacheReadTokens / input) * 100) : 0;
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <span className="azk-usage">
      {usage.toolCalls} tool{usage.toolCalls === 1 ? "" : "s"} · {k(input)} in ({cached}% cached) ·{" "}
      {k(usage.outputTokens)} out
    </span>
  );
}

function Composer(props: { running: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = draft.trim();
    if (text === "" || props.running) return;
    props.onSend(text);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter confirms an IME candidate while composing Chinese; it must not send.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  useEffect(() => {
    if (!props.running) inputRef.current?.focus();
  }, [props.running]);

  return (
    <div className="azk-composer">
      <textarea
        ref={inputRef}
        className="azk-composer-input"
        value={draft}
        placeholder="Ask your Zettelkasten…  (Enter to send, Shift+Enter for a new line)"
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {props.running ? (
        <IconButton icon="square" label="Stop" onClick={props.onStop} />
      ) : (
        <IconButton icon="arrow-up" label="Send" onClick={submit} disabled={draft.trim() === ""} />
      )}
    </div>
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

function Icon({ icon, className }: { icon: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, icon);
  }, [icon]);
  return <span ref={ref} className={className} aria-hidden="true" />;
}

function IconButton(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, props.icon);
  }, [props.icon]);
  return (
    <button
      ref={ref}
      type="button"
      className="clickable-icon azk-icon-button"
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled ?? false}
    />
  );
}
