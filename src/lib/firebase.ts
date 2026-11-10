"use client";

// Browser-only Firebase helpers. Never import this from server code.
// The SDK is loaded lazily (dynamic import) so it doesn't add to every page's initial JavaScript.
import type { FirebaseApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import { firebaseConfig } from "@/config/firebase";

export async function firebaseApp(): Promise<FirebaseApp> {
  const { getApp, getApps, initializeApp } = await import("firebase/app");
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let analyticsPromise: Promise<Analytics | null> | null = null;

/** Analytics instance, or null where unsupported (old browsers, blocked by an ad blocker, server). */
export function analytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  analyticsPromise ??= (async () => {
    const { initializeAnalytics, isSupported } = await import("firebase/analytics");
    if (!(await isSupported())) return null;
    // automatic page_view off: FirebaseAnalytics sends one per route (incl. client-side navigation)
    return initializeAnalytics(await firebaseApp(), { config: { send_page_view: false } });
  })().catch(() => null);
  return analyticsPromise;
}

/** Fire-and-forget event, e.g. track("purchase", { value: 49.95, currency: "AUD" }). */
export function track(name: string, params?: Record<string, unknown>) {
  void analytics().then(async (a) => {
    if (!a) return;
    const { logEvent } = await import("firebase/analytics");
    logEvent(a, name, params);
  });
}
