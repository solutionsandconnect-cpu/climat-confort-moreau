"use client";
// NavButton — popup fixed avec calcul position au clic, fonctionne partout

import { useState, useEffect, useRef } from "react";
import { Navigation } from "lucide-react";

export function NavButton({ adresse, label }: { adresse: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(adresse)}`;
  const wazeUrl = `https://ul.waze.com/ul?q=${encodeURIComponent(adresse)}&navigate=yes`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 155;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    setPos({ top: rect.bottom + 4, left });
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    const scroll = () => setOpen(false);
    window.addEventListener("click", close, true);
    window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("click", close, true); window.removeEventListener("scroll", scroll, true); };
  }, [open]);

  if (!adresse) return null;

  return (
    <>
      <button ref={btnRef} onClick={handleClick}
        className="flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors rounded-lg px-2 py-1 shrink-0 text-[10px] font-bold">
        <Navigation size={11} />{label ?? "GPS"}
      </button>
      {open && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
          className="bg-white border border-alternate rounded-xl shadow-xl overflow-hidden w-[155px]"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-alternate">
            <p className="text-[10px] text-secondary-text truncate max-w-[135px]">{adresse}</p>
          </div>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-bg transition-colors"
            onClick={() => setOpen(false)}>
            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center shrink-0">
              <span className="text-white text-[9px] font-bold">G</span>
            </div>
            Google Maps
          </a>
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-bg transition-colors border-t border-alternate"
            onClick={() => setOpen(false)}>
            <div className="w-6 h-6 rounded-md bg-cyan-400 flex items-center justify-center shrink-0">
              <span className="text-white text-[9px] font-bold">W</span>
            </div>
            Waze
          </a>
        </div>
      )}
    </>
  );
}
