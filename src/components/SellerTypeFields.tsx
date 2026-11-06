"use client";
import { useState } from "react";

export function SellerTypeFields() {
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Seller type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["INDIVIDUAL", "BUSINESS"] as const).map((t) => (
            <label key={t} className={`card flex cursor-pointer items-start gap-3 p-4 ${type === t ? "ring-2 ring-brand-500" : ""}`}>
              <input type="radio" name="sellerType" value={t} checked={type === t} onChange={() => setType(t)} className="mt-1" />
              <span>
                <span className="block font-semibold">{t === "INDIVIDUAL" ? "Individual seller" : "Business seller"}</span>
                <span className="text-xs text-muted">{t === "INDIVIDUAL" ? "Seller ID: SEL-xxxxxx. Requires identity & payout verification." : "Seller ID: BUS-xxxxxx. Requires ABN/ACN, business & payout verification."}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="legalName">{type === "BUSINESS" ? "Legal business name" : "Full legal name"} <span className="text-red-600">*</span></label>
          <input id="legalName" name="legalName" className="input" required />
        </div>
        {type === "BUSINESS" && (
          <>
            <div><label className="label" htmlFor="businessName">Trading name</label><input id="businessName" name="businessName" className="input" /></div>
            <div><label className="label" htmlFor="authorisedRep">Authorised representative <span className="text-red-600">*</span></label><input id="authorisedRep" name="authorisedRep" className="input" required /></div>
            <div><label className="label" htmlFor="abn">ABN</label><input id="abn" name="abn" className="input" inputMode="numeric" placeholder="11 digits" /></div>
            <div><label className="label" htmlFor="acn">ACN</label><input id="acn" name="acn" className="input" inputMode="numeric" placeholder="9 digits" /><p className="hint">ABN or ACN required.</p></div>
          </>
        )}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">{type === "BUSINESS" ? "Business address" : "Residential address"} <span className="text-red-600">*</span></label>
          <input id="address" name="address" className="input" required autoComplete="street-address" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bio">About you / your business</label>
          <textarea id="bio" name="bio" className="input" rows={3} />
        </div>
      </div>
    </div>
  );
}
