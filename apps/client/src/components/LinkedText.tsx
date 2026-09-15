import type { ReactNode } from "react";

export function LinkedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let position = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let candidate = match[0].replace(/[.,!?;:]+$/, "");
    while (candidate.endsWith(")") && (candidate.match(/\)/g)?.length ?? 0) > (candidate.match(/\(/g)?.length ?? 0)) candidate = candidate.slice(0, -1);
    let url: URL;
    try { url = new URL(candidate); } catch { continue; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
    parts.push(text.slice(position, match.index));
    parts.push(<a key={match.index} href={url.href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{candidate}</a>);
    position = match.index + candidate.length;
  }
  parts.push(text.slice(position));
  return <>{parts}</>;
}
