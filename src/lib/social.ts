// Seller social profile links + share destinations. Sharing uses each platform's public share URL —
// no posting on the seller's behalf and never any social-media passwords.

export const SOCIAL_PLATFORMS = {
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  instagram: { label: "Instagram", hosts: ["instagram.com"] },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"] },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"] },
  pinterest: { label: "Pinterest", hosts: ["pinterest.com", "pinterest.com.au", "pin.it"] },
  x: { label: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
  whatsapp: { label: "WhatsApp Business", hosts: ["wa.me", "whatsapp.com", "api.whatsapp.com"] },
} as const;
export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;
export type SocialLinks = Partial<Record<SocialPlatform, { url: string; show: boolean }>>;

/** Validates a profile URL for the platform: https only, the platform's own domain, no credentials/scripts. */
export function socialUrlProblem(platform: SocialPlatform, raw: string): { url: string } | { error: string } {
  let v = raw.trim();
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { error: `${SOCIAL_PLATFORMS[platform].label}: that isn't a valid link.` };
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|business|web)\./, "");
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: `${SOCIAL_PLATFORMS[platform].label}: only web links are allowed.` };
  if (u.username || u.password) return { error: `${SOCIAL_PLATFORMS[platform].label}: links can't contain login details.` };
  if (!SOCIAL_PLATFORMS[platform].hosts.some((h) => host === h || host.endsWith(`.${h}`))) return { error: `${SOCIAL_PLATFORMS[platform].label}: the link must be on ${SOCIAL_PLATFORMS[platform].hosts[0]}.` };
  if (u.pathname === "/" && !u.search) return { error: `${SOCIAL_PLATFORMS[platform].label}: link to your profile or page, not the home page.` };
  u.protocol = "https:";
  u.hash = "";
  return { url: u.toString().slice(0, 300) };
}

export function readSocialLinks(fd: FormData): { links: SocialLinks; error: string | null } {
  const links: SocialLinks = {};
  for (const p of Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[]) {
    const raw = String(fd.get(`social_${p}`) ?? "").trim();
    if (!raw) continue;
    const r = socialUrlProblem(p, raw);
    if ("error" in r) return { links, error: r.error };
    links[p] = { url: r.url, show: fd.get(`social_${p}_show`) === "on" };
  }
  return { links, error: null };
}

export function visibleSocialLinks(v: unknown): { platform: SocialPlatform; label: string; url: string }[] {
  const links = (v ?? {}) as SocialLinks;
  return (Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[]).flatMap((p) => (links[p]?.show && links[p]?.url ? [{ platform: p, label: SOCIAL_PLATFORMS[p].label, url: links[p]!.url }] : []));
}

/** Share destinations (public share URLs). `url` should already carry UTM parameters for that destination. */
export const SHARE_TARGETS = {
  facebook: { label: "Facebook", href: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  whatsapp: { label: "WhatsApp", href: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  x: { label: "X", href: (url: string, text: string) => `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  linkedin: { label: "LinkedIn", href: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  pinterest: { label: "Pinterest", href: (url: string, text: string, image?: string) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}${image ? `&media=${encodeURIComponent(image)}` : ""}` },
  telegram: { label: "Telegram", href: (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  email: { label: "Email", href: (url: string, text: string) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}` },
} as const;
export type ShareTarget = keyof typeof SHARE_TARGETS;
