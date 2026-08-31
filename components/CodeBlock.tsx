"use client";

import { useState } from "react";
import { parseSegments } from "@/lib/codeBlocks";

export function MessageText({ text }: { text: string }) {
  const segments = parseSegments(text);
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i} className="whitespace-pre-wrap">
            {segment.content}
          </span>
        ) : (
          <CodeBlock
            key={i}
            language={segment.language}
            path={segment.path}
            content={segment.content}
          />
        )
      )}
    </>
  );
}

function CodeBlock({
  language,
  path,
  content,
}: {
  language: string;
  path?: string;
  content: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-nimbus-border bg-nimbus-bg">
      <div className="flex items-center justify-between border-b border-nimbus-border px-3 py-1.5">
        <span className="truncate font-mono text-[11px] text-nimbus-text-muted">
          {path ?? language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-[11px] text-nimbus-text-muted transition-colors hover:text-nimbus-text"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-nimbus-text">
        {content}
      </pre>
    </div>
  );
}
