"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";

type Tone = "success" | "error" | "info";
export type ToastInput = {
  title: string;
  description?: string;
  tone?: Tone;
  action?: { label: string; href?: string; onClick?: () => void };
};
type Toast = ToastInput & { id: number; leaving?: boolean };

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Show a short message in the corner: `const toast = useToast(); toast({ title })`. */
export function useToast() {
  return useContext(ToastContext);
}

const VISIBLE_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:items-end"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} onGone={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_ICON: Record<Tone, ReactNode> = {
  success: <CircleCheck aria-hidden className="h-4 w-4 text-nimbus-free" />,
  error: <CircleAlert aria-hidden className="h-4 w-4 text-nimbus-danger" />,
  info: <Info aria-hidden className="h-4 w-4 text-nimbus-accent-text" />,
};

function ToastCard({
  toast,
  onDismiss,
  onGone,
}: {
  toast: Toast;
  onDismiss: () => void;
  onGone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const fast = reducedMotion();
      if (toast.leaving) {
        gsap.to(el, {
          autoAlpha: 0,
          x: 18,
          scale: 0.97,
          height: 0,
          marginTop: -8,
          duration: fast ? 0 : 0.32,
          ease: "aro-in",
          onComplete: onGone,
        });
      } else {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 14, scale: 0.96 },
          { autoAlpha: 1, y: 0, scale: 1, duration: fast ? 0 : 0.5, ease: "aro" }
        );
      }
    },
    { dependencies: [toast.leaving] }
  );

  const tone = toast.tone ?? "info";
  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      className="nimbus-glass pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-[14px] border border-nimbus-border-strong bg-nimbus-surface/95 px-3.5 py-3 text-sm shadow-[var(--nimbus-shadow-lift)]"
    >
      <span className="mt-0.5 shrink-0">{TONE_ICON[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-nimbus-text">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-[13px] leading-relaxed text-nimbus-text-muted">{toast.description}</p>
        )}
        {toast.action &&
          (toast.action.href ? (
            <a
              href={toast.action.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-[13px] font-medium text-nimbus-accent-text hover:underline"
            >
              {toast.action.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick?.();
                onDismiss();
              }}
              className="mt-1.5 text-[13px] font-medium text-nimbus-accent-text hover:underline"
            >
              {toast.action.label}
            </button>
          ))}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-nimbus-text-faint transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
