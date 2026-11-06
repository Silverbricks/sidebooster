"use client";
import { useState } from "react";

export function Gallery({ images, icon, alt }: { images: string[]; icon?: string | null; alt: string }) {
  const [i, setI] = useState(0);
  if (!images.length)
    return <div className="grid aspect-[16/10] place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-slate-100 text-8xl" aria-hidden="true">{icon ?? "📦"}</div>;
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[i]} alt={`${alt} — photo ${i + 1}`} className="aspect-[16/10] w-full rounded-xl bg-slate-100 object-contain" />
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, idx) => (
            <button key={src} onClick={() => setI(idx)} className={`shrink-0 overflow-hidden rounded-lg ring-2 ${idx === i ? "ring-brand-500" : "ring-transparent"}`} aria-label={`Show photo ${idx + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-16 w-24 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
