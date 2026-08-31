import type { ReactNode } from "react";

interface MarkdownDocumentProps {
  content: string;
  className?: string;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string };

export function MarkdownDocument({ content, className = "" }: MarkdownDocumentProps) {
  const blocks = parseMarkdown(content);
  return (
    <div className={`markdownDocument ${className}`.trim()}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: Block, index: number): ReactNode {
  if (block.type === "heading") {
    const children = renderInline(block.text);
    if (block.level === 1) return <h2 key={index}>{children}</h2>;
    if (block.level === 2) return <h3 key={index}>{children}</h3>;
    return <h4 key={index}>{children}</h4>;
  }
  if (block.type === "list") {
    return (
      <ul key={index}>
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
      </ul>
    );
  }
  if (block.type === "code") {
    return <pre key={index}><code>{block.text}</code></pre>;
  }
  return <p key={index}>{renderInline(block.text)}</p>;
}

function parseMarkdown(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      return;
    }
    if (inCode) {
      code.push(rawLine);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      return;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      return;
    }

    flushList();
    paragraph.push(line.trim());
  });

  if (inCode && code.length) blocks.push({ type: "code", text: code.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
