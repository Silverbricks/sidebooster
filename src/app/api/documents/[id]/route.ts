import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MIME_BY_EXT, PRIVATE_DIR } from "@/lib/uploads";
import { audit } from "@/lib/audit";

/** Private verification documents — visible only to the seller who uploaded them and admins. Access is logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const doc = await db.sellerDocument.findUnique({ where: { id }, include: { seller: true } });
  if (!doc || (user.role !== "ADMIN" && doc.seller.userId !== user.id)) return new Response("Not found", { status: 404 });
  const buf = await fs.readFile(path.join(PRIVATE_DIR, path.basename(doc.fileKey))).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });
  await audit(user.id, "DOCUMENT_VIEWED", "SellerDocument", doc.id);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME_BY_EXT[doc.fileKey.split(".").pop()!] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
