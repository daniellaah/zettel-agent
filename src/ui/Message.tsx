import { memo, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import type { TurnUsage } from "../agent/loop";
import type {
  AssistantItem,
  AssistantPart,
  ChatItem,
  ChatSession,
  UserItem,
} from "../session/chat-session";
import { citationIdOf } from "./citation-markup";
import { AttachmentChip } from "./Composer";
import { useHost } from "./host";
import { Icon, IconButton } from "./icons";
import { Markdown } from "./Markdown";
import { answerNotices, researchActivity, researchPresentation } from "./presentation";
import { Sources } from "./Sources";

/** One chat message. Memoized, so a streamed delta re-renders only the last message. */
export const Message = memo(function Message(props: {
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
  const provenance = useMemo(
    () => (running ? null : session.provenance(item)),
    [running, session, item],
  );
  // A source row and the answer's chips for the same evidence highlight together.
  const [linked, setLinked] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!linked || !messageRef.current) return;
    const chips = Array.from(
      messageRef.current.querySelectorAll<HTMLElement>(`:scope > .za-markdown .za-cite-${linked}`),
    );
    for (const chip of chips) chip.classList.add("is-linked");
    return () => {
      for (const chip of chips) chip.classList.remove("is-linked");
    };
  }, [linked]);
  const followChip = (event: SyntheticEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest(".za-sources")) return;
    const chip = target.closest<HTMLElement>(".za-cite");
    setLinked(chip ? citationIdOf(chip) : null);
  };

  return (
    <div
      ref={messageRef}
      className="za-message za-message-assistant"
      onMouseOver={followChip}
      onFocus={followChip}
      onMouseLeave={() => setLinked(null)}
    >
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
      {provenance && <Sources provenance={provenance} linked={linked} onLink={setLinked} />}
      {!running && (
        <>
          {answerNotices(item).map((notice) => (
            <div key={notice.text} className={`za-note za-note-${notice.tone}`}>
              {notice.text}
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
