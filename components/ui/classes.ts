/** Composer chip: model, repo, connectors, plan. Quiet until hovered. */
export const CHIP =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-nimbus-border px-2.5 text-[12.5px] font-medium text-nimbus-text-muted transition-[color,background-color,border-color,transform] duration-200 hover:bg-nimbus-surface-2 hover:text-nimbus-text active:scale-[0.97] aria-expanded:bg-nimbus-surface-2 aria-expanded:text-nimbus-text";

/** A row inside a popover list. */
export const MENU_ROW =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-nimbus-text transition-colors duration-150 hover:bg-nimbus-surface-2";

/** Small uppercase-free section label inside popovers and settings. */
export const MENU_LABEL = "px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-nimbus-text-faint";

/** Text input on a surface. */
export const FIELD =
  "w-full rounded-lg border border-nimbus-border bg-nimbus-chrome px-3 py-2 text-[13px] text-nimbus-text placeholder:text-nimbus-text-faint transition-[border-color,box-shadow] duration-200 focus:border-nimbus-accent/60 focus:shadow-[0_0_0_3px_var(--nimbus-accent-soft)] focus:outline-none";

export const BUTTON_PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-nimbus-accent px-3.5 text-[13px] font-medium text-white shadow-[var(--nimbus-glow)] transition-[background-color,transform,opacity] duration-200 hover:bg-nimbus-accent-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const BUTTON_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-nimbus-border bg-nimbus-surface px-3.5 text-[13px] font-medium text-nimbus-text transition-[background-color,transform,border-color] duration-200 hover:bg-nimbus-surface-2 hover:border-nimbus-border-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nimbus-text-muted transition-[color,background-color,transform] duration-200 hover:bg-nimbus-surface-2 hover:text-nimbus-text active:scale-90";
