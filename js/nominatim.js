/* Geocodificación de OpenStreetMap (Nominatim).
   Solo se llama tras una acción del usuario: nunca al cargar una página,
   nunca por pulsación de tecla y siempre con cola de 1 req/s y caché. */

import { CONFIG } from './config.js';
import { requestJSON, nominatimQueue } from './api-client.js';

export async function geocode(query) {
  const text = String(query || '').trim();
  if (text.length < 3) throw new Error('Escribe al menos 3 caracteres para buscar.');

  const results = await requestJSON(CONFIG.nominatimUrl(text), {
    ttl: CONFIG.ttl.geocode,
    queue: nominatimQueue
  });

  if (!Array.isArray(results) || !results.length) {
    throw new Error(`No encontramos “${text}” en OpenStreetMap.`);
  }

  const first = results[0];
  return {
    name: first.name || first.display_name?.split(',')[0] || text,
    displayName: first.display_name || text,
    lat: Number(first.lat),
    lon: Number(first.lon),
    type: first.type || first.category || 'lugar',
    iso2: String(first.address?.country_code || '').toUpperCase() || null,
    licence: first.licence || ''
  };
}
