# Login, Password Recovery & Account Access: Implementation Status

This maps the *"SRS – Authentication, Login & Account Recovery System"* to the code. The existing authentication was extended, not rebuilt:
- the same `User` table, password hashes and session cookie are used;
- existing passwords and sessions keep working;
- no duplicate accounts are created.

Status labels:
- ✅ built and tested
- 🟡 partly built, with the gap stated
- ⏸ deferred, with the reason stated

## §1 and §6: Login page ✅

The login page is `/login`.

| Requirement | Implementation |
|---|---|
| Email or username | One "Email or username" field, matched case-insensitively. Account IDs (BUY-…) work for recovery only |
| Show/hide password | `PasswordInput`:<ul><li>an eye button that toggles `type`, so the value is never cleared</li><li>keyboard-accessible, with `aria-pressed`</li><li>used on login, reset, change-password and the security page</li></ul> |
| Remember me | **Ticked:** 30-day persistent cookie.<br>**Unticked:** browser-session cookie with a 12-hour server limit |
| Links | Forgot password, forgot username, forgot registered email, "Sign in with an email code", Register, Back to sign in |
| All methods use one account system | Password, email code, username and email all create the same `Session`, so the same roles and permissions apply |

**Usernames:**
- Optional. Users set one in **Account → Security & sign-in**.
- 3–30 characters; must start with a letter.
- Reserved names and anything that looks like an account ID are rejected.

## §2: Forgot password ✅

`/forgot-password` → enter email or username → 6-digit code emailed → `/reset-password?token=…` (single-use, 20 minutes) → new password + confirm.

After a reset:
- the password is re-hashed;
- **all sessions are revoked**, and other reset codes and links stop working;
- the lockout is cleared;
- a "password changed" email is sent;
- the user is sent back to the login page.

**Security:**
- The old password is never emailed and never shown. Admins can't see it.
- The response is the same whether or not the account exists.
- The reset page sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

## §3: Forgot username ✅

`/forgot-username` → enter email → code to that email → the page shows the username and account ID for 10 minutes. If no username is set, it says to sign in with the email address. Email is unique, so one email always means one account.

## §4: Forgot registered email ✅

**Option A: mobile** (`/forgot-email`)
1. The user enters their mobile, and an SMS code is sent. This only works for *verified* mobiles.
2. The page shows the **masked email** (`d******@gmail.com`).
3. If they've lost that inbox, they enter a new email and confirm it with a code.
4. A **RecoveryRequest** is created for **admin approval**.

**Option B: identity review** (tab "I've lost email & mobile")
1. The user gives their username or account ID, full legal name, a new email (confirmed with a code) and evidence.
2. A RecoveryRequest is created for admin review.

**Safeguards for both options:**
- The current email, and for Option B the current mobile, are warned straight away, so the real owner can stop a hijack.
- Nothing changes on username, date of birth or other public details alone. The admin must record what evidence was checked.
- When approved:
  - the email is changed;
  - **every session is revoked**;
  - the old address, new address and mobile are notified.
- Rejecting also requires a note, and the requester is told.

## §5: Passwordless email-code login ✅

`/login/code`

| Requirement | Implementation |
|---|---|
| 6-digit code, 10-minute expiry | `crypto.randomInt`; `CODE_TTL_MS` |
| One-time use | Atomic `consumedAt` claim, so two simultaneous submissions can't both succeed |
| Resend, 60-second cooldown | Countdown button. The server enforces the cooldown and allows at most 5 sends per request |
| Max 5 wrong attempts per code | Then "request a new code" |
| Previous code invalidated | Issuing or resending expires the earlier code |
| Rate limits by account, IP and device | Per IP and per identifier on every send/verify form. The device cookie spots new devices |
| Codes never logged | **Stored as HMAC hashes only.** With an email/SMS provider connected, codes and link tokens are **redacted** in the outbox log and never printed to the console. In outbox-only mode (no provider) the outbox is the delivery channel, so codes stay visible there to admins only |
| Notify on successful login | An email after every email-code sign-in, and after any sign-in from a new device |

## §7: Admin account recovery ✅

**Admin → Account recovery** (`/admin/recovery`)

**Search** by email, username, mobile, account ID or name.

**Each account shows:**
- status, lock state and failed attempts;
- registered email and username;
- masked mobile;
- password: "never visible".

**Actions:**
- **Send reset link:** single-use, 30 minutes, emailed to the registered address. The admin never sets the password.
- **Unlock** (reason required).
- **Sign out everywhere** (reason required).
- **Change username** (reason required; the user is emailed).
- **Change email:** a confirmation link goes to the new address and the change applies only when it is confirmed there. The old address is warned.

**History and queue:**
- Login history (25 most recent) and recovery/account-change history.
- A queue of pending lost-email requests with approve/reject. The sidebar badge shows the count.

