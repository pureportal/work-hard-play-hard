import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import "../message-markdown.css";

const components: Components = {
  a: ({ href, children, title }) => href
    ? <a href={href} title={title} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{children}</a>
    : <>{children}</>,
  img: ({ alt }) => <>{alt}</>,
  table: ({ children }) => <div className="message-table" tabIndex={0} role="region" aria-label="Message table"><table>{children}</table></div>,
};

function messageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return ["https:", "http:", "mailto:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : "";
  } catch {
    return "";
  }
}

export function MessageMarkdown({ text }: { text: string }) {
  return <div className="message-markdown">
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components} urlTransform={messageUrl}>{text}</Markdown>
  </div>;
}
