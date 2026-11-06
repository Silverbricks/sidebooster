// Regenerates every SideBooster logo/icon file from one definition.
// Run: node scripts/generate-brand-assets.mjs   (uses `sharp`, installed with Next.js)
// Keep the colours in sync with src/config/brand.ts.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const C = { primary: "#6d28d9", primaryLight: "#8b5cf6", accent: "#f59e0b", ink: "#0f172a", muted: "#64748b" };
const root = path.resolve(import.meta.dirname, "..");

const iconSvg = (s = 64) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.primaryLight}"/><stop offset="1" stop-color="${C.primary}"/></linearGradient>
    <mask id="m"><rect width="64" height="64" fill="#fff"/><circle cx="0" cy="32" r="6" fill="#000"/><circle cx="64" cy="32" r="6" fill="#000"/></mask>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#g)" mask="url(#m)"/>
  <path d="M18 34 L32 20 L46 34" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 46 L32 36 L42 46" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const inner = iconSvg().replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const logoSvg = (dark = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80" viewBox="0 0 360 80">
  <g transform="translate(8 8)">${inner}</g>
  <text x="84" y="46" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="-0.5"><tspan fill="${dark ? "#ffffff" : C.ink}">Side</tspan><tspan fill="${dark ? C.primaryLight : C.primary}">Booster</tspan></text>
  <text x="86" y="66" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="3" fill="${dark ? "#cbd5e1" : C.muted}">SHOP • TICKETS • WIN</text>
</svg>
`;

const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="${C.primary}"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(120 205) scale(3.5)">${inner}</g>
  <text x="380" y="300" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="96" font-weight="800" fill="#fff" letter-spacing="-2">SideBooster</text>
  <text x="384" y="370" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="8" fill="${C.accent}">SHOP • TICKETS • WIN</text>
  <text x="384" y="430" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="26" fill="#e2e8f0">Discover products, special offers and exciting prize draws.</text>
</svg>
`;

/** ICO container holding PNG images (supported by all modern browsers). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, o); header.writeUInt8(size >= 256 ? 0 : size, o + 1);
    header.writeUInt16LE(1, o + 4); header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(buf.length, o + 8); header.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.buf)]);
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
const write = async (rel, data) => { await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true }); await fs.writeFile(path.join(root, rel), data); console.log("wrote", rel); };

await write("assets/logos/sidebooster-icon.svg", iconSvg());
await write("assets/logos/sidebooster-logo.svg", logoSvg());
await write("assets/logos/sidebooster-logo-dark.svg", logoSvg(true));
await write("assets/logos/sidebooster-logo.png", await sharp(Buffer.from(logoSvg())).resize(1080).png().toBuffer());
for (const s of [16, 32, 48, 180, 192, 512]) await write(`assets/icons/icon-${s}.png`, await png(iconSvg(512), s));
await write("assets/banners/social-share-1200x630.svg", bannerSvg);
const share = await sharp(Buffer.from(bannerSvg)).png().toBuffer();
await write("assets/banners/social-share-1200x630.png", share);

// Next.js App Router file conventions (picked up automatically)
await write("src/app/icon.svg", iconSvg());
await write("src/app/apple-icon.png", await png(iconSvg(512), 180));
await write("src/app/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(iconSvg(512), size) })))));
await write("src/app/opengraph-image.png", share);
await write("public/logo.svg", logoSvg());
