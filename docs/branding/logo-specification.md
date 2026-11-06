# SideBooster — Logo specification

## Elements

1. **Icon:** a rounded square (corner radius 25% of its width) filled with a violet gradient (`#8b5cf6` at the top left to `#6d28d9` at the bottom right). It has:
   - a semicircular **ticket notch** cut out of the middle of the left and right edges, so the square reads as a ticket;
   - a white upward **chevron** (the "boost");
   - a smaller **amber chevron** (`#f59e0b`) below it, suggesting upward momentum.
2. **Wordmark:** "Side" in ink (`#0f172a`) and "Booster" in violet (`#6d28d9`), set in Inter Extra Bold.
3. **Tagline (optional):** `SHOP • TICKETS • WIN`, uppercase, Inter Bold, wide tracking, muted grey.

## Files

| File | Use |
|---|---|
| `assets/logos/sidebooster-icon.svg` | Icon only: app icon, avatar, favicon source |
| `assets/logos/sidebooster-logo.svg` / `.png` | Horizontal logo with tagline, on light backgrounds |
| `assets/logos/sidebooster-logo-dark.svg` | Horizontal logo for dark backgrounds |
| `assets/icons/icon-{16,32,48,180,192,512}.png` | Favicons, Apple touch icon, PWA and app-store icons |
| `assets/banners/social-share-1200x630.(svg\|png)` | Social sharing / Open Graph image |
| `src/app/favicon.ico`, `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/opengraph-image.png` | Used automatically by Next.js |
| `public/logo.svg` | Logo served at `/logo.svg` (emails, partners) |

All of these are generated from one definition by:

```bash
node scripts/generate-brand-assets.mjs
```

To change the logo, edit that script **and** `src/components/branding/Favicon.tsx`, the React version used in the header and footer, then re-run the script.

## Usage rules

- **Clear space:** at least half the icon's width on every side.
- **Minimum size:** icon 16 px; full horizontal logo 120 px wide.
- Don't stretch, recolour, rotate, outline or add effects to the logo.
- Don't place the light logo on busy photos. Use the dark-background version or the icon alone.
- On dark backgrounds, use `sidebooster-logo-dark.svg` ("Side" in white).

## Mobile apps (when built)

- Use `icon-512.png` (and `icon-1024` generated from the same SVG) for the store icon.
- The splash screen uses the icon centred on `#6d28d9`.
- The display name is "SideBooster".
