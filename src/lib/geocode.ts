// src/lib/geocode.ts
// Geocodage via Nominatim (OpenStreetMap) — gratuit, aucune clé API requise
// Résultats mis en cache pour éviter les appels répétés

const cache = new Map<string, [number, number] | null>();

/**
 * Estimation du temps de trajet (sans API) via distance Haversine.
 * Facteur route ×1.4, vitesse moyenne 50 km/h.
 * Précision indicative — à mentionner comme proposition (BONUS).
 */
export function estimateTravelTime(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): { distanceKm: number; minutes: number } {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const crowFlies = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const road = crowFlies * 1.4;
  return { distanceKm: Math.round(road * 10) / 10, minutes: Math.round((road / 50) * 60) };
}

export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const key = address.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=fr`;
    const res = await fetch(url, { headers: { "Accept-Language": "fr", "User-Agent": "ClimatConfortMoreau/1.0" } });
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!data.length) { cache.set(key, null); return null; }
    const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    cache.set(key, coords);
    return coords;
  } catch {
    cache.set(key, null);
    return null;
  }
}
