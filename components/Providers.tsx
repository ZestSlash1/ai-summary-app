"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ToastProvider } from "./Toaster";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
