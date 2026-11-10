"use client";
// Business registration type + conditional ABN/ACN fields with a live ABR check.
// The server re-validates everything (digit count, checksum, structure rules) on submit.

import { useState, useTransition } from "react";
import { BUSINESS_STRUCTURES, abnProblem, acnProblem, type BusinessStructure } from "@/lib/au-validation";
import { previewBusinessAction, type BusinessPreview } from "@/app/actions/verification";

export type SellerBusinessDefaults = {
  businessStructure?: BusinessStructure; legalName?: string; businessName?: string | null; authorisedRep?: string | null;
  abn?: string | null; acn?: string | null; abnConfirmed?: boolean; bio?: string | null;
};

const req = <span className="text-red-600"> *</span>;

export function SellerTypeFields({ defaults = {}, showBio = true }: { defaults?: SellerBusinessDefaults; showBio?: boolean }) {
  const [structure, setStructure] = useState<BusinessStructure>(defaults.businessStructure ?? "INDIVIDUAL");
  const [legalName, setLegalName] = useState(defaults.legalName ?? "");
  const [businessName, setBusinessName] = useState(defaults.businessName ?? "");
  const [abn, setAbn] = useState(defaults.abn ?? "");
  const [acn, setAcn] = useState(defaults.acn ?? "");
  const [result, setResult] = useState<BusinessPreview | null>(null);
  const [pending, start] = useTransition();
  const rule = BUSINESS_STRUCTURES[structure];
  const isBusiness = rule.business;
  const abnErr = abn ? abnProblem(abn) : null;
  const acnErr = acn ? acnProblem(acn) : null;
  const showAcn = rule.acn !== "none";

  const check = () =>
    start(async () => {
      setResult(await previewBusinessAction({ structure, legalName, businessName, abn, acn: showAcn ? acn : "" }));
    });

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="businessStructure">Business registration type{req}</label>
        <select
          id="businessStructure" name="businessStructure" className="input" value={structure}
          onChange={(e) => { setStructure(e.target.value as BusinessStructure); setResult(null); if (BUSINESS_STRUCTURES[e.target.value as BusinessStructure].acn === "none") setAcn(""); }}
        >
          {Object.entries(BUSINESS_STRUCTURES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <p className="hint">
          {structure === "INDIVIDUAL" ? "Seller ID SEL-xxxxxx. ABN only if you trade as a sole trader." : `Seller ID BUS-xxxxxx. ABN ${rule.abn}${rule.acn !== "none" ? `, ACN ${rule.acn}` : ""}.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="legalName">{isBusiness ? "Legal entity name (as on the ABR)" : "Full legal name"}{req}</label>
          <input id="legalName" name="legalName" className="input" required value={legalName} onChange={(e) => { setLegalName(e.target.value); setResult(null); }} autoComplete={isBusiness ? "organization" : "name"} />
        </div>
        {isBusiness && (
          <>
            <div><label className="label" htmlFor="businessName">Trading name</label><input id="businessName" name="businessName" className="input" value={businessName ?? ""} onChange={(e) => setBusinessName(e.target.value)} /></div>
            <div><label className="label" htmlFor="authorisedRep">Authorised representative{req}</label><input id="authorisedRep" name="authorisedRep" className="input" required defaultValue={defaults.authorisedRep ?? ""} /></div>
          </>
        )}
        <div>
          <label className="label" htmlFor="abn">ABN{rule.abn === "required" ? req : <span className="text-muted"> (if applicable)</span>}</label>
          <input id="abn" name="abn" className="input font-mono" inputMode="numeric" placeholder="11 digits, e.g. 51 824 753 556" value={abn} required={rule.abn === "required"}
            onChange={(e) => { setAbn(e.target.value.replace(/[^\d\s]/g, "")); setResult(null); }} aria-invalid={!!abnErr} />
          {abnErr && <p className="mt-1 text-xs text-red-600">{abnErr}</p>}
        </div>
        {showAcn && (
          <div>
            <label className="label" htmlFor="acn">ACN{rule.acn === "required" ? req : <span className="text-muted"> (if applicable)</span>}</label>
            <input id="acn" name="acn" className="input font-mono" inputMode="numeric" placeholder="9 digits, e.g. 004 085 616" value={acn} required={rule.acn === "required"}
              onChange={(e) => { setAcn(e.target.value.replace(/[^\d\s]/g, "")); setResult(null); }} aria-invalid={!!acnErr} />
            {acnErr && <p className="mt-1 text-xs text-red-600">{acnErr}</p>}
          </div>
        )}
      </div>

      {(abn || acn) && !abnErr && !acnErr && (
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Australian Business Register check</span>
            <button type="button" className="btn-secondary btn-sm" onClick={check} disabled={pending}>{pending ? "Checking…" : "Check ABN / ACN"}</button>
          </div>
          {result && !result.ok && <p className="mt-2 text-red-600">{result.error}</p>}
          {result?.ok && (
            <div className="mt-2 space-y-1">
              {result.entityName && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-muted">Entity name</dt><dd className="font-semibold">{result.entityName}</dd>
                  <dt className="text-muted">ABN</dt><dd className="font-mono">{result.abn}</dd>
                  <dt className="text-muted">ABN status</dt><dd>{result.abnStatus}</dd>
                  <dt className="text-muted">Entity type</dt><dd>{result.entityType}</dd>
                  <dt className="text-muted">GST</dt><dd>{result.gst}</dd>
                  {result.acn && (<><dt className="text-muted">ACN</dt><dd className="font-mono">{result.acn}</dd></>)}
                  {result.location && (<><dt className="text-muted">Location</dt><dd>{result.location}</dd></>)}
                  {result.businessNames && result.businessNames.length > 0 && (<><dt className="text-muted">Business names</dt><dd>{result.businessNames.join(", ")}</dd></>)}
                </dl>
              )}
              <p className={result.status === "VERIFIED" ? "text-emerald-700" : "text-amber-800"}>
                {result.status === "VERIFIED" ? "✔ Details match the ABR." : result.problems.join(" ")}
              </p>
              {result.status !== "VERIFIED" && result.configured && <p className="text-xs text-muted">You can still continue — mismatched or inactive details are reviewed manually by our team.</p>}
            </div>
          )}
        </div>
      )}

      {(rule.abn === "required" || abn || acn) && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="abnConfirmed" className="mt-1" defaultChecked={defaults.abnConfirmed} required />
          <span>I confirm the ABN{showAcn ? "/ACN" : ""} above belongs to {isBusiness ? "this business and I'm authorised to register it" : "me"}.{req}</span>
        </label>
      )}

      {showBio && (
        <div>
          <label className="label" htmlFor="bio">About you / your business</label>
          <textarea id="bio" name="bio" className="input" rows={3} defaultValue={defaults.bio ?? ""} />
        </div>
      )}
    </div>
  );
}
