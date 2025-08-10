// ========================================================================================
// script.js
// - loads a CSV (Papa Parse)
// - draws points with Leaflet
// - supports search + "Only show available" filter
// - refreshes every 10s
// ========================================================================================

// --------------------
// Map initialization
// --------------------
const map = L.map('map').setView([-37.8136, 144.9631], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

// -------------
// Global state
// -------------
const CSV_URL = '../parking-dataset/parking_results_for_comparison.csv';

// state we keep in memory
let lastRefreshed = null;                      // when we last pulled the CSV
let layerOfBays = L.layerGroup().addTo(map);  // current markers on map
let rowsAll = [];                              // all parsed rows
let currentFilteredRows = [];                  // rows after filters

// --------------------------------------------------------
// Utility: relative time formatter: like "3 minutes ago"
// --------------------------------------------------------
function getRelativeTime(dateObj) {
  if (!dateObj) return 'just now';
  const now = new Date();
  const diffMs = now - dateObj;
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);

  if (sec < 1) return 'just now';
  if (sec < 60) return `${sec} seconds ago`;
  if (min === 1) return '1 minute ago';
  if (min < 60) return `${min} minutes ago`;
  if (hr < 24) return `${hr} hours ago`;
  return `${Math.floor(hr / 24)} days ago`;
}

// ------------------------------------------
// main loader: grab the CSV and stash rows
// ------------------------------------------
function loadParking() {
  // Clear old markers from the map
  layerOfBays.clearLayers();

  Papa.parse(CSV_URL, {
    download: true,
    header: true,       // use the first row as keys
    dynamicTyping: true, // auto-convert numbers/booleans
    skipEmptyLines: true,
    complete: (result) => {
      lastRefreshed = new Date();

      // Filter out rows that don't have coordinates
      rowsAll = (result.data || []).filter(r =>
        r &&
        typeof r.latitude !== 'undefined' &&
        typeof r.longitude !== 'undefined' &&
        r.latitude !== null && r.longitude !== null &&
        r.latitude !== '' && r.longitude !== ''
      );

      // Render markers on the map
      rowsAll.forEach((row) => {
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
          <strong>Kerbside ID:</strong> ${row.KerbsideID ?? '-'}<br>
          <strong>Status:</strong> ${row.Status_Description ?? 'Unknown'}<br>
          <strong>Street:</strong> ${row.OnStreet ?? '-'}<br>
          <strong>Between:</strong> ${row.StreetFrom ?? '-'} and ${row.StreetTo ?? '-'}<br>
          <strong>Zone:</strong> ${row.Zone_Number ?? '-'}<br>
          <strong>Segment:</strong> ${row.RoadSegmentID ?? '-'}<br>
          <strong>Last updated:</strong> ${updated}
        `;
        marker.bindPopup(popupHtml);

        // Attach a reference so we can open popup from the list
        row.lat = lat;
        row.lng = lng;
        row.marker = marker;

        marker.addTo(layerOfBays);
      });

      // Update the side list with all rows initially
      currentFilteredRows = rowsAll.slice();
      updateList(currentFilteredRows);
    },
    error: (err) => {
      console.error('Failed to parse CSV:', err);
    }
  });
}

// --------------
// List & search
// --------------
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
      if (typeof row.lat === 'number' && typeof row.lng === 'number') {
        map.setView([row.lat, row.lng], 17);
        if (row.marker) row.marker.openPopup();
      }
    };

    list.appendChild(li);
  });
}

// Attach search & filter handlers
const searchInput = document.getElementById('searchBox');
const onlyAvailableCheckbox = document.getElementById('onlyAvailable');

// Apply both search term and "only available" filter
function applyFilters() {
  const term = (searchInput.value || '').toLowerCase();
  const onlyAvailable = onlyAvailableCheckbox.checked;

  currentFilteredRows = rowsAll.filter((row) => {
    const id = String(row.KerbsideID ?? '').toLowerCase();
    const status = String(row.Status_Description ?? '').toLowerCase();
    const street = String(row.OnStreet ?? '').toLowerCase();

    // 1) Search filter
    const matchesSearch =
      !term || id.includes(term) || status.includes(term) || street.includes(term);

    // 2) Availability filter (true = only show unoccupied)
    const matchesAvailability =
      !onlyAvailable || status === 'unoccupied'; // lowercase compare

    return matchesSearch && matchesAvailability;
  });

  updateList(currentFilteredRows);
}

if (searchInput) {
  searchInput.addEventListener('input', applyFilters);
}

if (onlyAvailableCheckbox) {
  onlyAvailableCheckbox.addEventListener('change', applyFilters);
}

// ----------------------------
// Kick off + 10s auto-refresh
// ----------------------------
loadParking();
setInterval(loadParking, 10000); // refresh every 10 seconds
