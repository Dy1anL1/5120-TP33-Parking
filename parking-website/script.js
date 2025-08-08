// ========================================================================================
// script.js 
// Include: map loading + GeoJSON data loading + auto-refresh + relative time display
// ========================================================================================

// Initial Map
const map = L.map('map').setView([-37.8136, 144.9631], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

let parkingLayer = null;
let allFeatures = [];

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
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.floor(diffHours / 24)} days ago`;
}

// GeoJSON data loading
let lastRefreshed = null;

function loadParkingData() {
  if (parkingLayer) map.removeLayer(parkingLayer);

  fetch('https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/on-street-parking-bay-sensors/exports/geojson')
    .then(res => res.json())
    .then(data => {
      lastRefreshed = new Date(); // ⏱️ 更新统一时间

      allFeatures = data.features;

      parkingLayer = L.geoJSON(data, {
        pointToLayer: (feature, latlng) => {
          const occupied = feature.properties.status_description === 'Present';
          const color = occupied ? 'red' : 'green';
          return L.circleMarker(latlng, { color, radius: 6 });
        },
        onEachFeature: (feature, layer) => {
          const desc = feature.properties.status_description;
          const updated = getRelativeTime(lastRefreshed); // 🔄 使用统一时间

          layer.bindPopup(`
            <strong>Kerbside ID:</strong> ${feature.properties.kerbsideid}<br>
            <strong>Status:</strong> ${desc}<br>
            <strong>Last updated:</strong> ${updated}
          `);

          feature.layerRef = layer;
        }
      }).addTo(map);

      updateList(allFeatures);
    });
}

function updateList(features) {
  const list = document.getElementById("parkingList");
  list.innerHTML = "";

  features.slice(0, 100).forEach(f => {
    const li = document.createElement("li");
    const status = f.properties.status_description;
    const updated = getRelativeTime(lastRefreshed);
    li.innerHTML = `
      <strong>${f.properties.kerbsideid || "Unknown ID"}</strong><br>
      ${status} - ${updated}
    `;
    li.onclick = () => {
      const latlng = f.geometry.coordinates.reverse(); // GeoJSON is [lng, lat]
      map.setView(latlng, 17);
      f.layerRef.openPopup();
    };
    list.appendChild(li);
  });
}

// Search
document.getElementById("searchBox").addEventListener("input", e => {
  const term = e.target.value.toLowerCase();
  const filtered = allFeatures.filter(f => {
    const id = f.properties.kerbsideid?.toLowerCase() || "";
    const desc = f.properties.status_description?.toLowerCase() || "";
    return id.includes(term) || desc.includes(term);
  });
  updateList(filtered);
});

// Initial Loading
loadParkingData();

// Refresh the data every 60s
setInterval(loadParkingData, 60000);
