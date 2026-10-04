import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { Attachment } from "../session/chat-session";
import { useHost } from "./host";
import { Icon, IconButton } from "./icons";
import {
  matchNotes,
  mentionAt,
  removeMention,
  type MentionQuery,
  type NoteOption,
} from "./mentions";

/**
 * The question box: attachments as chips, one-click suggestions for the open note and the
 * current selection, "@" to attach any note, Enter to send, Esc to stop.
 */
export function Composer(props: {
  running: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
}) {
  const host = useHost();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [activeNote, setActiveNote] = useState(() => host.activeNote());
  const [selection, setSelection] = useState<ReturnType<typeof host.selection>>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionsId = useId();
  const hintId = useId();

  useEffect(() => host.onActiveNoteChange(() => setActiveNote(host.activeNote())), [host]);
  // Offer a selection as soon as it is made; reading it again on focus is the fallback.
  useEffect(() => host.onSelectionChange(() => setSelection(host.selection())), [host]);
  useEffect(() => {
    if (!props.running) inputRef.current?.focus();
  }, [props.running]);

  const options: NoteOption[] = mention ? matchNotes(host.noteOptions(), mention.query) : [];
  const attached = (path: string, kind: Attachment["kind"]) =>
    attachments.some((a) => a.kind === kind && a.path === path);

  // Functional updates: two quick clicks before a re-render must both count.
  const attach = (attachment: Attachment) =>
    setAttachments((current) =>
      current.some((a) => a.kind === attachment.kind && a.path === attachment.path)
        ? current
        : [...current, attachment],
    );

  const pick = (option: NoteOption) => {
    const caret = inputRef.current?.selectionStart ?? draft.length;
    if (mention) {
      const next = removeMention(draft, mention, caret);
      setDraft(next.draft);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.caret, next.caret));
    }
    attach({ kind: "note", path: option.path, title: option.title });
    setMention(null);
  };

  const updateMention = (value: string, caret: number) => {
    const next = mentionAt(value, caret);
    setMention(next);
    if (next?.query !== mention?.query) setHighlighted(0);
  };

  const submit = () => {
    const text = draft.trim();
    if (text === "" || props.running) return;
    props.onSend(text, attachments);
    setDraft("");
    setAttachments([]);
    setSelection(null);
    setMention(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Keys that confirm an IME candidate while composing Chinese must not act here.
    if (event.nativeEvent.isComposing) return;
    if (mention && options.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlighted((highlighted + step + options.length) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(options[highlighted] ?? options[0]!);
        return;
      }
    }
    if (event.key === "Escape") {
      if (mention) setMention(null);
      else if (props.running) props.onStop();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const suggestions: Attachment[] = [];
  if (activeNote && !attached(activeNote.path, "note")) {
    suggestions.push({ kind: "note", ...activeNote });
  }
  if (selection && !attached(selection.path, "selection")) {
    suggestions.push({ kind: "selection", ...selection });
  }

  return (
    <div className="za-composer">
      {mention && options.length > 0 && (
        <ul id={mentionsId} className="za-mentions" role="listbox" aria-label="Attach a note">
          {options.map((option, index) => (
            <li
              key={option.path}
              id={`${mentionsId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              className={index === highlighted ? "is-selected" : ""}
              onMouseDown={(event) => {
                event.preventDefault(); // keep focus in the textarea
                pick(option);
              }}
            >
              <span className="za-mention-title">{option.title}</span>
              <span className="za-mention-stage">{option.stage ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Clicking anywhere in the box, not only on the text, starts typing. */}
      <div
        className="za-composer-box"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {(attachments.length > 0 || suggestions.length > 0) && (
          <div className="za-attachments">
            <span className="za-context-label">
              {attachments.length ? "Context" : "Add context"}
            </span>
            {attachments.map((attachment) => (
              <AttachmentChip
                key={`${attachment.kind}:${attachment.path}`}
                attachment={attachment}
                onRemove={() =>
                  setAttachments((current) => current.filter((a) => a !== attachment))
                }
              />
            ))}
            {suggestions.map((suggestion) => (
              <button
                key={`suggest:${suggestion.kind}:${suggestion.path}`}
                type="button"
                className="za-chip za-chip-suggestion"
                title={
                  suggestion.kind === "note"
                    ? "Attach the note you have open"
                    : "Attach the text selected in the editor"
                }
                onClick={() => attach(suggestion)}
              >
                <Icon icon="plus" className="za-chip-icon" />
                <span className="za-chip-label">{chipLabel(suggestion)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="za-composer-row">
          <textarea
            ref={inputRef}
            className="za-composer-input"
            aria-label="Ask your Zettelkasten"
            aria-describedby={hintId}
            aria-autocomplete="list"
            aria-controls={mention && options.length > 0 ? mentionsId : undefined}
            aria-activedescendant={
              mention && options.length > 0 ? `${mentionsId}-${highlighted}` : undefined
            }
            value={draft}
            placeholder="Ask about your notes…"
            rows={1}
            onChange={(event) => {
              setDraft(event.target.value);
              updateMention(event.target.value, event.target.selectionStart);
            }}
            onFocus={() => setSelection(host.selection())}
            onKeyDown={onKeyDown}
            onBlur={() => setMention(null)}
          />
          {props.running ? (
            <IconButton
              icon="square"
              label="Stop (Esc)"
              className="za-send za-stop"
              onClick={props.onStop}
            />
          ) : (
            <IconButton
              icon="arrow-up"
              label="Send"
              className="za-send"
              onClick={submit}
              disabled={draft.trim() === ""}
            />
          )}
        </div>
      </div>
      <div id={hintId} className="za-composer-hint">
        {props.running ? "Esc to stop" : "Enter to send · Shift+Enter for a new line · @ to attach"}
      </div>
    </div>
  );
}

export function AttachmentChip(props: { attachment: Attachment; onRemove?: () => void }) {
  const { attachment } = props;
  return (
    <span
      className="za-chip"
      title={attachment.kind === "selection" ? attachment.text.slice(0, 300) : attachment.path}
    >
      <Icon
        icon={attachment.kind === "note" ? "file-text" : "text-select"}
        className="za-chip-icon"
      />
      <span className="za-chip-label">{chipLabel(attachment)}</span>
      {props.onRemove && (
        <button
          type="button"
          className="za-chip-remove"
          aria-label={`Remove ${attachment.title}`}
          onClick={props.onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
}

function chipLabel(attachment: Attachment): string {
  return attachment.kind === "note"
    ? attachment.title
    : `Selection (${attachment.text.length} chars) · ${attachment.title}`;
}
