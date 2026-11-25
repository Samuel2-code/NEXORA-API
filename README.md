# Nexora

Sitio estático de planificación de viajes con integración de APIs externas. No tiene build, dependencias ni backend: es HTML + CSS + módulos ES de JavaScript.

## Ejecutar en local

```bash
python -m http.server 8000
```

Abre <http://localhost:8000/index.html>. Es importante usar un servidor HTTP (no abrir el HTML con `file://`) para que los módulos y `fetch` funcionen.

## APIs utilizadas

| Función | Fuente | Clave | Uso |
|---|---|---|---|
| Geocodificación | Nominatim (OpenStreetMap) | No | Solo tras una acción del usuario, máx. 1 petición/s, caché de 30 días |
| Mapas interactivos | Leaflet + tiles de OpenStreetMap | No | CDN, atribución visible en cada mapa |
| Clima actual y pronóstico | Open-Meteo | No | Caché de 10 minutos |
| Catálogo de países | `mledoze/countries` vía jsDelivr | No | Reemplazo gratuito de REST Countries v3.1 (deprecada) |
| Población | Banco Mundial (`SP.POP.TOTL`) | No | Caché de 7 días |
| Banderas | flagcdn.com | No | Imágenes por código ISO |

REST Countries ya no se usa: su API v3.1 está deprecada y la v5 requiere clave de pago. El dataset de mledoze es el mismo que alimentaba la v3.1.

## Estructura

```
css/api-states.css       # estados de carga/error, mapas y badges
js/config.js             # endpoints, constantes y códigos WMO
js/api-client.js         # fetch + timeout + caché + cola Nominatim
js/countries.js          # países + población + banderas
js/open-meteo.js         # clima actual y diario
js/nominatim.js          # geocodificación
js/map.js                # Leaflet
js/widgets.js            # tarjetas, favoritos y estados
js/nexora-bootstrap.js   # entry point por página (data-page)
```

## Despliegue

### Netlify

El repo incluye `netlify.toml`. En Netlify: **Add new site → Import an existing project → GitHub**, elegir este repo y desplegar sin comandos de build. El sitio queda en `https://<nombre>.netlify.app`.

### GitHub Pages

En el repo: **Settings → Pages → Source: Deploy from a branch → main / root**. Las rutas son relativas, así que funciona tanto en la raíz como bajo `/NEXORA-/`.

## Notas

- Los favoritos se guardan en `localStorage` (`nexora:favorites`).
- Si una API falla, se conservan los datos quemados originales y se muestra un mensaje con `aria-live`.
- Nominatim nunca se llama al cargar una página ni por tecla: solo en búsquedas, envío del formulario y cambio de destino.
