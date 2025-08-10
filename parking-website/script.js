// ========================================================================================
// script.js (CSV-driven rendering)
// Uses Leaflet + Papa Parse to load a CSV and plot parking bays.
// List + search + 10s auto-refresh + unified "Last updated" display.
// ========================================================================================

// Map initialization
const map = L.map('map').setView([-37.8136, 144.9631], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

// Global state
const CSV_URL = '../parking-dataset/parking_results_for_comparison.csv';

let lastRefreshed = null;       // unified "Last updated" timestamp (when CSV was fetched)
let markersLayer = L.layerGroup().addTo(map);  // holds all circle markers
let allRows = [];               // array of parsed CSV rows (objects)
let currentFilteredRows = [];   // rows after search filter (for list rendering)

// Utility: relative time formatter
function getRelativeTime(dateObj) {
  if (!dateObj) return 'just now';
  const now = new Date();
  const diffMs = now - dateObj;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 1) return 'just now';
  if (diffSecs < 60) return `${diffSecs} seconds ago`;
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.floor(diffHours / 24)} days ago`;
}

// Core: load & render CSV
function loadParkingData() {
  // Clear old markers from the map
  markersLayer.clearLayers();

  Papa.parse(CSV_URL, {
    download: true,
    header: true,       // use the first row as keys
    dynamicTyping: true, // auto-convert numbers/booleans
    skipEmptyLines: true,
    complete: (result) => {
      lastRefreshed = new Date();

      // Filter out rows that don't have coordinates
      allRows = (result.data || []).filter(r =>
        r &&
        typeof r.latitude !== 'undefined' &&
        typeof r.longitude !== 'undefined' &&
        r.latitude !== null && r.longitude !== null &&
        r.latitude !== '' && r.longitude !== ''
      );

      // Render markers on the map
      allRows.forEach((row) => {
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        // Color by status: Present = occupied (red), others = unoccupied (green)
        const isOccupied = String(row.Status_Description || '').trim() === 'Present';
        const color = isOccupied ? 'red' : 'green';

        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          color
        });

        // Build popup HTML using fields from your CSV
        const updated = getRelativeTime(lastRefreshed);
        const popupHtml = `
          <strong>Kerbside ID:</strong> ${row.KerbsideID ?? '—'}<br>
          <strong>Status:</strong> ${row.Status_Description ?? 'Unknown'}<br>
          <strong>Street:</strong> ${row.OnStreet ?? '—'}<br>
          <strong>Between:</strong> ${row.StreetFrom ?? '—'} and ${row.StreetTo ?? '—'}<br>
          <strong>Zone:</strong> ${row.Zone_Number ?? '—'}<br>
          <strong>Segment:</strong> ${row.RoadSegmentID ?? '—'}<br>
          <strong>Last updated:</strong> ${updated}
        `;
        marker.bindPopup(popupHtml);

        // Attach a reference so we can open popup from the list
        row.__lat = lat;
        row.__lng = lng;
        row.__marker = marker;

        marker.addTo(markersLayer);
      });

      // Update the side list with all rows initially
      currentFilteredRows = allRows.slice();
      updateList(currentFilteredRows);
    },
    error: (err) => {
      console.error('Failed to parse CSV:', err);
    }
  });
}

// List & search
function updateList(rows) {
  const list = document.getElementById('parkingList');
  if (!list) return;
  list.innerHTML = '';

  // Limit to avoid rendering too many list items at once
  rows.slice(0, 200).forEach((row) => {
    const li = document.createElement('li');

    const updated = getRelativeTime(lastRefreshed);
    const idText = row.KerbsideID ? String(row.KerbsideID) : 'Unknown ID';
    const statusText = row.Status_Description ? String(row.Status_Description) : 'Unknown';
    const streetText = row.OnStreet ? String(row.OnStreet) : '';
    li.innerHTML = `
      <strong>${idText}</strong><br>
      ${statusText} - ${updated}<br>
      <small>${streetText}</small>
    `;

    li.onclick = () => {
      if (typeof row.__lat === 'number' && typeof row.__lng === 'number') {
        map.setView([row.__lat, row.__lng], 17);
        if (row.__marker) row.__marker.openPopup();
      }
    };

    list.appendChild(li);
  });
}

// Attach search handler (by KerbsideID or street name)
const searchInput = document.getElementById('searchBox');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const term = (e.target.value || '').toLowerCase();
    if (!term) {
      currentFilteredRows = allRows.slice();
      updateList(currentFilteredRows);
      return;
    }
    currentFilteredRows = allRows.filter((row) => {
      const id = String(row.KerbsideID ?? '').toLowerCase();
      const status = String(row.Status_Description ?? '').toLowerCase();
      const street = String(row.OnStreet ?? '').toLowerCase();
      return id.includes(term) || status.includes(term) || street.includes(term);
    });
    updateList(currentFilteredRows);
  });
}


// Kick off + 10s auto-refresh
loadParkingData();
setInterval(loadParkingData, 10000); // refresh every 10 seconds
