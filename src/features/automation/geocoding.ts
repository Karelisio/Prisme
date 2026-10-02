import { getLanguage } from '@/shared/i18n';
import { getJson, withParams } from '@/shared/lib/http';
import type { Place } from './model';

interface GeocodingResponse {
  results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[];
}

/** Recherche de ville (Open-Meteo, gratuit, sans clé) ; les noms reviennent dans la langue de l'interface. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await getJson<GeocodingResponse>(
    withParams('https://geocoding-api.open-meteo.com/v1/search', { name: q, count: 6, language: getLanguage(), format: 'json' }),
  );
  return (res.data.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}
