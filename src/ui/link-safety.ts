/** Model-authored app/deep links must never invoke note creation or other commands. */
export function safeExternalLink(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
