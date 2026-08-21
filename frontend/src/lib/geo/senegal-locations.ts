// Approximate lat/lng lookup for Senegalese cities and Dakar-area quartiers.
// `city`/`quartier` on Property are free-text (seller-entered, no autocomplete
// yet) — there is no geocoding provider wired into this starter, so exact
// per-address coordinates aren't available. This gives the search map a real
// neighborhood-level position instead of nothing: match quartier first (more
// specific), fall back to city, fall back to Dakar (the platform's home
// market) if neither is recognized.
//
// Coordinates are approximate neighborhood/city centers, good enough for a
// "where roughly is this" map pin — not survey-grade geocoding.
type LatLng = [number, number];

const DAKAR: LatLng = [14.6928, -17.4467];

const QUARTIER_COORDS: Record<string, LatLng> = {
  almadies: [14.7447, -17.5144],
  ngor: [14.7469, -17.5175],
  ouakam: [14.7211, -17.4886],
  yoff: [14.7444, -17.4881],
  mermoz: [14.7091, -17.4767],
  'sacre coeur': [14.7147, -17.4708],
  'point e': [14.6975, -17.4614],
  fann: [14.6939, -17.4706],
  plateau: [14.6708, -17.4344],
  medina: [14.6742, -17.4453],
  liberte: [14.7006, -17.4517],
  'parcelles assainies': [14.75, -17.4358],
  parcelles: [14.75, -17.4358],
  'grand yoff': [14.7297, -17.4553],
  guediawaye: [14.7692, -17.4025],
  pikine: [14.7549, -17.39],
  'ouest foire': [14.7514, -17.4894],
  hann: [14.7061, -17.4325],
  'keur gorgui': [14.7092, -17.4653],
  'cite des eaux claires': [14.7325, -17.4744],
  'sicap liberte': [14.7006, -17.4517],
  sicap: [14.6975, -17.4553],
  hlm: [14.7014, -17.4494],
  colobane: [14.6906, -17.4472],
  'gueule tapee': [14.6875, -17.4489],
};

const CITY_COORDS: Record<string, LatLng> = {
  dakar: DAKAR,
  thies: [14.791, -16.9256],
  'saint-louis': [16.0179, -16.4896],
  'saint louis': [16.0179, -16.4896],
  mbour: [14.4198, -16.9646],
  saly: [14.4547, -17.0072],
  ziguinchor: [12.5556, -16.2719],
  touba: [14.8667, -15.8833],
  kaolack: [14.15, -16.0667],
  diourbel: [14.65, -16.2333],
  louga: [15.6167, -16.2167],
  fatick: [14.3333, -16.4167],
  kolda: [12.8833, -14.95],
  tambacounda: [13.7667, -13.6667],
  rufisque: [14.7167, -17.2667],
  diamniadio: [14.7333, -17.1833],
};

const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

function normalize(s: string): string {
  return s
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .trim();
}

/** Best-effort [lat, lng] for a listing's quartier/city — never null. */
export function coordsFor(city: string, quartier: string): LatLng {
  const q = normalize(quartier);
  for (const [key, coords] of Object.entries(QUARTIER_COORDS)) {
    if (q.includes(key)) return coords;
  }
  const c = normalize(city);
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (c.includes(key)) return coords;
  }
  return DAKAR;
}

/**
 * Small deterministic offset (±~180m) so multiple listings in the same
 * quartier don't render as a single stacked pin. Deterministic (hashed from
 * `seed`, usually the property id) so a given listing's pin doesn't jump
 * around between renders.
 */
export function jitter(seed: string, coords: LatLng): LatLng {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const angle = (hash % 360) * (Math.PI / 180);
  const radius = 0.0016; // ~180m at this latitude
  return [coords[0] + Math.sin(angle) * radius, coords[1] + Math.cos(angle) * radius];
}
