/* Configuración central de las APIs externas usadas por Nexora.
   Todas son gratuitas, sin clave y con CORS público verificado. */

export const CONFIG = {
  // Dataset de países (mismo origen que alimentaba REST Countries v3.1)
  countriesUrl: 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json',

  // Población oficial (Banco Mundial). Acepta varios códigos separados por ';'
  populationUrl: (iso3Codes) =>
    `https://api.worldbank.org/v2/country/${iso3Codes.join(';')}/indicator/SP.POP.TOTL` +
    '?format=json&date=2024&per_page=100',

  // Banderas por código ISO 3166-1 alpha-2
  flagUrl: (iso2) => `https://flagcdn.com/w80/${String(iso2 || '').toLowerCase()}.png`,

  // Clima actual y pronóstico (Open-Meteo)
  weatherUrl: (latitudes, longitudes, { daily = false, days = 5 } = {}) => {
    const params = new URLSearchParams({
      latitude: Array.isArray(latitudes) ? latitudes.join(',') : String(latitudes),
      longitude: Array.isArray(longitudes) ? longitudes.join(',') : String(longitudes),
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      timezone: 'auto',
      forecast_days: String(days)
    });
    if (daily) params.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  },

  // Geocodificación (Nominatim / OpenStreetMap)
  nominatimUrl: (query) =>
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      'accept-language': 'es',
      q: query
    }).toString(),

  leaflet: {
    css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
  },

  timeout: 8000,
  nominatimInterval: 1000,
  ttl: {
    countries: 7 * 24 * 60 * 60 * 1000,
    population: 7 * 24 * 60 * 60 * 1000,
    weather: 10 * 60 * 1000,
    geocode: 30 * 24 * 60 * 60 * 1000
  }
};

/* Destinos fijos del diseño original. Se usan como coords por defecto para
   NO llamar a Nominatim al cargar la página (política de 1 petición/segundo). */
export const FEATURED = [
  { name: 'Barranquilla', country: 'Colombia', iso2: 'CO', iso3: 'COL', lat: 10.9685, lon: -74.7813 },
  { name: 'Kioto', country: 'Japón', iso2: 'JP', iso3: 'JPN', lat: 35.0116, lon: 135.7681 },
  { name: 'Roma', country: 'Italia', iso2: 'IT', iso3: 'ITA', lat: 41.9028, lon: 12.4964 },
  { name: 'Cusco', country: 'Perú', iso2: 'PE', iso3: 'PER', lat: -13.5320, lon: -71.9675 }
];

export const DEFAULT_TRIP = {
  name: 'Cartagena',
  iso2: 'CO',
  lat: 10.3910,
  lon: -75.4794,
  days: 3
};

/* Códigos WMO -> texto e icono legible para el clima de Open-Meteo. */
export function weatherDescription(code) {
  const table = [
    [0, '☀️', 'Despejado'],
    [1, '🌤️', 'Mayormente despejado'],
    [2, '⛅', 'Parcialmente nublado'],
    [3, '☁️', 'Nublado'],
    [45, '🌫️', 'Niebla'],
    [48, '🌫️', 'Escarcha'],
    [51, '🌦️', 'Llovizna ligera'],
    [53, '🌦️', 'Llovizna'],
    [55, '🌦️', 'Llovizna intensa'],
    [61, '🌧️', 'Lluvia débil'],
    [63, '🌧️', 'Lluvia'],
    [65, '🌧️', 'Lluvia intensa'],
    [71, '❄️', 'Nieve débil'],
    [73, '❄️', 'Nieve'],
    [75, '❄️', 'Nieve intensa'],
    [80, '🌦️', 'Chubascos'],
    [81, '🌦️', 'Chubascos'],
    [82, '🌦️', 'Chubascos fuertes'],
    [95, '⛈️', 'Tormenta'],
    [96, '⛈️', 'Tormenta con granizo'],
    [99, '⛈️', 'Tormenta fuerte']
  ];
  const found = table.find((row) => row[0] === code);
  return found ? { icon: found[1], label: found[2] } : { icon: '🌡️', label: 'Clima variable' };
}
