import { db, type Tx } from "./db";
import { brand } from "@/config/brand";
import { schedulePush } from "./push";

/**
 * In-app notification + email/SMS.
 *
 * Every message is recorded in MessageLog (/admin/messages).
 * - With a provider configured (RESEND_API_KEY for email; TWILIO_* for SMS) the message is really sent and
 *   one-time codes / secret links are REDACTED in the log and never printed to the console.
 * - Without a provider ("outbox mode", for local/staging) the full message stays in MessageLog so an admin
 *   can relay it — that is the only place it is visible, and it is never printed to the console either.
 */
export async function notify(
  userId: string,
  n: { type: string; title: string; body: string; link?: string; email?: boolean },
  tx: Tx = db,
) {
  const created = await tx.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, link: n.link } });
  schedulePush(created.id);
  if (n.email !== false) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) await sendEmail(user.email, n.title, n.body + (n.link ? `\n\n${appUrl(n.link)}` : ""), tx);
  }
}

type SendOpts = { sensitive?: boolean };

export function deliveryStatus() {
  return {
    email: process.env.RESEND_API_KEY ? "resend" : null,
    sms: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID) ? "twilio" : null,
  };
}

/** Removes one-time codes and secret link tokens from text that is going to be stored or logged. */
export function redactSecrets(text: string) {
  return text.replace(/\b\d{6}\b/g, "••••••").replace(/([?&](?:token|code)=)[^\s&]+/gi, "$1[redacted]");
}

export async function sendEmail(to: string, subject: string, body: string, tx: Tx = db, opts: SendOpts = {}) {
  body = `${body}

— The ${brand.name} team · ${brand.tagline}
${brand.domain} · ${brand.supportEmail}`;
  const live = !!deliveryStatus().email;
  const stored = live && opts.sensitive ? redactSecrets(body) : body;
  const row = await tx.messageLog.create({ data: { channel: "EMAIL", to, subject, body: stored, status: live ? "QUEUED" : "OUTBOX" } });
  if (live) void deliverEmail(row.id, to, subject, body);
  else console.log(`[email:outbox] to=${to} subject="${subject}"${opts.sensitive ? " (contains a code — see /admin/messages)" : `\n${body}\n`}`);
}

export async function sendSms(to: string, body: string, tx: Tx = db, opts: SendOpts = {}) {
  const live = !!deliveryStatus().sms;
  const stored = live && opts.sensitive ? redactSecrets(body) : body;
  const row = await tx.messageLog.create({ data: { channel: "SMS", to, subject: "SMS", body: stored, status: live ? "QUEUED" : "OUTBOX" } });
  if (live) void deliverSms(row.id, to, body);
  else console.log(`[sms:outbox] to=${to}${opts.sensitive ? " (contains a code — see /admin/messages)" : ` ${body}`}`);
}

async function mark(id: string, status: string) {
  // The log row may still be inside an uncommitted transaction; updateMany never throws for 0 rows.
  await db.messageLog.updateMany({ where: { id }, data: { status } }).catch(() => {});
}

async function deliverEmail(id: string, to: string, subject: string, text: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || `${brand.name} <no-reply@${brand.domain}>`, to: [to], subject, text, reply_to: brand.supportEmail }),
    });
    await mark(id, res.ok ? "SENT" : `FAILED ${res.status}`);
    if (!res.ok) console.error(`[email] delivery failed (${res.status}) subject="${subject}"`);
  } catch (e) {
    await mark(id, "FAILED");
    console.error("[email] delivery error", (e as Error).message);
  }
}

async function deliverSms(id: string, to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM!);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    await mark(id, res.ok ? "SENT" : `FAILED ${res.status}`);
    if (!res.ok) console.error(`[sms] delivery failed (${res.status})`);
  } catch (e) {
    await mark(id, "FAILED");
    console.error("[sms] delivery error", (e as Error).message);
  }
}

export function appUrl(path: string) {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}
