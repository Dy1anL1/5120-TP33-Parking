// Initial Map
const map = L.map('map').setView([-37.8136, 144.9631], 14); // Melbourne coordinate

// Load Map（OpenStreetMap）
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// example, add a parking spot marker
L.marker([-37.814, 144.963]).addTo(map)
  .bindPopup('Parking Spot 1')
  .openPopup();
