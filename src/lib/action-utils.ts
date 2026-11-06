import "server-only";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

/** Redirect back with a flash message. */
export function back(path: string, msg: { error?: string; ok?: string }): never {
  const sep = path.includes("?") ? "&" : "?";
  const q = msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${encodeURIComponent(msg.ok ?? "Saved")}`;
  redirect(`${path}${sep}${q}`);
}

/** Run an action body; any thrown Error becomes a flash error on `path`. */
export async function attempt(path: string, fn: () => Promise<string | void>): Promise<never> {
  let ok: string | void;
  try {
    ok = await fn();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error(e);
    const code = (e as { code?: string })?.code;
    const msg = code === "P2002" ? "That value is already in use." : e instanceof Error && !code ? e.message : "Something went wrong — please try again.";
    back(path, { error: msg });
  }
  back(path, { ok: ok || "Saved" });
}
