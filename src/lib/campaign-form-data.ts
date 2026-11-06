import type { CurrentUser } from "./auth";
import { db } from "./db";
import { getBool, getList } from "./settings";

export async function campaignFormProps(user: CurrentUser) {
  const [listings, paidEnabled, blockedStates, soldOutAllowed] = await Promise.all([
    db.listing.findMany({ where: { sellerId: user.id, status: "ACTIVE" }, select: { id: true, title: true } }),
    getBool("paid_draws_enabled"),
    getList("paid_entry_blocked_states"),
    getBool("rule_sold_out_trigger_allowed"),
  ]);
  const admin = user.role === "ADMIN";
  return { listings, paidEnabled, blockedStates, soldOutAllowed, canFree: admin || !!user.sellerProfile?.canRunFreeDraws, canPaid: admin || !!user.sellerProfile?.canRunPaidDraws };
}
