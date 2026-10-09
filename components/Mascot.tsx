import { BrandMark } from "./BrandMark";

/** The mascot is the mark itself, in a good mood. */
export function Mascot({ className }: { className?: string }) {
  return <BrandMark mood="happy" className={className} />;
}
