"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";

type Pt = { lat: number; lng: number };

const pinHtml = (color: string) =>
  `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`;

/**
 * Map with the seller's pin. `editable` lets the seller drag the pin (onMove reports the new position).
 * `reference` shows a second, grey marker (e.g. where the geocoder placed the address) for admins.
 */
export function MapPin({ pin, reference, editable, onMove, height = 280 }: { pin: Pt; reference?: Pt | null; editable?: boolean; onMove?: (p: Pt) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { scrollWheelZoom: false }).setView([pin.lat, pin.lng], 17);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map.current);
      }
      const icon = (c: string) => L.divIcon({ html: pinHtml(c), className: "", iconSize: [28, 40], iconAnchor: [14, 40] });
      marker.current?.remove();
      marker.current = L.marker([pin.lat, pin.lng], { draggable: !!editable, icon: icon("#6d28d9"), title: "Your address" }).addTo(map.current);
      if (editable) {
        marker.current.on("dragend", () => {
          const p = marker.current!.getLatLng();
          moveRef.current?.({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
        });
        map.current.off("click").on("click", (e) => {
          marker.current!.setLatLng(e.latlng);
          moveRef.current?.({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
        });
      }
      if (reference) {
        L.marker([reference.lat, reference.lng], { icon: icon("#94a3b8"), title: "Geocoded address", interactive: false }).addTo(map.current);
        map.current.fitBounds(L.latLngBounds([[pin.lat, pin.lng], [reference.lat, reference.lng]]).pad(0.4), { maxZoom: 17 });
      } else {
        map.current.setView([pin.lat, pin.lng], map.current.getZoom() < 15 ? 17 : map.current.getZoom());
      }
    })();
    return () => { cancelled = true; };
  }, [pin.lat, pin.lng, reference?.lat, reference?.lng, editable]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-lg border border-line" role="application" aria-label="Map showing the address pin" />;
}
