"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const AI_REFERRERS = ["chatgpt.com", "chat.openai.com", "perplexity.ai", "copilot.microsoft.com", "gemini.google.com", "claude.ai"];

/**
 * First-touch attribution: stores where the visitor came from (utm_source, a QR code, or an AI-search referrer)
 * in a first-party cookie for 30 days so a later order can be attributed. No personal data, no third parties.
 */
function Capture() {
  const params = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(admin|seller|account)(\/|$)/.test(pathname)) return;
    if (document.cookie.split("; ").some((c) => c.startsWith("sb_ref="))) return; // keep the first touch
    let s = params.get("utm_source") ?? (params.get("ref") === "qr" ? "qr" : null);
    let m = params.get("utm_medium");
    const c = params.get("utm_campaign");
    if (!s && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (AI_REFERRERS.some((a) => host === a || host.endsWith(`.${a}`))) { s = host; m = "ai-referral"; }
      } catch { /* ignore */ }
    }
    if (!s) return;
    const v = encodeURIComponent(JSON.stringify({ s: s.slice(0, 60), m: m?.slice(0, 60) ?? null, c: c?.slice(0, 80) ?? null }));
    document.cookie = `sb_ref=${v}; Max-Age=${30 * 86400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [params, pathname]);
  return null;
}

export function ReferralCapture() {
  return <Suspense fallback={null}><Capture /></Suspense>;
}
