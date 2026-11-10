# Seller Registration: Field Validation & Location Verification

This document maps each requirement in *"Seller Registration – Field Validation & Location Verification Requirements"* to where it is implemented. Every rule is enforced on the **server**. The browser only shows hints and previews.

## 1. Mobile number

**Implemented in:** `src/lib/au-validation.ts` → `parseAuMobile`

| Requirement | Implementation |
|---|---|
| Country code +61 | The form shows a fixed `+61` prefix. Only Australia is enabled. |
| Accepted formats | `04…`, `4…`, `+614…`, `614…`, `00614…` and `+61 (0)4…`. Spaces, brackets, dots and hyphens are removed first. |
| Specific errors | Separate messages for landlines (02/03/07/08), 13/1300/1800 numbers, wrong length, foreign numbers and a wrong prefix. |
| OTP via SMS | `sendMobileOtp`: 6 digits, 10-minute expiry, maximum 5 attempts, stored hashed. |
| OTP before activation | A seller can't submit for review, or be approved, without `mobileVerifiedAt`. |
| No duplicates | A unique database constraint on `User.mobile`, plus a friendly error message. |

## 2 & 3. ABN and ACN

**Implemented in:** `au-validation.ts` and `src/lib/abr.ts`

**Format checks**
- **ABN:** exactly 11 digits plus the ATO modulus-89 checksum.
- **ACN:** exactly 9 digits plus the ASIC checksum.
- **ABN↔ACN:** a company's ABN must end with its ACN.

**ABR lookup (needs `ABR_GUID`)**
- Shows the registered entity name, ABN status and effective date, entity type, GST status, state and postcode, business names and the linked ACN.
- **VERIFIED:** active, the name matches, the entity type fits the chosen structure, and the ACN matches.
- Otherwise the result is **INACTIVE**, **MISMATCH**, **NOT_FOUND** or **MANUAL_REVIEW**, and the seller is flagged for manual review.
- **Without `ABR_GUID`:** the result is *Not checked*. The admin verifies the business manually using the link to ABN Lookup.

**Seller confirmation:** the seller must tick a box confirming the ABN/ACN belongs to their business (`abnConfirmedAt`).

**Admin actions:**
- **Re-check ABR**;
- **Mark verified** (reason required);
- **Flag mismatch** (reason required; the seller is notified).

## 4. Business registration type

`businessStructure` takes one of these values:

| Value | ABN | ACN |
|---|---|---|
| `INDIVIDUAL` (Individual / Sole Trader) | Optional | Not used |
| `REGISTERED_BUSINESS` | Required | Not used |
| `COMPANY` (Pty Ltd) | Required | Required |
| `PARTNERSHIP` | Required | Not used |
| `TRUST` | Required | Optional |
| `OTHER` | Optional | Optional |

- An ACN is never required for a sole trader.
- `sellerType` (INDIVIDUAL/BUSINESS) is kept so existing records and Seller IDs don't change.

## 5. Seller location verification

**Implemented in:** `seller-location.ts`, `geocode.ts`, `seller-verification.ts`, and the components `LocationFields` and `MapPin`

### Fields
- Country, State/Territory, Suburb/City, Postcode, Street, Unit, and a separate Business address if it's different.
- The country decides which states are listed. Only Australia is enabled; New Zealand is shown as "coming soon".

### Checks
- **Postcode ↔ state:** official ranges, plus real cross-border localities. A mismatch is a hard error.
- **PO Boxes** are rejected.
- **Geocoding:**
  - Uses Google if `GOOGLE_MAPS_API_KEY` is set, otherwise OpenStreetMap Nominatim (throttled to 1 request per second).
  - Checks the suburb, postcode and state together.

### Map pin
- **Find on map:** the seller drags the pin onto the property and ticks "the pin shows my address".
- **Distance check:** the pin is compared with the geocoded point. Limits: 300 m at street level, 5 km at suburb level.
- **Outside the limit:** the location goes to manual review.
- **Pin outside Australia:** the check fails.
- **Storage:** the coordinates are stored (encrypted).

### Statuses
- Not verified
- Pending verification
- Verified
- Verification failed
- Requires manual review

**Becoming Verified:**
- **Automatically:** all the address checks pass **and** a proof-of-address document is accepted.
- **Manually:** an admin marks it verified.

A random pin on its own is never enough.

### Verification methods

