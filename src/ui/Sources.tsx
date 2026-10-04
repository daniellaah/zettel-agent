import { Keymap } from "obsidian";
import type { MouseEvent } from "react";

import type { AnswerProvenance, SourceView } from "../session/provenance";
import { useHost } from "./host";
import { Icon } from "./icons";
import { seenPresentation, sourcesSummary } from "./presentation";

/**
 * Where an answer came from: each cited source with how much of it the model saw,
 * then the notes it looked at without citing. Folded so the answer stays first; the folded
 * line already says how many cited notes were not read in full.
 */
export function Sources(props: {
  provenance: AnswerProvenance;
  linked: string | null;
  onLink: (id: string | null) => void;
}) {
  const { cited, consulted } = props.provenance;
  if (cited.length === 0 && consulted.length === 0) return null;
  const { label, unread } = sourcesSummary(props.provenance);
  return (
    <details className="za-sources">
      <summary>
        <Icon icon="chevron-right" className="za-disclosure-icon" />
        <span className="za-sources-label">Sources</span>
        <span className="za-sources-count">{label}</span>
        {unread > 0 && (
          <span className="za-sources-flag">
            <Icon icon="eye-off" className="za-sources-flag-icon" />
            {unread} not read in full
          </span>
        )}
      </summary>
      <div className="za-sources-body">
        {cited.length > 0 && (
          <ul className="za-source-list" aria-label="Cited sources">
            {cited.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                numbered
                linked={props.linked === source.id}
                onLink={props.onLink}
              />
            ))}
          </ul>
        )}
        {unread > 0 && (
          <p className="za-sources-hint">
            Sources not read in full were seen only as excerpts, headings, titles or links. Open
            them to check the claims that cite them.
          </p>
        )}
        {consulted.length > 0 && (
          <details className="za-sources-more">
            <summary>
              <Icon icon="chevron-right" className="za-disclosure-icon" />
              Also looked at {consulted.length} {consulted.length === 1 ? "note" : "notes"} without
              citing
            </summary>
            <ul className="za-source-list" aria-label="Notes looked at but not cited">
              {consulted.map((source) => (
                <SourceRow key={source.path} source={source} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}

function SourceRow(props: {
  source: SourceView;
  numbered?: boolean;
  linked?: boolean;
  onLink?: (id: string | null) => void;
}) {
  const { source, onLink } = props;
  const host = useHost();
  const seen = seenPresentation(source);
  const state = host.evidenceState(source.id);
  const place = source.heading ? `${source.title} › ${source.heading}` : source.title;
  const stateText =
    state === "changed"
      ? "Changed since it was read"
      : state === "missing"
        ? "No longer available"
        : null;
  const open = (event: MouseEvent) => {
    event.preventDefault();
    host.openEvidence(source.id, Keymap.isModEvent(event.nativeEvent) !== false);
  };
  return (
    <li>
      <button
        type="button"
        className={`za-source${props.numbered ? "" : " is-plain"}${props.linked ? " is-linked" : ""}`}
        title={place}
        aria-label={`Open ${place}. ${seen.label}: ${seen.description}${stateText ? ` ${stateText}.` : ""}`}
        onClick={open}
        onAuxClick={open}
        onMouseEnter={() => onLink?.(source.id)}
        onMouseLeave={() => onLink?.(null)}
        onFocus={() => onLink?.(source.id)}
        onBlur={() => onLink?.(null)}
      >
        {props.numbered && (
          <span className="za-source-number" aria-hidden="true">
            {source.id.slice(1)}
          </span>
        )}
        <span className="za-source-text">
          <span className="za-source-title">{source.title}</span>
          {source.heading && <span className="za-source-heading">{source.heading}</span>}
          {stateText && <span className="za-source-state">{stateText}</span>}
        </span>
        <span className={`za-source-seen is-${seen.tier}`} title={seen.description}>
          <Icon icon={seen.icon} className="za-source-seen-icon" />
          <span>{seen.label}</span>
        </span>
      </button>
    </li>
  );
}
