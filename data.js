// parcel-data.js: ULDK API, WKT parsing, geometry calculations

import { wktToGeoJSON } from 'https://cdn.jsdelivr.net/npm/betterknown@1.0.5/+esm';

// ULDK API functions
function parseUldkResponse(text) {
  // Example:
  // 0\nSRID=4326;POLYGON((...))|Winiary|powiat Poznań|Poznań (miasto)|wielkopolskie|powiat Poznań (wfs)|306401_1.0052.AR_21.85/1
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== '0') throw new Error('ULDK error code: ' + lines[0]);
  const parts = lines[1].split('|');
  if (parts.length < 7) throw new Error('Nieprawidłowa odpowiedź ULDK');
  const [geom_wkt, region, county, commune, voivodeship, datasource, id] = parts;
  return {
    geom_wkt: geom_wkt.replace(/^SRID=\d+;/, ''),
    region,
    county,
    commune,
    voivodeship,
    datasource,
    id
  };
}

export async function fetchParcelById(id) {
  const url = `https://uldk.gugik.gov.pl/?request=GetParcelById&id=${encodeURIComponent(id)}&result=geom_wkt,region,county,commune,voivodeship,datasource,id&srid=4326`;
  const resp = await fetch(url);
  const text = await resp.text();
  const response = parseUldkResponse(text);
  return response;
}

export async function fetchParcelByXY(lng, lat) {
  const url = `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=${lng},${lat},4326&result=geom_wkt,region,county,commune,voivodeship,datasource,id&srid=4326`;
  const resp = await fetch(url);
  const text = await resp.text();
  const response = parseUldkResponse(text);
  return response;
}

// Drawing and geometry functions
export function drawParcel(map, geojson) {
  if (map._parcelLayer) map.removeLayer(map._parcelLayer);
  map._parcelLayer = L.geoJSON(geojson, {
    className: 'parcel-polygon'
  }).addTo(map);
  map.fitBounds(map._parcelLayer.getBounds(), { maxZoom: 17 });
  // Draw vertex markers with indices
  if (map._vertexMarkers) map._vertexMarkers.forEach(m => map.removeLayer(m));
  map._vertexMarkers = [];
  const coords = geojson.coordinates[0];
  coords.forEach((coord, i) => {
    const [lng, lat] = coord;
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: i.toString(),
        className: 'vertex-label',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map);
    map._vertexMarkers.push(marker);
  });
  return map._parcelLayer;
}

// Geometry calculations
export function findNearestVertex(uniqueCoords, userPosition) {
  const userPt = turf.point([userPosition.lng, userPosition.lat]);
  
  let minDist = Infinity, minIdx = -1;
  uniqueCoords.forEach(([lng, lat], i) => {
    const dist = turf.distance(userPt, turf.point([lng, lat]), { units: 'meters' });
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  });
  if (minIdx === -1) return null;
  return { index: minIdx, lat: uniqueCoords[minIdx][1], lng: uniqueCoords[minIdx][0], distance: minDist };
}

export function measureEdges(uniqueCoords, idx, userPosition) {
  const userPt = [userPosition.lng, userPosition.lat];
  
  const len = uniqueCoords.length;
  const prevIdx = (idx - 1 + len) % len;
  const nextIdx = (idx + 1) % len;
  
  const edges = [
    { idx: prevIdx, start: uniqueCoords[prevIdx], end: uniqueCoords[idx] },
    { idx: idx, start: uniqueCoords[idx], end: uniqueCoords[nextIdx] }
  ];
  return edges.map(ed => {
    const distProj = distanceToInfiniteLine(userPt, ed.start, ed.end);
    return {
      edgeIndex: ed.idx,
      distanceM: distProj.distance,
      projLat: distProj.proj[1],
      projLng: distProj.proj[0]
    };
  });
}

function distanceToInfiniteLine(point, start, end) {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  
  // Use turf.js for proper distance calculations instead of manual conversion
  // Create points for calculation
  const userPoint = turf.point([px, py]);
  const startPoint = turf.point([x1, y1]);
  const endPoint = turf.point([x2, y2]);
  
  if (turf.distance(startPoint, endPoint, { units: 'meters' }) === 0) {
    // start == end, distance to point
    const dist = turf.distance(userPoint, startPoint, { units: 'meters' });
    return { distance: dist, proj: [x1, y1] };
  }
  
  // Calculate bearing and distance from start to end
  const bearing = turf.bearing(startPoint, endPoint);
  const lineDistance = turf.distance(startPoint, endPoint, { units: 'meters' });
  
  // Calculate the projection parameter t using spherical geometry
  const userBearing = turf.bearing(startPoint, userPoint);
  const userDistance = turf.distance(startPoint, userPoint, { units: 'meters' });
  
  // Convert bearings to radians and calculate dot product equivalent
  const lineBearingRad = bearing * Math.PI / 180;
  const userBearingRad = userBearing * Math.PI / 180;
  const dotProduct = Math.cos(userBearingRad - lineBearingRad);
  
  const t = (userDistance * dotProduct) / lineDistance;
  
  // Calculate projection point along the infinite line
  const projectionDistance = t * lineDistance;
  const projPoint = turf.destination(startPoint, projectionDistance, bearing, { units: 'meters' });
  
  // Calculate perpendicular distance
  const dist = turf.distance(userPoint, projPoint, { units: 'meters' });
  
  return { 
    distance: dist, 
    proj: projPoint.geometry.coordinates 
  };
}

export { wktToGeoJSON };