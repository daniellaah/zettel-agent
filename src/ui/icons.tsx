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
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, props.icon);
  }, [props.icon]);
  return (
    <button
      ref={ref}
      type="button"
      className={`clickable-icon za-icon-button ${props.className ?? ""}`}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled ?? false}
    />
  );
}