| Method | Status |
|---|---|
| 1. Mobile OTP | Required |
| 2. Third-party address service | Through the `GOOGLE_MAPS_API_KEY` geocoder. Addressfinder or Loqate can be added later |
| 3. Proof of address upload | Accepting the document completes verification |
| 4. ABR address cross-check | Postcode comparison, shown to the admin |
| 5. Manual admin decision | Verify, fail or send to review, with a reason |

### Privacy of address data
- The street address, business address and coordinates are **AES-256-GCM encrypted** (`ENCRYPTION_KEY`).
- `SellerProfile.address` now holds only the locality, e.g. "Sydney NSW 2000".

## 6. Date of birth

**Implemented in:** `parseDob`

- Entered as **DD/MM/YYYY**. ISO dates are also accepted.
- Must be a real calendar date and not in the future.
- The year must be within the last 120 years.
- **18+** is required. Under-18 registrations are refused; a guardian process would need legal advice first.

## 7. Terms & Privacy consent

- **Separate mandatory checkboxes** for Terms and Privacy, plus an optional marketing opt-in that is never pre-ticked.
- **`ConsentRecord` stores:**
  - user;
  - type (`TERMS`, `PRIVACY` or `MARKETING`);
  - **version**, which is the CMS page's last-updated timestamp, so it changes whenever the page is edited;
  - date and time;
  - IP address and user agent.
- `User.marketingOptIn` and `marketingOptInAt` are stored separately from the legal consent.

## 8. Admin seller verification dashboard

Page: `/admin/sellers/[id]`.

| Panel | What it shows or does |
|---|---|
| Approval blockers | Lists every mandatory check that is still incomplete |
| Verification checklist | All steps and their current state |
| ABN / ACN | The ABR data and problems found; re-check, verify or flag |
| Location | Decrypted addresses and a map. Purple is the seller's pin, grey is the geocoded point. Also shows the distance, precision, provider, the ABR postcode cross-check, and buttons to verify, fail or send to review |
| Account | Mobile OTP state, including failed attempts; DOB; risk flags; marketing opt-in |
| Documents | Accept or reject each document |
| Consent records | Every consent the seller has given |
| Other | Permissions, payout hold, commission rate and the audit log |

The list page (`/admin/sellers`) shows the **ABN check** and **Location** statuses as columns.

## 9. Activation rules

The workflow is: Registration → Mobile OTP → ABN/ACN → Location → Identity/Age → Terms → Admin review → Approved.

**Seller submit** (`submissionProblems`) requires:
- email and mobile verified;
- DOB, 18 or older;
- location entered with the pin confirmed, and not failed;
- ABN/ACN ownership confirmed;
- Terms and Privacy accepted.

**Admin approval** (`approvalProblems`) requires every checklist item to be done or not applicable, and an active account. This check runs on the server, so it can't be bypassed from the browser or with direct requests.

**Drafts:**
- Until the seller submits, they can correct the business details and the address on `/seller/verification`.
- After submitting, changes go through support.

## 10. Security & privacy

- **Encryption:** sensitive address data is encrypted at rest, and HTTPS (Caddy or nginx) protects it in transit.
- **Documents:** stored in private storage and served only to the seller and admins.
- **Public profiles:** show only the first name, Seller ID, trading name and the "verified" badge. The DOB, mobile, street address, ABN contact details and documents are never shown publicly.
- **Audit:** every check and decision is audited:
  - `SELLER_LOCATION_*`
  - `SELLER_BUSINESS_*`
  - `DOCUMENT_*`
  - `SELLER_*`

## 11. Acceptance criteria

These are covered by `npm run test:flows`, in the "Seller registration validation" group of 10 checks:
- mobile formats and rejections;
- duplicate mobile numbers;
- ABN/ACN digit count and checksum;
- structure rules;
- ABR evaluation;
- postcode↔state;
- DOB rules;
- location rules (a random pin is never accepted);
- the approval gate;
- encryption at rest.

## Configuration

| Variable | Needed? | Purpose |
|---|---|---|
| `ABR_GUID` | Recommended | Live ABN/ACN lookups. Free registration at https://abr.business.gov.au/Tools/WebServices |
| `GOOGLE_MAPS_API_KEY` | Optional | More accurate street-level geocoding. Enable the "Geocoding API" and restrict the key to that API. Without it, OpenStreetMap is used |

The map tiles come from OpenStreetMap, which is free and needs no key. Mention the geocoding provider in the Privacy Policy.
