import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Point these at a persistent volume in production (see Dockerfile / docker-compose.yml).
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 3).toString() === "GIF" },
};
const VIDEO_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "video/mp4": { ext: "mp4", magic: (b) => b.subarray(4, 8).toString() === "ftyp" },
  "video/webm": { ext: "webm", magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

export class UploadError extends Error {}

async function save(file: File, kinds: typeof IMAGE_TYPES, max: number, label: string) {
  const kind = kinds[file.type];
  if (!kind) throw new UploadError(`${file.name}: unsupported ${label} type`);
  if (file.size > max) throw new UploadError(`${file.name}: exceeds ${Math.round(max / 1024 / 1024)}MB`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!kind.magic(buf)) throw new UploadError(`${file.name}: file content does not match its type`);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(16).toString("hex")}.${kind.ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/api/uploads/${name}`;
}

/** Validates (type, size, magic bytes) and stores images. Empty file inputs are ignored. */
export async function saveImages(files: FormDataEntryValue[], limit = 10) {
  const real = files.filter((f): f is File => f instanceof File && f.size > 0);
  if (real.length > limit) throw new UploadError(`Maximum ${limit} images`);
  const urls: string[] = [];
  for (const f of real) urls.push(await save(f, IMAGE_TYPES, MAX_IMAGE, "image"));
  return urls;
}

export async function saveVideo(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;
  return save(file, VIDEO_TYPES, MAX_VIDEO, "video");
}

/** Verification documents: stored outside any public path; only served to the owner and admins. */
export const PRIVATE_DIR = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "private-uploads");
const DOC_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  ...IMAGE_TYPES,
  "application/pdf": { ext: "pdf", magic: (b) => b.subarray(0, 5).toString() === "%PDF-" },
};

export async function savePrivateDocument(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Choose a file to upload.");
  const kind = DOC_TYPES[file.type];
  if (!kind) throw new UploadError("Documents must be PDF, JPG, PNG or WEBP.");
  if (file.size > 10 * 1024 * 1024) throw new UploadError("Documents must be under 10MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!kind.magic(buf)) throw new UploadError("File content does not match its type.");
  await fs.mkdir(PRIVATE_DIR, { recursive: true });
  const key = `${crypto.randomBytes(16).toString("hex")}.${kind.ext}`;
  await fs.writeFile(path.join(PRIVATE_DIR, key), buf);
  return { key, name: file.name.slice(0, 120) };
}

export const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};
