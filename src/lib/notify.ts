import { db, type Tx } from "./db";
import { brand } from "@/config/brand";
import { schedulePush } from "./push";

/**
 * In-app notification + email. Messages are written to MessageLog (viewable at /admin/messages)
 * and the console. Plug a real email/SMS provider into `deliver` for production.
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

export async function sendEmail(to: string, subject: string, body: string, tx: Tx = db) {
  body = `${body}

— The ${brand.name} team · ${brand.tagline}
${brand.domain} · ${brand.supportEmail}`;
  await tx.messageLog.create({ data: { channel: "EMAIL", to, subject, body } });
  deliver("EMAIL", to, subject, body);
}

export async function sendSms(to: string, body: string, tx: Tx = db) {
  await tx.messageLog.create({ data: { channel: "SMS", to, subject: "SMS", body } });
  deliver("SMS", to, "SMS", body);
}

function deliver(channel: string, to: string, subject: string, body: string) {
  console.log(`[${channel.toLowerCase()}] to=${to} subject="${subject}"\n${body}\n`);
}

export function appUrl(path: string) {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}
