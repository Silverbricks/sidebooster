"use client";
import { useMemo, useState } from "react";
import { AU_STATES } from "@/lib/constants";

type Attr = { id: string; key: string; label: string; type: string; options: string | null; unit: string | null; required: boolean; isPrivate: boolean };
type Cat = { id: string; name: string; icon: string | null; highValue: boolean; attributes: Attr[]; children: { id: string; name: string; attributes: Attr[] }[] };
type Initial = {
  id?: string; title?: string; categoryId?: string; subcategoryId?: string | null; description?: string; price?: number; declaredValue?: number | null; deliveryFee?: number;
  condition?: string; quantity?: number; location?: string; state?: string | null; postcode?: string | null; contactPhone?: string | null; contactEmail?: string | null;
  allowEnquiry?: boolean; allowCheckout?: boolean; seoTitle?: string | null; seoDescription?: string | null; keywords?: string | null; videoUrl?: string | null;
  attrs?: Record<string, string>; images?: { id: string; url: string }[];
};

const dollars = (c?: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

type FeeLine = { label: string; value: string; note: string };

export function ListingForm({ categories, initial, action, canSubmit, fees }: { categories: Cat[]; initial?: Initial; action: (fd: FormData) => void; canSubmit: boolean; fees?: Record<string, FeeLine[]> }) {
  const [step, setStep] = useState(0);
  const [catId, setCatId] = useState(initial?.categoryId ?? "");
  const [subId, setSubId] = useState(initial?.subcategoryId ?? "");
  const [vals, setVals] = useState<Record<string, string>>(initial?.attrs ?? {});
  const [title, setTitle] = useState(initial?.title ?? "");
  const [condition, setCondition] = useState(initial?.condition ?? "USED");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [seo, setSeo] = useState({ seoTitle: initial?.seoTitle ?? "", seoDescription: initial?.seoDescription ?? "", keywords: initial?.keywords ?? "" });
  const cat = categories.find((c) => c.id === catId);
  const sub = cat?.children.find((s) => s.id === subId);
  const attrs = useMemo(() => [...(cat?.attributes ?? []), ...(sub?.attributes ?? [])], [cat, sub]);

  /** Builds copy strictly from what the seller entered — never invents features, history or warranty. */
  function generate() {
    const filled = attrs.filter((a) => vals[a.id] && !a.isPrivate);
    const spec = (k: string) => filled.find((a) => a.key === k) && vals[filled.find((a) => a.key === k)!.id];
    const fmt = (a: Attr) => (a.type === "boolean" ? (vals[a.id] === "true" ? "Yes" : "No") : `${vals[a.id]}${a.unit ? ` ${a.unit}` : ""}`);
    const headline = [spec("year"), spec("make") ?? spec("brand") ?? spec("manufacturer"), spec("model")].filter(Boolean).join(" ");
    const cond = condition === "NEW" ? "New" : condition === "REFURBISHED" ? "Refurbished" : "Used";
    const t = title || [headline, sub?.name ?? cat?.name].filter(Boolean).join(" — ") || "";
    if (!title && t) setTitle(t.slice(0, 120));
    const lines = [
      `${cond} ${headline || (sub?.name ?? cat?.name ?? "item").toLowerCase()} available${initial?.location ? ` in ${initial.location}` : ""}.`,
      "",
      "Key specifications:",
      ...filled.map((a) => `• ${a.label}: ${fmt(a)}`),
      "",
      "Contact the seller for further details or to arrange an inspection.",
    ];
    setDescription(lines.join("\n"));
    const short = `${cond} ${headline || t}. ${filled.slice(0, 4).map((a) => `${a.label}: ${fmt(a)}`).join(", ")}.`;
    setSeo({ seoTitle: `${t} | ${cat?.name ?? ""}`.slice(0, 70), seoDescription: short.slice(0, 160), keywords: [headline, cat?.name, sub?.name, ...filled.filter((a) => a.type === "select").map((a) => vals[a.id])].filter(Boolean).join(", ") });
  }

  const steps = ["Category & details", "Description, photos & location", "Price & selling options"];
  const show = (i: number) => (step === i ? "" : "hidden");

  return (
    <form action={action} className="space-y-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <ol className="flex gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => setStep(i)} className={`w-full rounded-lg border px-3 py-2 text-left ${step === i ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-muted"}`}>
              <span className="font-semibold">{i + 1}.</span> <span className="hidden sm:inline">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* Step 1 */}
      <section className={`card card-pad space-y-4 ${show(0)}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="categoryId">Category <span className="text-red-600">*</span></label>
            <select id="categoryId" name="categoryId" className="input" value={catId} onChange={(e) => { setCatId(e.target.value); setSubId(""); }}>
              <option value="">Select a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          {cat && cat.children.length > 0 && (
            <div><label className="label" htmlFor="subcategoryId">Subcategory</label>
              <select id="subcategoryId" name="subcategoryId" className="input" value={subId} onChange={(e) => setSubId(e.target.value)}>
                <option value="">—</option>{cat.children.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div><label className="label" htmlFor="title">Listing title <span className="text-red-600">*</span></label><input id="title" name="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. 2023 Toyota LandCruiser GXL" /></div>
        <fieldset><legend className="label">Condition</legend>
          <div className="flex gap-4 text-sm">{["NEW", "USED", "REFURBISHED"].map((c) => <label key={c} className="flex items-center gap-1"><input type="radio" name="condition" value={c} checked={condition === c} onChange={() => setCondition(c)} />{c.charAt(0) + c.slice(1).toLowerCase()}</label>)}</div>
        </fieldset>
        {attrs.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold">{sub?.name ?? cat?.name} specifications</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {attrs.map((a) => (
                <div key={a.id}>
                  <label className="label" htmlFor={`attr_${a.id}`}>{a.label}{a.unit ? ` (${a.unit})` : ""}{a.required && <span className="text-red-600"> *</span>}{a.isPrivate && <span className="ml-1 text-xs text-muted">🔒 private</span>}</label>
                  {a.type === "select" ? (
                    <select id={`attr_${a.id}`} name={`attr_${a.id}`} className="input" value={vals[a.id] ?? ""} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value })}>
                      <option value="">Select…</option>{a.options?.split(",").map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : a.type === "boolean" ? (
                    <select id={`attr_${a.id}`} name={`attr_${a.id}`} className="input" value={vals[a.id] ?? ""} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value })}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>
                  ) : (
                    <input id={`attr_${a.id}`} name={`attr_${a.id}`} type={a.type === "number" ? "number" : a.type === "date" ? "date" : "text"} step="any" className="input" value={vals[a.id] ?? ""} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {cat?.highValue && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{cat.name} are sold by enquiry. Buyers contact you; once you agree a sale, report it in <b>Sales</b> so the buyer can confirm it.</p>}
        <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => setStep(1)} disabled={!catId}>Next →</button></div>
      </section>

      {/* Step 2 */}
      <section className={`card card-pad space-y-4 ${show(1)}`}>
        <div>
          <div className="mb-1 flex items-center justify-between"><label className="label" htmlFor="description">Description <span className="text-red-600">*</span></label>
            <button type="button" onClick={generate} className="btn-secondary btn-sm">✨ Generate from specifications</button></div>
          <textarea id="description" name="description" rows={9} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          <p className="hint">The generator only uses the details you entered. Review it and add anything else that&apos;s true — never claim service history or warranty you can&apos;t back up.</p>
        </div>
        <div>
          <label className="label" htmlFor="images">Photos (up to 12, JPG/PNG/WEBP, 5MB each)</label>
          <input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="input" />
          {initial?.images && initial.images.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {initial.images.map((img, i) => (
                <div key={img.id} className="space-y-1 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  <label className="flex items-center gap-1"><input type="radio" name="mainImage" value={img.id} defaultChecked={i === 0} />Main</label>
                  <label className="flex items-center gap-1 text-red-700"><input type="checkbox" name="removeImage" value={img.id} />Remove</label>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="video">Video (optional, MP4/WEBM up to 50MB)</label>
          <input id="video" name="video" type="file" accept="video/mp4,video/webm" className="input" />
          {initial?.videoUrl && <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="removeVideo" /> Remove current video</label>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="location">Suburb / city <span className="text-red-600">*</span></label><input id="location" name="location" className="input" defaultValue={initial?.location} /></div>
          <div><label className="label" htmlFor="state">State</label><select id="state" name="state" className="input" defaultValue={initial?.state ?? ""}><option value="">—</option>{AU_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}</select></div>
          <div><label className="label" htmlFor="postcode">Postcode</label><input id="postcode" name="postcode" className="input" defaultValue={initial?.postcode ?? ""} /></div>
        </div>
        <div className="flex justify-between"><button type="button" className="btn-secondary" onClick={() => setStep(0)}>← Back</button><button type="button" className="btn-primary" onClick={() => setStep(2)}>Next →</button></div>
      </section>

      {/* Step 3 */}
      <section className={`card card-pad space-y-4 ${show(2)}`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="price">Selling price (AUD) <span className="text-red-600">*</span></label><input id="price" name="price" className="input" inputMode="decimal" defaultValue={dollars(initial?.price)} required /></div>
          <div><label className="label" htmlFor="declaredValue">Declared product value</label><input id="declaredValue" name="declaredValue" className="input" inputMode="decimal" defaultValue={dollars(initial?.declaredValue)} /></div>
          <div><label className="label" htmlFor="quantity">Quantity available</label><input id="quantity" name="quantity" type="number" min={1} className="input" defaultValue={initial?.quantity ?? 1} /></div>
        </div>
        {!cat?.highValue && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowCheckout" defaultChecked={initial?.allowCheckout ?? true} /> Allow online checkout (buy now)</label>
            <div><label className="label" htmlFor="deliveryFee">Delivery fee (AUD)</label><input id="deliveryFee" name="deliveryFee" className="input" inputMode="decimal" defaultValue={dollars(initial?.deliveryFee ?? 0)} /></div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowEnquiry" defaultChecked={initial?.allowEnquiry ?? true} /> Allow buyer enquiries</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="contactPhone">Contact phone (shown to logged-in buyers)</label><input id="contactPhone" name="contactPhone" className="input" defaultValue={initial?.contactPhone ?? ""} /></div>
          <div><label className="label" htmlFor="contactEmail">Contact email</label><input id="contactEmail" name="contactEmail" type="email" className="input" defaultValue={initial?.contactEmail ?? ""} /></div>
        </div>
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Search engine settings</summary>
          <div className="mt-3 space-y-3">
            <div><label className="label" htmlFor="seoTitle">SEO title</label><input id="seoTitle" name="seoTitle" className="input" value={seo.seoTitle} onChange={(e) => setSeo({ ...seo, seoTitle: e.target.value })} maxLength={70} /></div>
            <div><label className="label" htmlFor="seoDescription">Meta description</label><input id="seoDescription" name="seoDescription" className="input" value={seo.seoDescription} onChange={(e) => setSeo({ ...seo, seoDescription: e.target.value })} maxLength={160} /></div>
            <div><label className="label" htmlFor="keywords">Keywords</label><input id="keywords" name="keywords" className="input" value={seo.keywords} onChange={(e) => setSeo({ ...seo, keywords: e.target.value })} /></div>
          </div>
        </details>
        {fees && (fees[subId] ?? fees[catId] ?? fees[""]) && (
          <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm">
            <div className="mb-2 font-semibold">Fees for this listing — Pay Per Item, no subscription</div>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              {(fees[subId] ?? fees[catId] ?? fees[""])!.map((f) => (
                <div key={f.label} className="contents"><dt className="text-muted">{f.label}</dt><dd><b>{f.value}</b> <span className="text-xs text-muted">{f.note}</span></dd></div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">By submitting you agree to these fees. Card/payment-provider processing fees are separate. See <a href="/pricing" target="_blank" className="link">seller pricing</a>.</p>
          </div>
        )}
        <p className="text-sm text-muted">Offers & discounts are managed under <b>Offers</b>. Once this product is approved you can request a promotion campaign for it.</p>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
          <div className="flex gap-2">
            <button name="intent" value="draft" className="btn-secondary">Save draft</button>
            <button name="intent" value="submit" className="btn-primary" disabled={!canSubmit} title={canSubmit ? undefined : "Your seller account must be approved first"}>Submit for approval</button>
          </div>
        </div>
      </section>
    </form>
  );
}
