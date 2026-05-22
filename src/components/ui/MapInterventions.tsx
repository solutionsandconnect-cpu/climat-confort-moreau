"use client";
// src/components/ui/MapInterventions.tsx
// Carte Leaflet/OpenStreetMap — aucune API payante requise
// Importer via next/dynamic avec ssr:false pour éviter les problèmes SSR

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { geocodeAddress } from "@/lib/geocode";
import { MapPin, Loader2 } from "lucide-react";

export interface MapMarker {
  id: string;
  label: string;
  address: string;
  coords?: [number, number]; // [lat, lon] — skips Nominatim when provided
  color?: "primary" | "green" | "orange" | "red" | "teal" | "purple" | "pink" | "indigo" | "amber";
  number?: number; // numéro affiché dans l'épingle
  stackCount?: number; // badge rouge si >1 intervention à la même adresse
}

interface MapInterventionsProps {
  markers: MapMarker[];
  height?: string;
}

const COLORS: Record<string, string> = {
  primary: "#3b82f6",
  green: "#22c55e",
  orange: "#f97316",
  red: "#ef4444",
  teal: "#14b8a6",
  purple: "#a855f7",
  pink: "#ec4899",
  indigo: "#6366f1",
  amber: "#f59e0b",
};

export function MapInterventions({ markers, height = "220px" }: MapInterventionsProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!markers.length || !mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      const resolved = await Promise.all(
        markers.map(async m => ({
          ...m,
          coords: m.coords ?? await geocodeAddress(m.address),
        }))
      );
      const valid = resolved.filter(m => m.coords);

      if (cancelled || !mapRef.current) return;
      if (!valid.length) { setStatus("error"); return; }

      // Destroy previous instance
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

      const center = valid[0].coords!;
      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, 14);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 18,
      }).addTo(map);

      valid.forEach(m => {
        const color = COLORS[m.color ?? "primary"];
        const sz = m.number !== undefined ? 30 : 26;
        const stackBadge = m.stackCount && m.stackCount > 1
          ? `<div style="position:absolute;top:-5px;right:-7px;min-width:15px;height:15px;padding:0 2px;border-radius:8px;background:#1a1a1a;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:white;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.3)">${m.stackCount}</div>`
          : "";
        const icon = L.divIcon({
          html: `<div style="position:relative;width:${sz}px;height:${sz}px">
            <div style="
              width:${sz}px;height:${sz}px;border-radius:50% 50% 50% 0;
              transform:rotate(-45deg);background:${color};
              border:2.5px solid rgba(255,255,255,0.9);
              box-shadow:0 4px 12px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25);
              display:flex;align-items:center;justify-content:center;
            ">${m.number !== undefined
              ? `<span style="transform:rotate(45deg);color:white;font-size:${sz > 26 ? 11 : 10}px;font-weight:800;line-height:1;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.35)">${m.number}</span>`
              : `<span style="transform:rotate(45deg);display:block;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.5)"></span>`
            }</div>${stackBadge}</div>`,
          className: "",
          iconSize: [sz, sz],
          iconAnchor: [sz / 2, sz],
          popupAnchor: [0, -(sz + 2)],
        });
        L.marker(m.coords!, { icon }).addTo(map)
          .bindPopup(`<strong style="font-size:13px">${m.label}</strong><br><span style="font-size:11px;color:#6b7280">${m.address}</span>`);
      });

      if (valid.length > 1) {
        map.fitBounds(valid.map(m => m.coords!) as [number, number][], { padding: [20, 20] });
      }

      setStatus("ready");
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers)]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-alternate" style={{ height }}>
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary-bg z-10 gap-1.5">
          <Loader2 size={18} className="animate-spin text-primary" />
          <p className="text-xs text-secondary-text">Chargement de la carte…</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary-bg z-10 gap-1.5">
          <MapPin size={18} className="text-secondary-text" />
          <p className="text-xs text-secondary-text">Adresse introuvable</p>
        </div>
      )}
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}
