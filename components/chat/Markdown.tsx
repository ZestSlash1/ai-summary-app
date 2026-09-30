"use client";

import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { looksLikeUnifiedDiff, parseUnifiedDiff } from "@/lib/codeBlocks";
import { FileDiff } from "@/components/aicss/FileDiff";
import { CodeBlock } from "./CodeBlock";

/** Splits a fence's info string: "tsx:app/page.tsx" is language tsx at path app/page.tsx. */
function parseFenceInfo(className: string | undefined): { language: string; path?: string } {
  const info = /language-(\S+)/.exec(className ?? "")?.[1] ?? "";
  const colon = info.indexOf(":");
  if (colon === -1) return { language: info || "text" };
  return { language: info.slice(0, colon) || "text", path: info.slice(colon + 1) || undefined };
}

function textOfChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOfChildren).join("");
  return "";
}

const components: Components = {
  // Fenced code arrives as <pre><code class="language-x">. Route it to our block or diff view.
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
      return <pre>{children}</pre>;
    }
    const { language, path } = parseFenceInfo(child.props.className);
    const code = textOfChildren(child.props.children).replace(/\n$/, "");
    const isDiff = language === "diff" || language === "patch" || looksLikeUnifiedDiff(code);
    if (isDiff) {
      const parsed = parseUnifiedDiff(code);
      if (parsed) {
        return (
          <div className="my-3">
            <FileDiff file={path ?? parsed.file} rows={parsed.rows} />
          </div>
        );
      }
    }
    return <CodeBlock language={language} path={path} code={code} />;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

/** Assistant text as markdown (GitHub flavored), with code blocks and diffs rendered richly. */
export const MessageText = memo(function MessageText({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <div className={`aro-prose ${streaming ? "is-streaming" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
