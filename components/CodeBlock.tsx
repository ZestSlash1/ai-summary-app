"use client";

import { parseSegments, parseUnifiedDiff, looksLikeUnifiedDiff } from "@/lib/codeBlocks";
import { StreamingText } from "@/components/aicss/StreamingText";
import { TextResponse } from "@/components/aicss/TextResponse";
import { CodeBlock as AicssCodeBlock } from "@/components/aicss/CodeBlock";
import { FileDiff } from "@/components/aicss/FileDiff";

export function MessageText({ text, streaming }: { text: string; streaming?: boolean }) {
  const segments = parseSegments(text);
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          if (streaming) {
            return <StreamingText key={i} text={segment.content} />;
          }
          return (
            <TextResponse key={i}>
              <span className="whitespace-pre-wrap">{segment.content}</span>
            </TextResponse>
          );
        }

        const isDiff =
          segment.language === "diff" ||
          segment.language === "patch" ||
          looksLikeUnifiedDiff(segment.content);
        if (isDiff) {
          const parsed = parseUnifiedDiff(segment.content);
          if (parsed) {
            return (
              <div key={i} className="my-2">
                <FileDiff file={segment.path ?? parsed.file} rows={parsed.rows} />
              </div>
            );
          }
        }

        return (
          <div key={i} className="my-2">
            <AicssCodeBlock lang={segment.path ?? segment.language} code={segment.content} />
          </div>
        );
      })}
    </>
  );
}
