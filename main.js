// main.js: Alpine.js glue for Plot Finder
import {formatCoords, formatDistance, createMap, watchUserPosition} from './utils.js';
import {fetchParcelById, fetchParcelByXY, wktToGeoJSON, drawParcel, findNearestVertex, measureEdges} from './data.js';

document.addEventListener('alpine:init', () => {
  Alpine.data('plotFinderApp', () => ({
    map: null,
    tileLayer: null,
    darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
    searchId: '300301_1.0001.AR_19.85',
    showSearchModal: false,
    enableMapClickSearch: true,
    autoCenter: true,
    orientationEnabled: false,
    orientationSupported: false,
    showEdges: false,
    error: '',
    userPosition: null,
    parcel: null,
    derived: null,
    userMarker: null,
    watchId: null,
    parcelLayer: null,
    vertexLine: null,
    edgeLines: [],

    init() {
      this.map = createMap(this.darkMode);
      this.initGeolocation();
      this.map.on('click', e => this.onMapClick(e));
      this.$watch('showEdges', () => this.updateDerived());
    },

    initGeolocation() {
      this.watchId = watchUserPosition(this.map, (pos, marker) => {
        this.userPosition = pos;
        this.userMarker = marker;
        if (this.autoCenter) {
          this.map.setView([pos.lat, pos.lng], this.map.getZoom());
        }
        this.updateDerived();
      }, err => {
        this.error = err;
      });
    },

    toggleAutoCenter() {
      this.autoCenter = !this.autoCenter;
      if (this.autoCenter && this.userPosition) {
        this.map.setView([this.userPosition.lat, this.userPosition.lng], this.map.getZoom());
      }
    },

    async searchParcelById() {
      this.error = '';
      if (!this.searchId) {
        this.error = 'Podaj identyfikator działki.';
        return;
      }
      try {
        const data = await fetchParcelById(this.searchId);
        if (!data || !data.geom_wkt) throw new Error('Brak działki o podanym ID.');
        this.setParcelFromULDK(data);
      } catch (e) {
        this.error = 'Nie udało się pobrać działki: ' + (e.message || e);
        this.clearParcel();
      }
    },

    async onMapClick(e) {
      if (!this.enableMapClickSearch) return;
      this.error = '';
      const lng = e.latlng.lng.toFixed(7);
      const lat = e.latlng.lat.toFixed(7);
      try {
        const data = await fetchParcelByXY(lng, lat);
        if (!data || !data.geom_wkt) throw new Error('Brak działki pod wskazanym punktem.');
        this.setParcelFromULDK(data);
      } catch (e) {
        this.error = 'Nie udało się pobrać działki: ' + (e.message || e);
        this.clearParcel();
      }
    },

    setParcelFromULDK(result) {
      this.parcel = {
        id: result.id,
        geomWkt: result.geom_wkt,
        region: result.region,
        county: result.county,
        commune: result.commune,
        voivodeship: result.voivodeship,
        datasource: result.datasource
      };
      const geo = wktToGeoJSON(result.geom_wkt);
      if (!geo) {
        this.error = 'Nieprawidłowa geometria działki.';
        return;
      } else {
        console.log('geo', geo);
      }
      this.searchId = this.parcel.id;
      this.parcel.vertexCount = geo.coordinates[0].length - 1;
      this.parcelLayer = drawParcel(this.map, geo);
      this.updateDerived();
    },

    clearParcel() {
      this.parcel = null;
      if (this.parcelLayer) {
        this.map.removeLayer(this.parcelLayer);
        this.parcelLayer = null;
      }
      if (this.vertexLine) {
        this.map.removeLayer(this.vertexLine);
        this.vertexLine = null;
      }
      if (this.edgeLines) this.edgeLines.forEach(l => this.map.removeLayer(l));
      this.edgeLines = [];
      if (this.map._vertexMarkers) {
        this.map._vertexMarkers.forEach(m => this.map.removeLayer(m));
        this.map._vertexMarkers = [];
      }
      if (this.map._edgeProjectionMarkers) {
        this.map._edgeProjectionMarkers.forEach(m => this.map.removeLayer(m));
        this.map._edgeProjectionMarkers = [];
      }
      this.derived = null;
    },

    updateDerived() {
      if (!this.parcel || !this.userPosition) {
        this.derived = null;
        if (this.vertexLine) {
          this.map.removeLayer(this.vertexLine);
          this.vertexLine = null;
        }
        if (this.edgeLines) {
          this.edgeLines.forEach(l => this.map.removeLayer(l));
          this.edgeLines = [];
        }
        if (this.map._edgeProjectionMarkers) {
          this.map._edgeProjectionMarkers.forEach(m => this.map.removeLayer(m));
          this.map._edgeProjectionMarkers = [];
        }
        return;
      }
      // Zbierz wierzchołki z polygonu
      let coords = null;
      if (this.parcelLayer && this.parcelLayer.getLayers().length > 0) {
        const geo = this.parcelLayer.getLayers()[0].feature.geometry;
        coords = geo.type === 'Polygon' ? geo.coordinates[0] : null;
      }
      if (!coords) return;
      // Najbliższy wierzchołek
      const nearest = findNearestVertex(coords, this.userPosition);
      let edges = [];
      if (this.showEdges && nearest) {
        edges = measureEdges(coords, nearest.index, this.userPosition);
        // Rysuj linie prostopadłe
        if (this.edgeLines) this.edgeLines.forEach(l => this.map.removeLayer(l));
        this.edgeLines = [];
        // Remove old edge projection markers
        if (this.map._edgeProjectionMarkers) {
          this.map._edgeProjectionMarkers.forEach(m => this.map.removeLayer(m));
          this.map._edgeProjectionMarkers = [];
        } else {
          this.map._edgeProjectionMarkers = [];
        }
        edges.forEach(ed => {
          const latlngs = [
            [this.userPosition.lat, this.userPosition.lng],
            [ed.projLat, ed.projLng]
          ];
          const line = L.polyline(latlngs, { color: '#e67e22', dashArray: '2 8', weight: 2 }).addTo(this.map);
          this.edgeLines.push(line);
          
          // Add distance label on the edge line
          const midLat = (this.userPosition.lat + ed.projLat) / 2;
          const midLng = (this.userPosition.lng + ed.projLng) / 2;
          const edgeDistanceLabel = L.marker([midLat, midLng], {
            icon: L.divIcon({
              html: formatDistance(ed.distanceM),
              className: 'distance-label edge-label',
              iconSize: [60, 20],
              iconAnchor: [30, 10]
            })
          }).addTo(this.map);
          this.edgeLines.push(edgeDistanceLabel);
          
          // Check if projection point is outside the edge segment
          const edgeStart = coords[ed.edgeIndex];
          const edgeEnd = coords[(ed.edgeIndex + 1) % coords.length];
          const projPoint = [ed.projLng, ed.projLat];
          
          if (isPointOutsideSegment(projPoint, edgeStart, edgeEnd)) {
            // Add dashed line from projection to nearest endpoint of the edge
            const distToStart = turf.distance(turf.point(projPoint), turf.point(edgeStart), { units: 'meters' });
            const distToEnd = turf.distance(turf.point(projPoint), turf.point(edgeEnd), { units: 'meters' });
            const nearestPoint = distToStart < distToEnd ? edgeStart : edgeEnd;
            
            const extensionLine = L.polyline([
              [ed.projLat, ed.projLng],
              [nearestPoint[1], nearestPoint[0]]
            ], { color: '#e67e22', dashArray: '10 5', weight: 1, opacity: 0.7 }).addTo(this.map);
            this.edgeLines.push(extensionLine);
          }
          
          // Add projection point marker
          const marker = L.marker([ed.projLat, ed.projLng], {
            icon: L.divIcon({
              html: ed.edgeIndex.toString(),
              className: 'edge-label',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })
          }).addTo(this.map);
          this.map._edgeProjectionMarkers.push(marker);
        });
      } else {
        if (this.edgeLines) this.edgeLines.forEach(l => this.map.removeLayer(l));
        this.edgeLines = [];
        if (this.map._edgeProjectionMarkers) {
          this.map._edgeProjectionMarkers.forEach(m => this.map.removeLayer(m));
          this.map._edgeProjectionMarkers = [];
        }
      }
      this.derived = nearest ? {
        nearestVertex: { index: nearest.index, lat: nearest.lat, lng: nearest.lng },
        distanceToVertexM: nearest.distance,
        edges: edges.length ? edges : undefined
      } : null;
      // Rysuj linię do wierzchołka
      if (this.vertexLine) {
        this.map.removeLayer(this.vertexLine);
        this.vertexLine = null;
      }
      if (nearest) {
        this.vertexLine = L.polyline([
          [this.userPosition.lat, this.userPosition.lng],
          [nearest.lat, nearest.lng]
        ], { color: '#007aff', dashArray: '6 6', weight: 2 }).addTo(this.map);
        
        // Add distance label on the vertex line
        const midLat = (this.userPosition.lat + nearest.lat) / 2;
        const midLng = (this.userPosition.lng + nearest.lng) / 2;
        const vertexDistanceLabel = L.marker([midLat, midLng], {
          icon: L.divIcon({
            html: formatDistance(nearest.distance),
            className: 'distance-label vertex-label',
            iconSize: [60, 20],
            // iconAnchor: [30, 10]
          })
        }).addTo(this.map);
        this.edgeLines.push(vertexDistanceLabel);
      }
    },

    toggleShowEdges() {
      this.showEdges = !this.showEdges;
      this.updateDerived();
    },

    formatCoords,
    formatDistance
  }));
});

function isPointOutsideSegment(point, segmentStart, segmentEnd) {
  // Use turf.js to check if point is outside the line segment
  const line = turf.lineString([segmentStart, segmentEnd]);
  const projectedPoint = turf.nearestPointOnLine(line, turf.point(point), { units: 'meters' });
  
  // Check if the projected point is at the start or end of the segment
  // If the projection equals one of the endpoints, the original point is outside the segment
  const startPoint = turf.point(segmentStart);
  const endPoint = turf.point(segmentEnd);
  
  const distToStart = turf.distance(projectedPoint, startPoint, { units: 'meters' });
  const distToEnd = turf.distance(projectedPoint, endPoint, { units: 'meters' });
  
  // If projection is very close to either endpoint, the point is outside the segment
  return distToStart < 0.001 || distToEnd < 0.001;
}
