// map-utils.js: Map creation, geolocation, UI utilities

// Map configuration and creation
const OSM_DEFAULT = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    attribution: false,
    maxZoom: 25,
    maxNativeZoom: 19
  }
};

export function createMap(darkMode) {
  const map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer(OSM_DEFAULT.url, OSM_DEFAULT.options).addTo(map);
  map.setView([52.2, 21.0], 15);
  return map;
}

// Geolocation and user position tracking
export function watchUserPosition(map, onUpdate, onError) {
  if (!navigator.geolocation) {
    onError('Geolokalizacja nie jest wspierana przez tę przeglądarkę.');
    return null;
  }
  let userMarker = null;
  let headingMarker = null;
  const watchId = navigator.geolocation.watchPosition(
    pos => {
      const userPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading
      };
      // User position marker
      if (!userMarker) {
        userMarker = L.circleMarker([userPosition.lat, userPosition.lng], {
          radius: 8, color: '#007aff', fillColor: '#007aff', fillOpacity: 0.5, weight: 2
        }).addTo(map);
      } else {
        userMarker.setLatLng([userPosition.lat, userPosition.lng]);
      }
      // Heading marker (triangle/arrow)
      if (headingMarker) {
        map.removeLayer(headingMarker);
        headingMarker = null;
      }
      if (userPosition.heading !== null && !isNaN(userPosition.heading)) {
        // Draw a triangle pointing in the heading direction
        const r = 18; // px, length of arrow
        const angleRad = (userPosition.heading - 90) * Math.PI / 180; // -90 to point up
        // Calculate triangle points in meters (approx)
        const lat = userPosition.lat;
        const lng = userPosition.lng;
        // Approximate meters per degree
        const dLat = (r / 111320); // 1 deg lat ~ 111.32km
        const dLng = (r / (40075000 * Math.cos(lat * Math.PI / 180) / 360));
        // Triangle points
        const tip = [
          lat + Math.sin(angleRad) * dLat,
          lng + Math.cos(angleRad) * dLng
        ];
        const left = [
          lat + Math.sin(angleRad + 2.5) * dLat * 0.6,
          lng + Math.cos(angleRad + 2.5) * dLng * 0.6
        ];
        const right = [
          lat + Math.sin(angleRad - 2.5) * dLat * 0.6,
          lng + Math.cos(angleRad - 2.5) * dLng * 0.6
        ];
        headingMarker = L.polygon([
          [tip[0], tip[1]],
          [left[0], left[1]],
          [right[0], right[1]]
        ], {
          color: '#007aff',
          fillColor: '#007aff',
          fillOpacity: 0.7,
          weight: 1,
          interactive: false
        }).addTo(map);
      }
      onUpdate(userPosition, userMarker);
    },
    err => {
      onError('Błąd geolokalizacji: ' + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
  return watchId;
}

// UI formatting utilities
export function formatCoords(obj) {
  if (!obj || obj.lat === undefined || obj.lng === undefined) return '-';
  return obj.lat.toFixed(6) + ', ' + obj.lng.toFixed(6);
}

export function formatDistance(m) {
  if (m == null) return '-';
  if (m < 1) return Math.round(m * 100) + ' cm';
  return m.toFixed(2) + ' m';
}