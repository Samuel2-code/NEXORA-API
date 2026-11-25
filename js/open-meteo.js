/* Clima actual y pronóstico diario de Open-Meteo (sin clave, CORS público). */

import { CONFIG, weatherDescription } from './config.js';
import { requestJSON } from './api-client.js';

function asList(value) {
  return Array.isArray(value) ? value : [value];
}

export async function getWeather(points, { daily = false, days = 5 } = {}) {
  const list = asList(points);
  if (!list.length) return [];
  const response = await requestJSON(
    CONFIG.weatherUrl(list.map((p) => p.lat), list.map((p) => p.lon), { daily, days }),
    { ttl: CONFIG.ttl.weather }
  );
  return asList(response);
}

export function summarizeWeather(raw) {
  const current = raw?.current || {};
  const description = weatherDescription(current.weather_code);
  return {
    ...description,
    temperature: Math.round(current.temperature_2m),
    humidity: current.relative_humidity_2m,
    wind: current.wind_speed_10m,
    time: current.time
  };
}

export function summarizeForecast(raw) {
  const daily = raw?.daily || {};
  return (daily.time || []).map((date, index) => ({
    date,
    max: Math.round(daily.temperature_2m_max?.[index] ?? 0),
    min: Math.round(daily.temperature_2m_min?.[index] ?? 0),
    ...weatherDescription(daily.weather_code?.[index])
  }));
}

export function weatherLine(summary) {
  return `${summary.temperature} °C · ${summary.label}`;
}
