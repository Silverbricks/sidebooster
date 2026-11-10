"use client";

import { useEffect, useState } from "react";
import { firebaseApp } from "@/lib/firebase";
import { firebaseVapidKey } from "@/config/firebase";
import { removePushTokenAction, savePushTokenAction } from "@/app/actions/account";

type State = "loading" | "unsupported" | "blocked" | "off" | "on" | "busy";
const STORE = "sb_push_token";

function stored() {
  try { return localStorage.getItem(STORE); } catch { return null; }
}
function store(v: string | null) {
  try { if (v) localStorage.setItem(STORE, v); else localStorage.removeItem(STORE); } catch { /* private mode */ }
}

async function messagingOrNull() {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return null;
  const { getMessaging, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return null;
  return getMessaging(await firebaseApp());
}

/** "Turn on push notifications" switch for the current browser. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const m = await messagingOrNull().catch(() => null);
      if (!m) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      setState(Notification.permission === "granted" && stored() ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setError(null);
    setState("busy");
    try {
      const m = await messagingOrNull();
      if (!m) return setState("unsupported");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const { getToken } = await import("firebase/messaging");
      const token = await getToken(m, { vapidKey: firebaseVapidKey, serviceWorkerRegistration: reg });
      if (!token) throw new Error("No token");
      const res = await savePushTokenAction(token, navigator.userAgent);
      if (!res.ok) throw new Error("Save failed");
      store(token);
      setState("on");
    } catch {
      setError("Couldn't turn on notifications in this browser. Please try again.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("busy");
    try {
      const token = stored();
      if (token) await removePushTokenAction(token);
      const m = await messagingOrNull();
      if (m) {
        const { deleteToken } = await import("firebase/messaging");
        await deleteToken(m).catch(() => undefined);
      }
    } finally {
      store(null);
      setState("off");
    }
  }

  if (state === "loading" || state === "unsupported") {
    return state === "unsupported" ? <p className="text-xs text-muted">Push notifications aren&apos;t supported in this browser. On iPhone, add SideBooster to your Home Screen first.</p> : null;
  }
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div>
        <p className="font-semibold">Push notifications on this device</p>
        <p className="text-muted">
          {state === "on" && "On — you'll get alerts for orders, draws and messages."}
          {state === "off" && "Get an alert when you have a new order, offer or draw result."}
          {state === "busy" && "Working…"}
          {state === "blocked" && "Blocked in your browser settings. Allow notifications for sidebooster.com, then reload."}
        </p>
        {error && <p className="mt-1 text-red-600">{error}</p>}
      </div>
      {state === "off" && <button type="button" className="btn-primary btn-sm" onClick={enable}>Turn on</button>}
      {state === "on" && <button type="button" className="btn-secondary btn-sm" onClick={disable}>Turn off</button>}
    </div>
  );
}
