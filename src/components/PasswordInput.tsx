"use client";
// Password field with a show/hide (eye) toggle. Toggling only changes the input type, so the typed value is kept.
import { useState } from "react";

export function PasswordInput({
  id, name, autoComplete = "current-password", required = true, minLength, placeholder, describedBy,
}: { id: string; name: string; autoComplete?: string; required?: boolean; minLength?: number; placeholder?: string; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} name={name} type={shown ? "text" : "password"} className="input pr-11" required={required} minLength={minLength}
        autoComplete={autoComplete} placeholder={placeholder} aria-describedby={describedBy} autoCapitalize="none" autoCorrect="off" spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={id}
        title={shown ? "Hide password" : "Show password"}
      >
        {shown ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.7 0 3.2-.5 4.6-1.2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
