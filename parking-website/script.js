/* =====================================================================
      script.js
          - loads a CSV (Papa Parse)
          - draws points with Leaflet
          - supports search + "Only show available" filter
          - refreshes every 10s
   ===================================================================== */

/* --------------------
    Map initialization
   -------------------- */
const map = L.map('map').setView([-37.8136, 144.9631], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

/* --------------
    Global state
   -------------- */
const CSV_URL = '../parking-dataset/parking_results_for_comparison.csv';

// state we keep in memory
let lastRefreshed = null;                      // when we last pulled the CSV
let layerOfBays = L.layerGroup().addTo(map);   // current markers on map
let rowsAll = [];                              // all parsed rows
let currentFilteredRows = [];                  // rows after filters

// Layer to hold the prediction grid polygons
let predictionLayer = L.layerGroup().addTo(map);

let dataReady = false;

/* --------------------------------------------------------
    Utility: relative time formatter: like "3 minutes ago"
   -------------------------------------------------------- */
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

// approx meters per degree at Melbourne latitude (~111,111 m/deg for lat; lon scaled by cos(lat))
function latMetersToDeg(m) {
  return m / 111111;
}
function lonMetersToDeg(m, latDeg) {
  return m / (111111 * Math.cos(latDeg * Math.PI / 180));
}

// classify by unoccupied ratio
function getAvailabilityLevel(ratio) {
  if (ratio === null) return 'na';
  if (ratio > 0.5) return 'high';
  if (ratio >= 0.2) return 'mid';
  return 'low';
}

function getLevelColor(level) {
  if (level === 'high') return '#3cb371'; // green
  if (level === 'mid')  return '#ffd166'; // yellow
  if (level === 'low')  return '#ef476f'; // red
  return '#cccccc';                       // grey (no data)
}

/* -------------------------------------------------------------------------------
    Build a 3x3 grid centered at (destLat, destLon). Each cell ~300m.
    For each cell, compute unoccupied ratio using rowsAll (current CSV snapshot).
    Draw colored rectangles and bind popups with counts and ratio.
   ------------------------------------------------------------------------------- */
function drawPredictionGrid(centerLat, centerLon) {
  // Clear previous prediction overlays
  predictionLayer.clearLayers();

  const cellSizeM = 300;   // each cell ~300 meters
  const halfGrid = 1;      // 3x3 grid => offsets = -1, 0, +1
  const dLat = latMetersToDeg(cellSizeM);
  const dLon = lonMetersToDeg(cellSizeM, centerLat);

  // Grid center aligned to destination
  for (let gx = -halfGrid; gx <= halfGrid; gx++) {
    for (let gy = -halfGrid; gy <= halfGrid; gy++) {
      const lat1 = centerLat + gy * dLat;
      const lat2 = centerLat + (gy + 1) * dLat;
      const lon1 = centerLon + gx * dLon;
      const lon2 = centerLon + (gx + 1) * dLon;

      // gather bays in this cell
      let totalCount = 0;
      let freeCount = 0;

      rowsAll.forEach(row => {
        const lat = Number(row.latitude);
        const lon = Number(row.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lon)) return;
        if (lat >= Math.min(lat1, lat2) && lat <= Math.max(lat1, lat2) &&
            lon >= Math.min(lon1, lon2) && lon <= Math.max(lon1, lon2)) {
          totalCount++;
          const status = String(row.Status_Description || '').trim().toLowerCase();
          if (status === 'unoccupied') freeCount++;
        }
      });

      const ratio = totalCount > 0 ? freeCount / totalCount : null;
      const level = getAvailabilityLevel(ratio);
      const color = getLevelColor(level);

      // draw rectangle cell
      const rect = L.rectangle(
        [
          [Math.min(lat1, lat2), Math.min(lon1, lon2)],
          [Math.max(lat1, lat2), Math.max(lon1, lon2)]
        ],
        {
          color: '#666',
          weight: 1,
          fillColor: color,
          fillOpacity: 0.35
        }
      );

      const percentText = ratio === null ? '-' : `${Math.round(ratio * 100)}%`;
      rect.bindPopup(
        `<strong>Availability:</strong> ${level.toUpperCase()}<br>` +
        `<strong>Free bays:</strong> ${freeCount} / ${totalCount} (${percentText})`
      );

      rect.addTo(predictionLayer);
    }
  }
}

