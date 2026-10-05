import { setIcon } from "obsidian";
import { useEffect, useRef } from "react";

/** Obsidian's Lucide icons, rendered through setIcon. */
export function Icon({ icon, className }: { icon: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, icon);
  }, [icon]);
  return <span ref={ref} className={className} aria-hidden="true" />;
}

export function IconButton(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  text?: string;
  expanded?: boolean;
  controls?: string;
  onBlur?: () => void;
}) {
  return (
    <button
      type="button"
      className={`${props.text ? "za-action-button" : "clickable-icon"} za-icon-button ${props.className ?? ""}`}
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.expanded}
      aria-controls={props.controls}
      onClick={props.onClick}
      onBlur={props.onBlur}
      disabled={props.disabled ?? false}
    >
      <Icon icon={props.icon} />
      {props.text && <span>{props.text}</span>}
    </button>
  );
}
