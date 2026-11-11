"use server";
import { back } from "@/lib/action-utils";
import { str } from "@/lib/format";
import { confirmEmailChangeLink } from "@/lib/recovery";

export async function confirmEmailChangeAction(fd: FormData) {
  const r = await confirmEmailChangeLink(str(fd.get("token")));
  if (!r.ok) back("/verify-email-change", { error: r.error ?? "This link has expired or was already used." });
  back("/verify-email-change", { ok: "Email address updated. Sign in with your new email." });
}
