// ========================================================================================
// script.js 
// Include: map loading + GeoJSON data loading + auto-refresh + relative time display
// ========================================================================================


// Initial Map
const map = L.map('map').setView([-37.8136, 144.9631], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

let parkingLayer = null; // save current marker layer

// Relative time display (minutes/hours/days)
function getRelativeTime(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

// GeoJSON data loading
function loadParkingData() {
  // If there is a layer, remove it first
  if (parkingLayer) {
    map.removeLayer(parkingLayer);
  }

  fetch('https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/on-street-parking-bay-sensors/exports/geojson')
    .then(response => response.json())
    .then(data => {
      parkingLayer = L.geoJSON(data, {
        pointToLayer: (feature, latlng) => {
          const occupied = feature.properties.status_description === 'Present';
          const color = occupied ? 'red' : 'green';
          return L.circleMarker(latlng, { color, radius: 5 });
        },
        onEachFeature: (feature, layer) => {
          const desc = feature.properties.status_description;
          const updated = getRelativeTime(feature.properties.status_timestamp);

          layer.bindPopup(`
            <strong>Kerbside ID:</strong> ${feature.properties.kerbsideid}<br>
            <strong>Status:</strong> ${desc}<br>
            <strong>Last updated:</strong> ${updated}
          `);
        }
      });

      parkingLayer.addTo(map);
    })
    .catch(err => console.error('Failed to load parking sensor data:', err));
}

// Initial Loading
loadParkingData();

// Refresh the data every 60s
setInterval(loadParkingData, 60000);