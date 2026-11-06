import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/payments";

/** POST /api/payments/webhook — the ONLY path that can confirm a payment. */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const result = await handleWebhook(raw, req.headers);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "Invalid signature") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("webhook error", e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // provider will retry
  }
}
