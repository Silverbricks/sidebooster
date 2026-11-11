"use server";
// Admin → Account recovery (SRS §7). Every action is permission-checked and audited (AuditLog is append-only).
import { requireAdmin } from "@/lib/auth";
import { attempt } from "@/lib/action-utils";
import { str } from "@/lib/format";
import { adminRevokeSessions, adminSendResetLink, adminStartEmailChange, adminUnlock, approveRecovery, rejectRecovery, RecoveryError, setUsername } from "@/lib/recovery";

const back = (fd: FormData) => str(fd.get("back")).startsWith("/admin/recovery") ? str(fd.get("back")) : "/admin/recovery";

async function run(fd: FormData, fn: () => Promise<string>) {
  await attempt(back(fd), async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RecoveryError) throw new Error(e.message);
      throw e;
    }
  });
}

export async function adminRecoveryAction(fd: FormData) {
  const admin = await requireAdmin();
  const userId = str(fd.get("userId"));
  const reason = str(fd.get("reason"));
  const op = str(fd.get("op"));
  await run(fd, async () => {
    switch (op) {
      case "reset-link":
        await adminSendResetLink(userId, admin.id);
        return "Password reset link sent to the registered email (expires in 30 minutes).";
      case "unlock":
        await adminUnlock(userId, admin.id, reason);
        return "Account unlocked.";
      case "revoke":
        return `Signed out ${await adminRevokeSessions(userId, admin.id, reason)} session(s).`;
      case "username":
        if (!reason) throw new RecoveryError("A reason is required.");
        await setUsername(userId, str(fd.get("username")), admin.id, reason);
        return "Username updated. The user was notified.";
      case "email":
        await adminStartEmailChange(userId, str(fd.get("newEmail")), admin.id, reason);
        return "Confirmation link sent to the new address. The change applies once it's opened.";
      default:
        throw new RecoveryError("Unknown action.");
    }
  });
}

export async function decideRecoveryAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("requestId"));
  const note = str(fd.get("note"));
  await run(fd, async () => {
    if (str(fd.get("decision")) === "APPROVE") {
      await approveRecovery(id, admin.id, note, str(fd.get("accountId")) || undefined);
      return "Approved. The email was changed, sessions revoked and the user notified.";
    }
    await rejectRecovery(id, admin.id, note);
    return "Rejected. The requester was notified.";
  });
}