**Immutable audit log:** a database trigger blocks `UPDATE` and `DELETE` on `AuditLog` (migration `20261113000000_auth_recovery`), and a test checks this.

## §8: Security controls

| Control | Status |
|---|---|
| Password hashing | 🟡 **bcrypt, cost 12.** It's on the SRS's "approved secure hashing" list, so existing passwords keep working. Argon2id would need a native module in the Docker image; we can add it later with transparent re-hashing at login |
| Secure random codes | ✅ `crypto.randomInt` / `randomBytes` |
| Code expiry 10 minutes, 5 attempts, 60-second resend | ✅ |
| Single-use reset token, 15–30 minutes | ✅ 20 minutes from the code flow, 30 minutes from an admin link |
| Progressive lockout | ✅ 5 failures lock for 1 minute, then 2, 4, 8… up to 60 minutes. Each lock is per account, plus IP and identifier limits. A correct email code also clears it |
| HTTPS, HSTS | ✅ Already in place (nginx/Cloudflare + `Strict-Transport-Security`) |
| Cookies | ✅ `HttpOnly`, `SameSite=Lax`, and `Secure` in production |
| Audit logs | ✅ Login, logout, recovery and account changes. Login attempts are also kept in `LoginEvent` |
| Alerts on password/email changes | ✅ |
| No account enumeration | ✅ The same response is given for unknown accounts, using decoy challenge IDs and a dummy bcrypt comparison to equalise timing |

## §11: Additional features

| Feature | Status |
|---|---|
| Login history with device and IP | ✅ Account → Security & sign-in. Approximate location (geo-IP) isn't shown, because it needs a geo-IP database or service |
| Log out of all devices | ✅ Plus sign out of a single device |
| Suspicious-login alert | ✅ Email on sign-in from a new device |
| Email change confirms old **and** new address | ✅ Self-service needs the current password plus a code sent to each address |
| Locked-account recovery | ✅ The email code or password reset clears the lock; an admin can also unlock |
| Two-factor authentication | ⏸ Optional in the SRS. A natural next step is a TOTP authenticator app for admins and sellers |
| Passkeys | ⏸ "Where feasible". Can follow 2FA (WebAuthn) |
| Accessibility | ✅ Labelled fields, `autocomplete="one-time-code"`, keyboard-operable toggles, live countdown |

## §10: API endpoints

There is no mobile app yet. The website uses Next.js **server actions**, and each one does the job of the listed endpoint:

| SRS endpoint | Server action |
|---|---|
| `/auth/login` | `loginAction` |
| `/auth/logout` | `logoutAction` |
| `/auth/forgot-password` | `forgotPasswordAction` |
| `/auth/verify-reset-otp` | `verifyResetCodeAction` |
| `/auth/reset-password` | `resetPasswordAction` |
| `/auth/forgot-username` | `forgotUsernameAction` |
| `/auth/recover-email` | `recoverByMobileAction` / `requestNewEmailAction` |
| `/auth/change-email` | `startEmailChangeAction` / `confirmEmailChangeAction` |
| `/auth/send-login-otp` | `sendLoginCodeAction` |
| `/auth/verify-login-otp` | `verifyLoginCodeAction` |
| `/auth/resend-otp` | `resendCodeAction` |
| `/auth/sessions` | security page |
| `/auth/revoke-sessions` | `revokeOtherSessionsAction` |

When a mobile app is built, expose these as JSON endpoints using the same library functions in `src/lib/auth-codes.ts` and `src/lib/recovery.ts`, with refresh tokens kept in the phone's secure storage.

**Multi-platform note:** SideBooster has its own user database. Its codes and sessions only work on SideBooster and are never accepted by other platforms.

## Email and SMS delivery (required for real users)

| Channel | Settings | Notes |
|---|---|---|
| **Email** | `RESEND_API_KEY`, `EMAIL_FROM` | Verify the sidebooster.com domain in Resend first |
| **SMS** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) | |

Admin → Email / SMS outbox shows whether each channel is connected. Until it is, codes only appear in that outbox.

## Acceptance tests (`npm run test:flows`)

These are covered by the automated tests:
- correct code works once;
- wrong-purpose code rejected;
- a new code invalidates the old one;
- 5-attempt limit;
- expired code rejected;
- 60-second resend cooldown, and a resend replaces the code;
- codes stored only as hashes;
- decoy challenges never verify;
- reset links are single-use and expire;
- the lockout schedule;
- username validation, uniqueness and case-insensitive login lookup;
- masking and log redaction;
- admin approval of a lost-email request changes the email and revokes sessions, and needs a note;
- the audit log can't be updated or deleted.

These still need a manual check on desktop and phone:
- the eye toggle;
- each multi-step page;
- the email you receive.

**Privacy Policy:** add login history (IP address and device) and the `sb_device` cookie.
