import "server-only";
import { db } from "./db";
import { describeFees, feeSchedule } from "./fees";

/** Fee lines per category id ("" = no category chosen yet) for the listing form's up-front disclosure. */
export async function feeDisclosure(sellerId: string) {
  const cats = await db.category.findMany({ where: { active: true }, select: { id: true } });
  const out: Record<string, ReturnType<typeof describeFees>> = { "": describeFees(await feeSchedule(null, sellerId)) };
  for (const c of cats) out[c.id] = describeFees(await feeSchedule(c.id, sellerId));
  return out;
}
