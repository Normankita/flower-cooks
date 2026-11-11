"use client";
import { useState } from "react";

export default function CopyButton({ text, label = "Nakili" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Nakili ujumbe:", text);
        }
      }}
    >
      {done ? "Imenakiliwa ✓" : label}
    </button>
  );
}
