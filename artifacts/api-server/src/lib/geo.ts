const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Geohash de precisão 5 (~4,9 km) — suficiente para agregação sem PII. */
export function geohash5(lat: number, lng: number): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < 5) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = (ch << 1) + 1;
        minLng = mid;
      } else {
        ch = ch << 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = (ch << 1) + 1;
        minLat = mid;
      } else {
        ch = ch << 1;
        maxLat = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

export type LatLng = [number, number];

/**
 * Distância mínima (km) de um ponto a uma polyline e o índice do vértice mais
 * próximo (usado para ordenar postos ao longo do trajeto).
 */
export function distanceToPolyline(
  lat: number,
  lng: number,
  polyline: LatLng[],
): { distanciaKm: number; indice: number } {
  let best = Number.POSITIVE_INFINITY;
  let bestIdx = 0;
  for (let i = 0; i < polyline.length; i++) {
    const [plat, plng] = polyline[i];
    const d = haversineKm(lat, lng, plat, plng);
    if (d < best) {
      best = d;
      bestIdx = i;
    }
  }
  return { distanciaKm: best, indice: bestIdx };
}

/** Reduz a polyline para no máximo `max` pontos (amostragem uniforme). */
export function samplePolyline(polyline: LatLng[], max = 300): LatLng[] {
  if (polyline.length <= max) return polyline;
  const step = (polyline.length - 1) / (max - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) {
    out.push(polyline[Math.round(i * step)]);
  }
  return out;
}
