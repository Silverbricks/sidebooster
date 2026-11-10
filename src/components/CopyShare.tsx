"use client";

import { useEffect, useState } from "react";

/** Copy-link + the device's native share sheet (Instagram, TikTok, Messages… on phones). */
export function CopyShare({ url, title, text }: { url: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false); // decided after mount to avoid a hydration mismatch
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  return (
    <>
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copy this link:", url); }
        }}
      >
        {copied ? "✔ Copied" : "🔗 Copy link"}
      </button>
      {canShare && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => navigator.share({ url, title, text }).catch(() => undefined)}>
          📤 More…
        </button>
      )}
    </>
  );
}