/* ----------------------------------------
    Use Haversine function to get distance
   ---------------------------------------- */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // earth radius in m
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Geocode with Nominatim (returns {lat, lon} or null)
async function geocodeAddress(q) {
  // Viewbox = [left,top,right,bottom] in lon,lat
  // This box roughly covers inner Melbourne (adjust if needed)
  const left   = 144.90;  // min lon
  const right  = 145.05;  // max lon
  const top    = -37.70;  // max lat (less negative = further north)
  const bottom = -38.10;  // min lat (more negative = further south)
  
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=json` +
    `&limit=1` +
    `&addressdetails=0` +
    `&countrycodes=au` +                               // restrict to Australia
    `&viewbox=${left},${top},${right},${bottom}` +     // Melbourne-ish bounding box
    `&bounded=1` +                                     // results must be inside the viewbox
    `&q=${encodeURIComponent(q + ' Melbourne')}`;      // bias the query to Melbourne

  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

let lastHighlight = null; // remember the highlighted marker to reset its style

// Find nearest unoccupied bay from dest coords, highlight on map
function findNearestFromDestination(destLat, destLon) {
  // pick only unoccupied rows that have a marker
  const candidates = rowsAll.filter(r => {
    const status = String(r.Status_Description ?? '').toLowerCase().trim();
    return status === 'unoccupied' && r.marker && typeof r.lat === 'number' && typeof r.lng === 'number';
  });

  if (candidates.length === 0) {
    alert('No available bays found at the moment.');
    return;
  }

  // compute distances
  let best = null;
  let bestDist = Infinity;
  candidates.forEach(r => {
    const d = haversineMeters(destLat, destLon, r.lat, r.lng);
    if (d < bestDist) { bestDist = d; best = r; }
  });

  if (!best) {
    alert('No result found.');
    return;
  }

  // reset previous highlight
  if (lastHighlight && lastHighlight.marker) {
    lastHighlight.marker.setStyle({ radius: 6, weight: 1 });
  }

  // style + focus the nearest
  best.marker.setStyle({ radius: 10, weight: 3 }); // simple visual highlight
  lastHighlight = best;

  // move map and open popup
  map.setView([best.lat, best.lng], 17);
  best.marker.openPopup();
}

// Render markers for the given rows: clears the layer and re-adds only those rows' markers
function renderMarkers(rows) {
  layerOfBays.clearLayers();
  rows.forEach((row) => {
    if (row.marker) row.marker.addTo(layerOfBays);
  });
}

/* ------------------------------------------
    main loader: grab the CSV and stash rows
   ------------------------------------------ */
function loadParking() {
  // Clear old markers from the map
  layerOfBays.clearLayers();

  Papa.parse(`${CSV_URL}?t=${Date.now()}`, {
    download: true,
    header: true,         // use the first row as keys
    dynamicTyping: true,  // auto-convert numbers/booleans
    skipEmptyLines: true,
    complete: (result) => {
      console.log('CSV loaded rows:', result.data?.length);
      
      lastRefreshed = new Date();

      // keep only rows that have coordinates
      rowsAll = (result.data || []).filter(r =>
        r &&
        typeof r.latitude !== 'undefined' &&
        typeof r.longitude !== 'undefined' &&
        r.latitude !== null && r.longitude !== null &&
        r.latitude !== '' && r.longitude !== ''
      );

      // Render markers on the map (filtered if checkbox is ticked)
      rowsAll.forEach((row) => {
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        const isOccupied = String(row.Status_Description || '').trim().toLowerCase() === 'present';
        const color = isOccupied ? 'red' : 'green';

        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          color
        });

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

        row.lat = lat;
        row.lng = lng;
        row.marker = marker;
      });

      // Update the side list with all rows initially
      currentFilteredRows = rowsAll.slice();
      applyFilters();  // this will update both the LIST and the MAP

      dataReady = true;
    },
    error: (err) => {
      console.error('Failed to parse CSV:', err);
      alert('Failed to load parking CSV. Check server root and CSV path.');
    }
  });
}

/* --------------
    List & search
   -------------- */
function updateList(rows) {
  const list = document.getElementById('parkingList');
  if (!list) return;
  list.innerHTML = '';

  // keep the list short for readability
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

const destInput = document.getElementById('destInput');
const destBtn = document.getElementById('destBtn');

if (destBtn) {
  destBtn.addEventListener('click', async () => {
    if (!dataReady) {
      alert('Data is still loading. Please try again in a moment.');
      return;
    }
    if (!rowsAll || rowsAll.length === 0) {
      alert('No parking data loaded. Please check the CSV path or try refreshing.');
      return;
    }
    
    const q = (destInput.value || '').trim();
    if (!q) {
      alert('Please enter a destination.');
      return;
    }
    // 1) geocode destination
    const pt = await geocodeAddress(q);
    if (!pt) {
      alert('Destination not found. Try a more specific address.');
      return; 
    }
    // 2) drop a small marker for destination (optional)
    L.circleMarker([pt.lat, pt.lon], { radius: 6, color: '#0066ff' })
      .addTo(layerOfBays)
      .bindPopup('Destination')
      .openPopup();

    // 3) find nearest unoccupied bay
    findNearestFromDestination(pt.lat, pt.lon);
    drawPredictionGrid(pt.lat, pt.lon);
  });
}

// Attach search & filter
const searchInput = document.getElementById('searchBox');
const onlyAvailableCheckbox = document.getElementById('onlyAvailable');

// Call filters when user types or toggles the checkbox
if (searchInput) {
  searchInput.addEventListener('input', applyFilters);
}
if (onlyAvailableCheckbox) {
  onlyAvailableCheckbox.addEventListener('change', applyFilters);
}

// Apply both search term and "only available" filter
function applyFilters() {
  const term = (searchInput.value || '').toLowerCase();
  const onlyAvailable = onlyAvailableCheckbox.checked;

  currentFilteredRows = rowsAll.filter((row) => {
    const id = String(row.KerbsideID ?? '').toLowerCase().trim();
    const status = String(row.Status_Description ?? '').toLowerCase().trim();
    const street = String(row.OnStreet ?? '').toLowerCase().trim();

    // Search filter
    const matchesSearch = !term || id.includes(term) || status.includes(term) || street.includes(term);

    // Availability filter
    const matchesAvailability = !onlyAvailable || status === 'unoccupied'; // show only free bays if checked

    return matchesSearch && matchesAvailability;
  });

  renderMarkers(currentFilteredRows);
  updateList(currentFilteredRows);
}

/* ----------------------------------
    initial pull + refresh every 10s
   ---------------------------------- */
loadParking();
setInterval(loadParking, 10000); // refresh every 10 seconds
