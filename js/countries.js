/* Catálogo de países: dataset mledoze (reemplazo gratuito de REST Countries)
   + población del Banco Mundial + banderas de flagcdn. */

import { CONFIG } from './config.js';
import { requestJSON } from './api-client.js';

const REGION_ES = {
  Americas: 'América',
  Europe: 'Europa',
  Asia: 'Asia',
  Africa: 'África',
  Oceania: 'Oceanía'
};

let countriesPromise = null;

function normalize(raw) {
  const coords = Array.isArray(raw.latlng) ? raw.latlng : [0, 0];
  return {
    iso2: raw.cca2,
    iso3: raw.cca3,
    name: raw.translations?.spa?.common || raw.name?.common || '',
    official: raw.name?.official || '',
    capital: Array.isArray(raw.capital) ? raw.capital[0] : (raw.capital || '—'),
    region: REGION_ES[raw.region] || raw.region || '—',
    subregion: raw.subregion || '',
    flag: raw.flag || '🏳️',
    flagImage: CONFIG.flagUrl(raw.cca2),
    lat: coords[0],
    lon: coords[1],
    currencies: Object.keys(raw.currencies || {}),
    population: null
  };
}

export function getCountries() {
  if (!countriesPromise) {
    countriesPromise = requestJSON(CONFIG.countriesUrl, { ttl: CONFIG.ttl.countries })
      .then((rows) => rows.map(normalize).sort((a, b) => a.name.localeCompare(b.name, 'es')))
      .catch((error) => {
        countriesPromise = null;
        throw error;
      });
  }
  return countriesPromise;
}

export async function getPopulations(iso3Codes) {
  const codes = [...new Set(iso3Codes.filter(Boolean))];
  const result = {};
  for (let i = 0; i < codes.length; i += 40) {
    const chunk = codes.slice(i, i + 40);
    const response = await requestJSON(CONFIG.populationUrl(chunk), { ttl: CONFIG.ttl.population });
    const rows = Array.isArray(response) && Array.isArray(response[1]) ? response[1] : [];
    rows.forEach((row) => {
      if (row.countryiso3code && typeof row.value === 'number') {
        result[row.countryiso3code] = row.value;
      }
    });
  }
  return result;
}

export async function enrichCountries(list) {
  const populations = await getPopulations(list.map((item) => item.iso3));
  return list.map((item) => ({ ...item, population: populations[item.iso3] ?? item.population }));
}

export function searchCountries(list, query) {
  const needle = (query || '').trim().toLocaleLowerCase('es');
  if (!needle) return list;
  return list.filter((item) =>
    [item.name, item.official, item.capital, item.region, item.subregion]
      .some((value) => String(value || '').toLocaleLowerCase('es').includes(needle))
  );
}

export function formatPopulation(value) {
  if (typeof value !== 'number') return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  return new Intl.NumberFormat('es-CO').format(value);
}
