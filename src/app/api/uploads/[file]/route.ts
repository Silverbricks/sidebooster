import fs from "node:fs/promises";
import path from "node:path";
import { MIME_BY_EXT, UPLOAD_DIR } from "@/lib/uploads";

/** Serves public listing/campaign media. Private verification documents live elsewhere. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm)$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME_BY_EXT[file.split(".").pop()!],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
