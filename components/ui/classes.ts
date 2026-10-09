/**
 * Composer chip: model, repo, connectors, plan. Quiet until hovered; it gives a little under
 * a press and settles back on the house ease. Motion-safe only, so reduced motion keeps the
 * color and border feedback without the squish.
 */
export const CHIP =
  "flex h-8 max-sm:h-9 shrink-0 items-center gap-1.5 rounded-lg border border-nimbus-border px-2.5 text-[12.5px] font-medium text-nimbus-text-muted transition-[color,background-color,border-color,box-shadow,scale] duration-200 ease-[var(--nimbus-ease)] hover:border-nimbus-border-strong hover:bg-nimbus-surface-2 hover:text-nimbus-text motion-safe:active:scale-[0.95] motion-safe:active:duration-100 aria-expanded:border-nimbus-border-strong aria-expanded:bg-nimbus-surface-2 aria-expanded:text-nimbus-text";

/** A chip that is switched on: Plan, Workspace, skills or options in use. Add after CHIP. */
export const CHIP_ON =
  "border-nimbus-accent/40 bg-nimbus-accent-soft text-nimbus-accent-text hover:border-nimbus-accent/60 hover:bg-nimbus-accent-soft hover:text-nimbus-accent-text aria-expanded:border-nimbus-accent/60 aria-expanded:bg-nimbus-accent-soft aria-expanded:text-nimbus-accent-text";

/*
 * Chip labels fold away as the composer's controls row (the "controls" container) runs out
 * of room, least needed first, so the row never spills past the composer. A folded label
 * stays in the accessibility tree, and each chip keeps its tooltip.
 */
/** Folds first: Options, Skills, Workspace. */
export const CHIP_LABEL_EXTRA = "@max-[50rem]/controls:sr-only";
/** Folds next: the repo name. */
export const CHIP_LABEL_REPO = "@max-[40rem]/controls:sr-only";
/** Folds last: MCP and Plan. */
export const CHIP_LABEL = "@max-[34rem]/controls:sr-only";

/** A row inside a popover list. */
export const MENU_ROW =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-nimbus-text transition-[background-color,scale] duration-150 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2 motion-safe:active:scale-[0.985]";

/** Small uppercase-free section label inside popovers and settings. */
export const MENU_LABEL = "px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-nimbus-text-faint";

/** Text input on a surface. 16px on phones, because iOS Safari zooms into smaller fields. */
export const FIELD =
  "w-full rounded-lg border border-nimbus-border bg-nimbus-chrome px-3 py-2 text-[16px] text-nimbus-text placeholder:text-nimbus-text-faint transition-[border-color,box-shadow] sm:text-[13px] duration-200 focus:border-nimbus-accent/60 focus:shadow-[0_0_0_3px_var(--nimbus-accent-soft)] focus:outline-none";

export const BUTTON_PRIMARY =
  "aro-gel inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-nimbus-accent px-3.5 text-[13px] font-medium text-white transition-[background-color,box-shadow,scale,opacity,filter] duration-200 ease-[var(--nimbus-ease)] motion-safe:active:scale-[0.96] motion-safe:active:duration-100 disabled:pointer-events-none disabled:opacity-40";

export const BUTTON_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-nimbus-border bg-nimbus-surface px-3.5 text-[13px] font-medium text-nimbus-text transition-[background-color,border-color,scale] duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2 hover:border-nimbus-border-strong motion-safe:active:scale-[0.96] motion-safe:active:duration-100 disabled:pointer-events-none disabled:opacity-40";

export const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nimbus-text-muted transition-[color,background-color,scale] duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2 hover:text-nimbus-text motion-safe:active:scale-90 motion-safe:active:duration-100";
