"use client";
// "Resend code" with a visible 60-second cooldown. The server enforces the same cooldown independently.
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function ResendButton({ initialSeconds }: { initialSeconds: number }) {
  const [left, setLeft] = useState(initialSeconds);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <button type="submit" className="link disabled:cursor-not-allowed disabled:text-muted disabled:no-underline" disabled={left > 0 || pending} aria-live="polite">
      {pending ? "Sending…" : left > 0 ? `Resend code in ${left}s` : "Resend code"}
    </button>
  );
}
