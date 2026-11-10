import "server-only";
// First-party referral tracking (UTM parameters, AI-search referrers, share clicks).
// Stores only the source/medium/campaign and the page — no IP addresses, cookies IDs or personal data.

import { db } from "./db";

export const AI_SOURCES = ["chatgpt.com", "chat.openai.com", "perplexity.ai", "copilot.microsoft.com", "gemini.google.com", "claude.ai", "you.com"];
export const isAiSource = (s: string | null | undefined) => !!s && AI_SOURCES.some((a) => s === a || s.endsWith(`.${a}`));

const clean = (v: unknown, max = 60) => {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, max) : "";
  return s || null;
};

export type Referral = { source: string; medium: string | null; campaign: string | null };

/** From page search params: utm_* wins; `ref=qr` (QR codes) is also recognised. */
export function referralFromParams(sp: Record<string, string | string[] | undefined>): Referral | null {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const source = clean(one("utm_source")) ?? (one("ref") === "qr" ? "qr" : null);
  if (!source) return null;
  return { source, medium: clean(one("utm_medium")) ?? (source === "qr" ? "offline" : null), campaign: clean(one("utm_campaign"), 80) };
}

/** Parses the sb_ref first-party cookie set by the browser (first touch, 30 days). */
export function referralFromCookie(raw: string | undefined): Referral | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const source = clean(v.s);
    return source ? { source, medium: clean(v.m), campaign: clean(v.c, 80) } : null;
  } catch {
    return null;
  }
}

export async function recordReferral(kind: "VISIT" | "SHARE", r: Referral, at: { listingId?: string | null; sellerId?: string | null; path?: string | null }) {
  try {
    await db.referralEvent.create({ data: { kind, source: r.source, medium: r.medium, campaign: r.campaign, listingId: at.listingId ?? null, sellerId: at.sellerId ?? null, path: at.path?.slice(0, 200) ?? null } });
  } catch (e) {
    console.error("[referral] not recorded:", e instanceof Error ? e.message : e);
  }
}
