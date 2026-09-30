import { setIcon } from "obsidian";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

interface Message {
  id: number;
  role: "user" | "notice";
  text: string;
}

export function ChatApp({ model }: { model: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(0);

  const send = (text: string) => {
    const id = nextId.current;
    nextId.current += 2;
    setMessages((current) => [
      ...current,
      { id, role: "user", text },
      { id: id + 1, role: "notice", text: "The agent loop is not connected yet." },
    ]);
  };

  return (
    <div className="azk-chat">
      <header className="azk-header">
        <span className="azk-header-title">Zettelkasten</span>
        <span className="azk-header-model" title="Requests are sent to Anthropic">
          {model}
        </span>
        <IconButton icon="plus" label="New chat" onClick={() => setMessages([])} />
      </header>
      <div className="azk-transcript" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="azk-empty">Ask anything about your notes.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`azk-message azk-message-${message.role}`}>
              {message.text}
            </div>
          ))
        )}
      </div>
      <Composer onSend={send} />
    </div>
  );
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (text === "") return;
    onSend(text);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter confirms an IME candidate while composing Chinese; it must not send.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="azk-composer">
      <textarea
        className="azk-composer-input"
        value={draft}
        placeholder="Ask your Zettelkasten…  (Enter to send, Shift+Enter for a new line)"
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <IconButton icon="arrow-up" label="Send" onClick={submit} disabled={draft.trim() === ""} />
    </div>
  );
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
