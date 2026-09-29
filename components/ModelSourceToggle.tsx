"use client";

import { useEffect, useState } from "react";
import type { ModelSource } from "@/lib/storage";
import { loadModelSource, saveModelSource } from "@/lib/storage";
import { BonsaiStateLine } from "@/components/GpuStatus";

const OPTIONS: { value: ModelSource; label: string }[] = [
  { value: "gateway", label: "AI Gateway" },
  { value: "omniroute", label: "OmniRoute" },
  { value: "bonsai", label: "Bonsai (Local)" },
];

export function ModelSourceToggle() {
  const [source, setSource] = useState<ModelSource>("gateway");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(loadModelSource());
  }, []);

  function select(value: ModelSource) {
    setSource(value);
    saveModelSource(value);
  }

  return (
    <div className="flex flex-col items-start gap-2.5">
    <div className="inline-flex rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-bg p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => select(opt.value)}
          className={`rounded-[var(--nimbus-radius-pill)] px-3.5 py-1.5 text-sm font-medium transition-colors ${
            source === opt.value
              ? "bg-nimbus-surface text-nimbus-text shadow-[var(--nimbus-shadow)]"
              : "text-nimbus-text-muted hover:text-nimbus-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
    <BonsaiStateLine active={source === "bonsai"} />
    </div>
  );
}
