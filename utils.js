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
export function watchUserPosition(map, showAccuracyCircle, onUpdate, onError) {
  if (!navigator.geolocation) {
    onError('Geolokalizacja nie jest wspierana przez tę przeglądarkę.');
    return null;
  }
  
  // Clean up existing markers
  if (map._userMarker) {
    map.removeLayer(map._userMarker);
    map._userMarker = null;
  }
  if (map._headingMarker) {
    map.removeLayer(map._headingMarker);
    map._headingMarker = null;
  }
  
  const watchId = navigator.geolocation.watchPosition(
    pos => {
      const userPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading
      };
      
      // User position marker
      if (!map._userMarker) {
        if (showAccuracyCircle) {
          // Show accuracy circle
          map._userMarker = L.circle([userPosition.lat, userPosition.lng], {
            radius: userPosition.accuracy || 10,
            className: 'user-marker'
          }).addTo(map);
        } else {
          // Show small point
          map._userMarker = L.circleMarker([userPosition.lat, userPosition.lng], {
            radius: 6,
            className: 'user-marker'
          }).addTo(map);
        }
      } else {
        // Check if we need to recreate the marker (type change)
        const isCurrentlyCircle = !!map._userMarker.setRadius;
        if (showAccuracyCircle !== isCurrentlyCircle) {
          map.removeLayer(map._userMarker);
          if (showAccuracyCircle) {
            map._userMarker = L.circle([userPosition.lat, userPosition.lng], {
              radius: userPosition.accuracy || 10,
              className: 'user-marker'
            }).addTo(map);
          } else {
            map._userMarker = L.circleMarker([userPosition.lat, userPosition.lng], {
              radius: 6,
              className: 'user-marker'
            }).addTo(map);
          }
        } else {
          map._userMarker.setLatLng([userPosition.lat, userPosition.lng]);
          if (showAccuracyCircle && map._userMarker.setRadius) {
            map._userMarker.setRadius(userPosition.accuracy || 10);
          }
        }
      }
      
      // Heading marker (triangle/arrow)
      if (map._headingMarker) {
        map.removeLayer(map._headingMarker);
        map._headingMarker = null;
      }

      if (userPosition.heading === null || isNaN(userPosition.heading)) {
        userPosition.heading = 0; // Default heading if not available
      }
      
      // // Create heading marker using Lucide navigation-2 icon
      // headingMarker = L.marker([userPosition.lat, userPosition.lng], {
      //   icon: L.divIcon({
      //     html: `<span data-lucide="navigation-2" style="transform: rotate(${userPosition.heading}deg) scale(0.8);"></span>`,
      //     className: 'heading-label',
      //     iconSize: [20, 20],
      //     iconAnchor: [10, 10]
      //   })
      // }).addTo(map);
      
      // // Re-create Lucide icons for the new marker
      // if (window.lucide) {
      //   window.lucide.createIcons();
      // }
      
      onUpdate(userPosition, map._userMarker);
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