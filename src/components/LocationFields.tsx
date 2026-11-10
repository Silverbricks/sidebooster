"use client";
// Seller Location Verification fields: structured address, postcode↔state check, map pin the seller confirms.

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { AU_STATES } from "@/lib/constants";
import { postcodeMatchesState } from "@/lib/au-validation";
import { previewAddressAction } from "@/app/actions/verification";
import type { AddressFields } from "@/lib/seller-location";

const MapPin = dynamic(() => import("./MapPin").then((m) => m.MapPin), { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded-lg bg-slate-100" /> });

const COUNTRIES = [
  { code: "AU", name: "Australia", enabled: true },
  { code: "NZ", name: "New Zealand (coming soon)", enabled: false },
];
const STATES_BY_COUNTRY: Record<string, readonly { code: string; name: string }[]> = { AU: AU_STATES };

export type LocationDefaults = { residential?: Partial<AddressFields> | null; business?: Partial<AddressFields> | null; pin?: { lat: number; lng: number } | null; pinConfirmed?: boolean };

const req = <span className="text-red-600"> *</span>;

function AddressBlock({ prefix, value, onChange, title }: { prefix: string; value: Partial<AddressFields>; onChange: (v: Partial<AddressFields>) => void; title?: string }) {
  const states = STATES_BY_COUNTRY[value.country ?? "AU"] ?? [];
  const pcBad = value.postcode && value.state && /^\d{4}$/.test(value.postcode) && !postcodeMatchesState(value.postcode, value.state);
  const set = (k: keyof AddressFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="space-y-3">
      {title && <legend className="font-semibold">{title}</legend>}
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <label className="label" htmlFor={`${prefix}country`}>Country{req}</label>
          <select id={`${prefix}country`} name={`${prefix}country`} className="input" value={value.country ?? "AU"} onChange={(e) => onChange({ ...value, country: e.target.value, state: "" })} required>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code} disabled={!c.enabled}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor={`${prefix}state`}>State / Territory{req}</label>
          <select id={`${prefix}state`} name={`${prefix}state`} className="input" value={value.state ?? ""} onChange={set("state")} required>
            <option value="" disabled>Select…</option>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${prefix}unit`}>Unit / Apartment</label>
          <input id={`${prefix}unit`} name={`${prefix}unit`} className="input" value={value.unit ?? ""} onChange={set("unit")} placeholder="e.g. 4" autoComplete="address-line2" />
        </div>
        <div className="sm:col-span-4">
          <label className="label" htmlFor={`${prefix}street`}>Street address{req}</label>
          <input id={`${prefix}street`} name={`${prefix}street`} className="input" value={value.street ?? ""} onChange={set("street")} placeholder="e.g. 12 George Street" required autoComplete="address-line1" />
        </div>
        <div className="sm:col-span-4">
          <label className="label" htmlFor={`${prefix}suburb`}>Suburb / City{req}</label>
          <input id={`${prefix}suburb`} name={`${prefix}suburb`} className="input" value={value.suburb ?? ""} onChange={set("suburb")} required autoComplete="address-level2" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${prefix}postcode`}>Postcode{req}</label>
          <input id={`${prefix}postcode`} name={`${prefix}postcode`} className="input" value={value.postcode ?? ""} onChange={(e) => onChange({ ...value, postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" pattern="\d{4}" required autoComplete="postal-code" aria-invalid={!!pcBad} />
        </div>
      </div>
      {pcBad && <p className="text-xs text-red-600">Postcode {value.postcode} isn&apos;t in {value.state}. Check the postcode and state.</p>}
    </fieldset>
  );
}

export function LocationFields({ defaults = {} }: { defaults?: LocationDefaults }) {
  const [res, setRes] = useState<Partial<AddressFields>>({ country: "AU", ...(defaults.residential ?? {}) });
  const [bus, setBus] = useState<Partial<AddressFields>>({ country: "AU", ...(defaults.business ?? {}) });
  const [busDifferent, setBusDifferent] = useState(!!defaults.business);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(defaults.pin ?? null);
  const [confirmed, setConfirmed] = useState(!!defaults.pinConfirmed);
  const [msg, setMsg] = useState<{ error?: string; info?: string; warnings?: string[] } | null>(null);
  const [pending, start] = useTransition();

  const changeRes = (v: Partial<AddressFields>) => { setRes(v); if (pin) { setConfirmed(false); } };
  const find = () =>
    start(async () => {
      setMsg(null);
      const r = await previewAddressAction({ country: res.country ?? "AU", street: res.street ?? "", unit: res.unit ?? null, suburb: res.suburb ?? "", state: res.state ?? "", postcode: res.postcode ?? "" });
      if (!r.ok) return setMsg({ error: r.error });
      setPin({ lat: r.lat, lng: r.lng });
      setConfirmed(false);
      setMsg({ info: r.formatted, warnings: r.warnings });
    });

  return (
    <div className="space-y-5">
      <AddressBlock prefix="res_" value={res} onChange={changeRes} title="Residential address" />

      <div className="space-y-3 rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm"><span className="font-semibold">Confirm your location on the map</span>{req}<p className="text-xs text-muted">Click &ldquo;Find on map&rdquo;, then drag the pin onto your property if needed.</p></div>
          <button type="button" className="btn-secondary btn-sm" onClick={find} disabled={pending}>{pending ? "Finding…" : pin ? "Find again" : "Find on map"}</button>
        </div>
        {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
        {msg?.info && <p className="text-xs text-muted">Found: {msg.info}</p>}
        {msg?.warnings?.map((w) => <p key={w} className="text-xs text-amber-800">⚠ {w}</p>)}
        {pin && (
          <>
            <MapPin pin={pin} editable onMove={(p) => { setPin(p); setConfirmed(false); }} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="pinConfirmed" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" required />
              <span>The pin shows my residential address.{req} <span className="text-xs text-muted">(Pins far from the typed address are reviewed manually — a random location isn&apos;t accepted.)</span></span>
            </label>
          </>
        )}
        <input type="hidden" name="pinLat" value={pin?.lat ?? ""} />
        <input type="hidden" name="pinLng" value={pin?.lng ?? ""} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="businessAddressDifferent" checked={busDifferent} onChange={(e) => setBusDifferent(e.target.checked)} />
        My business address is different from my residential address
      </label>
      {busDifferent && <AddressBlock prefix="bus_" value={bus} onChange={setBus} title="Business address" />}
      <p className="text-xs text-muted">Your street address is encrypted and never shown publicly — buyers only see your suburb and state.</p>
    </div>
  );
}
