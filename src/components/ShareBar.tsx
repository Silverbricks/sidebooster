import QRCode from "qrcode";
import { SHARE_TARGETS, type ShareTarget } from "@/lib/social";
import { withUtm } from "@/lib/urls";
import { CopyShare } from "./CopyShare";

const SHOWN: ShareTarget[] = ["facebook", "whatsapp", "x", "linkedin", "pinterest", "telegram", "email"];

/**
 * Share controls for public product and store pages. Each button goes through /go/share (records a SHARE event,
 * then redirects to the platform's own share page) — nothing is posted automatically.
 */
export async function ShareBar({ url, title, kind, id }: { url: string; title: string; kind: "listing" | "store"; id: string }) {
  const qrTarget = withUtm(url, "qr", "offline", "qr-code");
  const qrSvg = await QRCode.toString(qrTarget, { type: "svg", margin: 1, width: 168, color: { dark: "#0f172a", light: "#ffffff" } });
  const qrPng = await QRCode.toDataURL(qrTarget, { margin: 2, width: 600 });
  const go = (to: ShareTarget) => `/go/share?to=${to}&${kind === "listing" ? "l" : "s"}=${encodeURIComponent(id)}`;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Share</div>
      <div className="flex flex-wrap gap-2">
        {SHOWN.map((t) => (
          <a key={t} href={go(t)} target="_blank" rel="noopener nofollow" className="btn-secondary btn-sm" aria-label={`Share on ${SHARE_TARGETS[t].label}`}>
            {SHARE_TARGETS[t].label}
          </a>
        ))}
        <CopyShare url={withUtm(url, "copy-link")} title={title} text={title} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-700">QR code</summary>
        <div className="mt-2 flex items-center gap-3">
          <div className="rounded-lg border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="QR code linking to this page" role="img" />
          <div className="space-y-1 text-xs text-muted">
            <p>Print it on flyers, packaging or in-store signage. Scans are counted as &ldquo;QR&rdquo; visits.</p>
            <a href={qrPng} download={`${title.slice(0, 40).replace(/[^\w-]+/g, "-")}-qr.png`} className="link">⬇ Download PNG</a>
          </div>
        </div>
      </details>
    </div>
  );
}
