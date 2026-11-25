/* Mapa interactivo con Leaflet + tiles de OpenStreetMap.
   La librería se carga desde CDN solo en las páginas que muestran un mapa. */

import { CONFIG } from './config.js';

let leafletPromise = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CONFIG.leaflet.css;
      link.dataset.leaflet = 'true';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = CONFIG.leaflet.js;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('No se pudo cargar Leaflet.'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

export async function initMap(element, { center = [4.6, -74.1], zoom = 5, markers = [] } = {}) {
  if (!element) return null;
  try {
    const L = await loadLeaflet();
    const map = L.map(element, { scrollWheelZoom: false }).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);

    markers.forEach((item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
      const marker = L.marker([item.lat, item.lon]).addTo(map);
      if (item.popup) marker.bindPopup(item.popup);
    });

    if (markers.length > 1) {
      map.fitBounds(markers.map((item) => [item.lat, item.lon]), { padding: [30, 30], maxZoom: 8 });
    }
    return map;
  } catch (error) {
    element.textContent = 'Mapa no disponible en este momento.';
    element.classList.add('api-error');
    return null;
  }
}

let markerLayer = null;

export function setMarkers(map, markers = []) {
  if (!map || !window.L) return;
  if (markerLayer) map.removeLayer(markerLayer);
  markerLayer = window.L.layerGroup().addTo(map);

  markers.forEach((item) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
    const marker = window.L.marker([item.lat, item.lon]).addTo(markerLayer);
    if (item.popup) marker.bindPopup(item.popup);
  });

  if (markers.length > 1) {
    map.fitBounds(markers.map((item) => [item.lat, item.lon]), { padding: [30, 30], maxZoom: 8 });
  }
}

export function addMarker(map, { lat, lon, label, popup }) {
  if (!map || !window.L) return;
  const marker = window.L.marker([lat, lon]).addTo(map);
  if (popup || label) marker.bindPopup(popup || label).openPopup();
  map.setView([lat, lon], Math.max(map.getZoom(), 6));
}
