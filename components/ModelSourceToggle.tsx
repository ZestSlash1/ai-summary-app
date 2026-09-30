"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { ModelSource } from "@/lib/storage";
import { useModelSource } from "@/lib/useModelSource";
import { BonsaiAccessNote, BonsaiStateLine } from "@/components/GpuStatus";
import { Segmented } from "@/components/ui/Segmented";

const OPTIONS: { value: ModelSource; label: string }[] = [
  { value: "gateway", label: "AI Gateway" },
  { value: "omniroute", label: "OmniRoute" },
  { value: "bonsai", label: "Bonsai (Local)" },
];

export function ModelSourceToggle() {
  const { source, setSource, bonsaiAllowed } = useModelSource();
  const [showLocked, setShowLocked] = useState(false);

  // Bonsai stays visible for everyone; accounts that cannot use it see why when they pick it.
  const locked = bonsaiAllowed === false;
  const options = OPTIONS.map((o) =>
    o.value === "bonsai" && locked
      ? { ...o, locked: true, hint: "Needs an allowed GitHub account", icon: <Lock aria-hidden className="h-3 w-3" /> }
      : o
  );

  return (
    <div className="flex flex-col items-start gap-3">
      <Segmented
        label="Model source"
        value={source}
        options={options}
        onChange={(value) => {
          setShowLocked(false);
          setSource(value);
        }}
        onLocked={() => setShowLocked(true)}
      />
      {showLocked && locked && <BonsaiAccessNote />}
      <BonsaiStateLine active={source === "bonsai"} />
    </div>
  );
}
