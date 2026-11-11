/* LISTEN: the sound map. The list is always there; the map loads only when asked
   (its images come from OpenStreetMap's servers). Leaflet 1.9.4 is stored on the site. */
(function () {
  var WC = window.WC, sounds = window.WILDCARE_SOUNDS || [], ul = document.getElementById('sounds');
  function fmt(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function dur(s) { var m = Math.floor(s / 60), r = s % 60; return m + ' min' + (r ? ' ' + r + ' s' : ''); }
  function meta(s) {
    var bits = [s.place, fmt(s.date), dur(s.duration)].filter(Boolean).join(', ');
    return bits + '. ' + (s.author ? 'Recorded by ' + WC.esc(s.author) + '. ' : '') + 'From the ' + WC.esc(s.origin) + ' archive.';
  }
  var order = sounds.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  ul.innerHTML = order.map(function (s, i) {
    var id = 'rec-' + i;
    s._id = id;
    return '<li id="' + id + '"><h3>' + WC.esc(s.title) + '</h3><p class="meta">' + meta(s) + '</p>' +
      '<p>' + WC.esc(s.description) + '</p>' +
      '<audio controls preload="none" src="' + WC.esc(WC.base + s.file) + '" aria-label="Play ' + WC.esc(s.title) + '"></audio>' +
      '<p style="margin:6px 0 0"><button type="button" class="textbtn show-on-map" data-i="' + i + '" hidden>Show on the map</button></p></li>';
  }).join('');

  var btn = document.getElementById('map-load'), mapEl = document.getElementById('map'), map = null, markers = [];
  function load(src, isCss) {
    return new Promise(function (res, rej) {
      var el = document.createElement(isCss ? 'link' : 'script');
      if (isCss) { el.rel = 'stylesheet'; el.href = src; } else { el.src = src; }
      el.onload = res; el.onerror = rej; document.head.appendChild(el);
    });
  }
  btn.addEventListener('click', function () {
    btn.disabled = true; btn.textContent = 'Loading the map';
    var v = WC.base + 'assets/vendor/leaflet-1.9.4/';
    Promise.all([load(v + 'leaflet.css', true), load(v + 'leaflet.js')]).then(function () {
      document.getElementById('consent').hidden = true;
      mapEl.classList.add('on');
      map = L.map(mapEl, { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      var icon = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });
      order.forEach(function (s) {
        var m = L.marker([s.lat, s.lng], { icon: icon, title: s.title, alt: s.title, keyboard: true }).addTo(map);
        m.bindPopup('<strong>' + WC.esc(s.title) + '</strong><br>' + fmt(s.date) + '<br>' + WC.esc(s.description) +
          '<br><audio controls preload="none" src="' + WC.esc(WC.base + s.file) + '"></audio>');
        markers.push(m);
      });
      map.fitBounds(L.latLngBounds(order.map(function (s) { return [s.lat, s.lng]; })), { padding: [30, 30] });
      document.querySelectorAll('.show-on-map').forEach(function (b) { b.hidden = false; });
      mapEl.setAttribute('aria-label', 'Map of the recordings. Each pin opens the recording and its description.');
    }, function () { btn.disabled = false; btn.textContent = 'The map could not load. Try again'; });
  });
  ul.addEventListener('click', function (e) {
    var b = e.target.closest('.show-on-map'); if (!b || !map) return;
    var i = +b.dataset.i, s = order[i];
    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.setView([s.lat, s.lng], 16); markers[i].openPopup();
  });
})();
