"use client";
// src/components/ui/NavButton.tsx
// Bouton GPS propre avec popup fixed (ne se cache pas derrière le contenu)

import { useState, useEffect, useRef } from "react";
import { Navigation } from "lucide-react";

interface NavButtonProps {
  adresse: string;
  label?: string;
}

export function NavButton({ adresse, label }: NavButtonProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(adresse)}`;
  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(adresse)}&navigate=yes`;

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: Math.min(rect.left + window.scrollX, window.innerWidth - 160),
    });
    setOpen(!open);
  };

  useEffect(() => {
    const close = () => setOpen(false);
    if (open) {
      document.addEventListener("click", close);
      document.addEventListener("scroll", close, true);
    }
    return () => { document.removeEventListener("click", close); document.removeEventListener("scroll", close, true); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors rounded-lg px-2 py-1 shrink-0"
        title={`Naviguer vers : ${adresse}`}
      >
        <Navigation size={12} />
        <span className="text-[10px] font-bold">{label ?? "GPS"}</span>
      </button>

      {open && (
        <div
          className="fixed z-[9999] bg-secondary-bg border border-alternate rounded-xl shadow-lg overflow-hidden min-w-[150px]"
          style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-alternate">
            <p className="text-xs text-secondary-text font-medium truncate max-w-[140px]">{adresse}</p>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-bg transition-colors"
            onClick={() => setOpen(false)}
          >
            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">G</span>
            </div>
            Google Maps
          </a>
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-bg transition-colors border-t border-alternate"
            onClick={() => setOpen(false)}
          >
            <div className="w-6 h-6 rounded-md bg-cyan-400 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">W</span>
            </div>
            Waze
          </a>
        </div>
      )}
    </>
  );
}
