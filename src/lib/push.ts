// Browser push notifications via Firebase Cloud Messaging (server side).
// Enabled only when FIREBASE_SERVICE_ACCOUNT is set (the service-account JSON, raw or base64).
// Without it, notifications still appear in-app and in the email log — push is simply skipped.
import { db } from "./db";

const appUrl = (path: string) => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;

type Messaging = import("firebase-admin/messaging").Messaging;
let messagingPromise: Promise<Messaging | null> | null = null;

export function pushEnabled() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT?.trim());
}

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT!.trim();
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

function messaging(): Promise<Messaging | null> {
  if (!pushEnabled()) return Promise.resolve(null);
  messagingPromise ??= (async () => {
    const { cert, getApps, initializeApp } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const app = getApps()[0] ?? initializeApp({ credential: cert(readServiceAccount()) });
    return getMessaging(app);
  })().catch((e) => {
    console.error("[push] Firebase Admin init failed — check FIREBASE_SERVICE_ACCOUNT:", e instanceof Error ? e.message : e);
    return null;
  });
  return messagingPromise;
}

const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

/**
 * Push an in-app notification to all of the user's browsers.
 * notify() often runs inside a database transaction, so the send is deferred and only happens once the
 * notification row is visible (committed). A rolled-back transaction therefore never sends a push.
 */
export function schedulePush(notificationId: string) {
  if (!pushEnabled()) return;
  const attempt = async (tries: number) => {
    try {
      const n = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true, title: true, body: true, link: true } });
      if (!n) {
        if (tries < 3) setTimeout(() => void attempt(tries + 1), 5000);
        return;
      }
      await sendPush(n.userId, { title: n.title, body: n.body, link: n.link ?? "/account/notifications" });
    } catch (e) {
      console.error("[push] send failed:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(() => void attempt(1), 1000);
}

export async function sendPush(userId: string, msg: { title: string; body: string; link: string }) {
  const m = await messaging();
  if (!m) return { sent: 0 };
  const tokens = (await db.pushToken.findMany({ where: { userId }, select: { token: true } })).map((t) => t.token);
  if (!tokens.length) return { sent: 0 };
  const url = appUrl(msg.link);
  const res = await m.sendEachForMulticast({
    tokens,
    // data-only message: public/firebase-messaging-sw.js displays it
    data: { title: msg.title.slice(0, 120), body: msg.body.slice(0, 400), url },
    webpush: { headers: { Urgency: "normal", TTL: String(60 * 60 * 24) }, fcmOptions: { link: url } },
  });
  const dead = res.responses.flatMap((r, i) => (!r.success && r.error && DEAD_TOKEN.has(r.error.code) ? [tokens[i]] : []));
  if (dead.length) await db.pushToken.deleteMany({ where: { token: { in: dead } } });
  return { sent: res.successCount };
}
