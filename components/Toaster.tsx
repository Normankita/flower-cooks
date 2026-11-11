"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; text: string; leaving?: boolean };

const Ctx = createContext<{ toast: (text: string, kind?: Kind) => void }>({ toast: () => {} });

/** Show a toast from any client component: `const { toast } = useToast(); toast("Imehifadhiwa")`. */
export const useToast = () => useContext(Ctx);

const ICON: Record<Kind, string> = { success: "✓", error: "!", info: "i" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 260);
  }, []);

  const toast = useCallback(
    (text: string, kind: Kind = "success") => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-2), { id, kind, text }]); // keep at most 3 on screen
      setTimeout(() => dismiss(id), kind === "error" ? 5500 : 3200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-wrap" role="region" aria-live="polite" aria-label="Notifications">
        {items.map((t) => (
          <div
            key={t.id}
            className="toast"
            data-kind={t.kind}
            data-leaving={t.leaving ? "true" : undefined}
            role={t.kind === "error" ? "alert" : "status"}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-dot" aria-hidden>{ICON[t.kind]}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
