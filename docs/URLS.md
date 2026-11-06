# SideBooster — URL map

Replace `https://your-domain.com.au` with your live domain, or `http://localhost:3000` when developing locally.

## Public (no login needed)

| URL | Page |
|---|---|
| `/` | Home: banners, featured listings, live promotions |
| `/marketplace` | All listings, with search and filters (`?q=`, `?location=`, price, condition…) |
| `/marketplace/[category]` | One category, e.g. `/marketplace/cars-vehicles`, with its category-specific filters |
| `/listing/[id]` | Listing detail: gallery, specifications, enquiry, wishlist, buy |
| `/draws` | Live and upcoming promotions |
| `/draws/[slug]` | Campaign detail and ticket claim/purchase, e.g. `/draws/win-a-dell-xps-15` |
| `/results` | Published draw results |
| `/results/[slug]` | One result, with the verification data (seed, entry-list hash, winning index) |
| `/about`, `/contact` | About Us, Contact form |
| `/terms`, `/privacy`, `/refund-policy`, `/responsible-participation` | Legal pages (**placeholders until written by a lawyer**; edit in `/admin/cms`) |
| `/register` | Buyer registration |
| `/register/seller` | Seller registration (individual or business) |
| `/login` | Log in |
| `/verify` | Mobile code (OTP) verification |
| `/verify-email` | Email verification link landing page |
| `/sitemap.xml`, `/robots.txt` | SEO |

## Purchase flow (login needed)

| URL | Page |
|---|---|
| `/checkout/[listingId]` | Checkout: quantity, delivery, coupon |
| `/pay/[paymentId]` | Simulated test gateway (**staging only**; disabled on the live site) |
| `/pay/[paymentId]/done` | Payment result |

## Buyer dashboard — `/account`

| URL | Page |
|---|---|
| `/account` | Overview, showing your Buyer ID |
| `/account/profile` | Profile and verification status |
| `/account/orders`, `/account/orders/[id]` | Orders: confirm receipt, cancel unpaid orders, request a refund |
| `/account/payments` | Payment history (product and ticket payments shown separately) |
| `/account/tickets`, `/account/tickets/[id]` | My tickets and ticket numbers |
| `/account/draws` | Promotions I've entered and their results |
| `/account/enquiries` | My enquiries and seller replies |
| `/account/sales` | Confirm or dispute high-value sales a seller reported |
| `/account/wishlist` | Saved listings |
| `/account/notifications` | Notifications |

## Seller dashboard — `/seller`

| URL | Page |
|---|---|
| `/seller` | Overview, showing your Seller ID and status checklist |
| `/seller/verification` | Upload verification documents |
| `/seller/payouts` | Payout account setup (Stripe Connect) and payouts |
| `/seller/listings`, `/seller/listings/new`, `/seller/listings/[id]` | Listings: 3-step create/edit form |
| `/seller/orders` | Orders to fulfil |
| `/seller/enquiries` | Buyer enquiries |
| `/seller/sales` | Sales, and reporting an offline (car/property) sale |
| `/seller/commissions` | Commission, invoices and monthly statement |
| `/seller/offers` | Discounts and coupons (need admin approval) |
| `/seller/campaigns`, `/seller/campaigns/new`, `/seller/campaigns/[id]`, `/seller/campaigns/[id]/edit` | Promotions: request a campaign, ask for a date extension, see stats |
| `/seller/profile` | Seller profile |

## Admin console — `/admin` (Super Admin only)

| URL | Page |
|---|---|
| `/admin` | Overview and to-do counts |
| `/admin/approvals` | Everything waiting for approval, in one queue |
| `/admin/users` | All users: search by ID, email, name, mobile |
| `/admin/sellers`, `/admin/sellers/[id]` | Seller review: documents, approve, reject, suspend, trusted-seller, draw permissions |
| `/admin/categories` | Categories and their dynamic fields |
| `/admin/listings` | Listing approval and moderation |
| `/admin/offers` | Approve or reject offers |
| `/admin/orders` | All orders |
| `/admin/sales` | Approve or reject sales (offline sales included) |
| `/admin/commissions` | Approve, adjust, waive or reverse commission |
| `/admin/commissions/invoices` | Commission invoices: mark as paid |
| `/admin/commissions/rules` | Commission rates by category or by seller |
| `/admin/payouts` | Seller payouts |
| `/admin/payments` | All payments (product and ticket ledgers) |
| `/admin/refunds` | Approve or reject refunds |
| `/admin/reports` | Finance reports and CSV exports |
| `/admin/campaigns` | Campaign approval and date-extension requests |
| `/admin/campaigns/[id]` | **Draw console**: lock → run draw → verify → publish → prize delivered |
| `/admin/draws` | All draws and results |
| `/admin/cms` | Pages and home-page banners |
| `/admin/settings` | **Approval engine and platform rules** (paid draws, blocked states, auto-approvals, expiry times…) |
| `/admin/messages` | Log of every email/SMS sent, including OTP codes before a provider is connected |
| `/admin/audit` | Full audit log |

## API endpoints

| URL | Who calls it | Purpose |
|---|---|---|
| `GET /api/health` | Host / uptime monitor | Returns `{"ok":true}` when the app and database are up |
| `POST /api/payments/webhook` | Stripe | Payment and account events (signature-verified) |
| `GET /api/cron/tick` | Scheduler, every 5 min | Closes due ticket sales, expires checkouts and listings, overdue invoices, reminders. Needs the header `Authorization: Bearer <CRON_SECRET>` |
| `GET /api/uploads/[file]` | Browser | Public listing and campaign images |
| `GET /api/documents/[id]` | Owner or admin only | Private seller verification documents |
| `GET /api/seller/statement` | Seller | Monthly statement (CSV) |
| `GET /api/admin/export/[kind]` | Admin | CSV export: `payments`, `commissions`, `tickets`, `audit` |
