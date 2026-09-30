"use client";

import { useEffect, useState } from "react";
import type { ModelSource } from "@/lib/storage";
import { MODEL_SOURCE_EVENT, loadModelSource, saveModelSource } from "@/lib/storage";
import { useHomeGpu } from "@/lib/useHomeGpu";
import { BonsaiStateLine } from "@/components/GpuStatus";
import { Segmented } from "@/components/ui/Segmented";

const OPTIONS: { value: ModelSource; label: string }[] = [
  { value: "gateway", label: "AI Gateway" },
  { value: "omniroute", label: "OmniRoute" },
  { value: "bonsai", label: "Bonsai (Local)" },
];

export function ModelSourceToggle() {
  const [source, setSource] = useState<ModelSource>("gateway");
  const { allowed } = useHomeGpu();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(loadModelSource());
    const onSource = (e: Event) => setSource((e as CustomEvent<ModelSource>).detail);
    window.addEventListener(MODEL_SOURCE_EVENT, onSource);
    return () => window.removeEventListener(MODEL_SOURCE_EVENT, onSource);
  }, []);

  // Bonsai runs on the owner's PC: accounts that cannot use it do not see it.
  const options = allowed === false ? OPTIONS.filter((o) => o.value !== "bonsai") : OPTIONS;

  return (
    <div className="flex flex-col items-start gap-3">
      <Segmented label="Model source" value={source} options={options} onChange={saveModelSource} />
      <BonsaiStateLine active={source === "bonsai"} />
    </div>
  );
}
