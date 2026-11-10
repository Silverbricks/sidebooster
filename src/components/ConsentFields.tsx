import Link from "next/link";

/** Separate mandatory Terms and Privacy consent + optional marketing opt-in (never pre-ticked). */
export function ConsentFields() {
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="acceptTerms" className="mt-1" required />
        <span>I accept the <Link href="/terms" className="link" target="_blank">Terms &amp; Conditions</Link>.<span className="text-red-600"> *</span></span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="acceptPrivacy" className="mt-1" required />
        <span>I have read and accept the <Link href="/privacy" className="link" target="_blank">Privacy Policy</Link>.<span className="text-red-600"> *</span></span>
      </label>
      <label className="flex items-start gap-2 text-muted">
        <input type="checkbox" name="marketingOptIn" className="mt-1" />
        <span>Optional: send me news, offers and prize-draw announcements. You can unsubscribe at any time.</span>
      </label>
    </div>
  );
}
