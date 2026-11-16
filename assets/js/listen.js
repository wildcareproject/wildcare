/* LISTEN: the sound map. Every recording is reached through its pin.
   Leaflet 1.9.4 is stored on the site; the map images come from OpenStreetMap.
   Keyboard: Tab reaches each pin, Enter opens it, Tab again reaches the player. */
(function () {
  var WC = window.WC, sounds = window.WILDCARE_SOUNDS || [], mapEl = document.getElementById('map');
  function fmt(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  if (!sounds.length) document.getElementById('listen-empty').hidden = false;

  var map = L.map(mapEl, { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var icon = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });
  sounds.forEach(function (s) {
    var where = [s.place, s.date ? fmt(s.date) : ''].filter(Boolean).map(WC.esc).join(', ');
    L.marker([s.lat, s.lng], { icon: icon, title: s.title, alt: s.title, keyboard: true }).addTo(map)
      .bindPopup('<strong>' + WC.esc(s.title) + '</strong>' + (where ? '<br>' + where : '') + (s.description ? '<br>' + WC.esc(s.description) : '') +
        '<br><audio controls preload="none" src="' + WC.esc(WC.base + s.file) + '" aria-label="Play ' + WC.esc(s.title) + '"></audio>', { minWidth: 300 });
  });
  if (sounds.length > 1) map.fitBounds(L.latLngBounds(sounds.map(function (s) { return [s.lat, s.lng]; })), { padding: [40, 40] });
  else if (sounds.length === 1) map.setView([sounds[0].lat, sounds[0].lng], 12);
  else map.setView([46.5, 11], 5);
  /* only one recording at a time, also across popups */
  map.on('popupclose', function (e) { var a = e.popup.getElement() && e.popup.getElement().querySelector('audio'); if (a) a.pause(); });
})();
