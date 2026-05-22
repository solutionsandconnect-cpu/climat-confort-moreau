"use client";
// Composant réutilisable : autocomplétion adresse via api.adresse.data.gouv.fr
// Usage : <AdresseSearch value={adresse} onSelect={setAdresse} />

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { Spinner } from "./index";

interface Suggestion {
  label: string;
  postcode?: string;
  city?: string;
  context?: string;
  coords?: [number, number]; // [lon, lat] from GeoJSON
}

interface Props {
  value: string;
  onChange: (raw: string) => void;
  onSelect: (fullLabel: string) => void;
  onSelectWithCoords?: (fullLabel: string, lat: number, lon: number) => void;
  placeholder?: string;
  label?: string;
}

export function AdresseSearch({ value, onChange, onSelect, onSelectWithCoords, placeholder = "Ex: 12 rue de la Paix, Vannes", label }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const justSelected = useRef(false);

  // Synchronise la query si value change depuis l'extérieur
  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (justSelected.current) { justSelected.current = false; return; }
    if (query.length < 3) { setSuggestions([]); setShow(false); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`);
        const data = await res.json();
        const results: Suggestion[] = (data.features ?? []).map((f: { properties: { label: string; postcode?: string; city?: string; context?: string }; geometry?: { coordinates?: [number, number] } }) => ({
          label: f.properties.label,
          postcode: f.properties.postcode,
          city: f.properties.city,
          context: f.properties.context,
          coords: f.geometry?.coordinates,
        }));
        setSuggestions(results);
        setShow(results.length > 0);
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [query]);

  const handleSelect = (s: Suggestion) => {
    justSelected.current = true;
    setQuery(s.label);
    setSuggestions([]);
    setShow(false);
    onChange(s.label);
    onSelect(s.label);
    if (onSelectWithCoords && s.coords) {
      // GeoJSON: coordinates = [lon, lat]
      onSelectWithCoords(s.label, s.coords[1], s.coords[0]);
    }
  };

  return (
    <div>
      {label && <label className="text-xs font-medium text-secondary-text">{label}</label>}
      <div className={`relative ${label ? "mt-1" : ""}`}>
        <input
          className="input-base pr-9"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
          onFocus={() => suggestions.length > 0 && setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 150)}
          placeholder={placeholder}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? <Spinner size="sm" /> : <Search size={14} className="text-secondary-text" />}
        </div>
        {show && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-secondary-bg border border-alternate rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={i} type="button"
                onMouseDown={() => handleSelect(s)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary-bg transition-colors border-b border-alternate/50 last:border-0 flex items-start gap-2">
                <MapPin size={13} className="text-secondary-text shrink-0 mt-0.5" />
                <div>
                  <p className="text-primary-text text-sm leading-snug">{s.label}</p>
                  {s.context && <p className="text-xs text-secondary-text">{s.context}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
