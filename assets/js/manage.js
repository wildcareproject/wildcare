/* Sound manager for wildcareproject.org.
   Talks directly to GitHub with a personal token kept only in this browser.
   Every change is one commit: new files, deleted files and the updated lists together. */
(function () {
  'use strict';
  var REPO = 'wildcareproject/wildcare', BRANCH = 'main', API = 'https://api.github.com/repos/' + REPO;
  /* care/corpus.json is read only so that visitors' Care sounds are never listed as unused files */
  var PATHS = { walks: 'data/walks.js', listen: 'data/sounds.js', care: 'care/corpus.json' };
  var HEADS = {
    walks: '/* WALK: the chain of walks (anonymous; place and year). Managed from wildcareproject.org/manage/ */\nwindow.WILDCARE_WALKS = ',
    listen: '/* LISTEN: the sound map. Managed from wildcareproject.org/manage/ */\nwindow.WILDCARE_SOUNDS = '
  };
  var AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|webm)$/i;
  var WC = window.WC, A = window.WCAudio, $ = function (id) { return document.getElementById(id); };
  var token = '', state = null, cards = [], map = null, layer = null, pinTarget = null, busy = false;

  /* ---------- small helpers ---------- */
  function esc(t) { return WC.esc(t); }
  function say(t, bad) { var s = $('m-status'); s.textContent = t; s.className = bad ? 'm-status bad' : 'm-status'; }
  function mb(n) { return (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB'; }
  function mmss(s) { s = Math.round(s); return Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }
  function slug(s) { return String(s || 'sound').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sound'; }
  function rand4() { return Math.random().toString(36).slice(2, 6); }
  function b64ToText(b64) { var bin = atob(b64.replace(/\n/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
  function bytesToB64(bytes) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.readAsDataURL(new Blob([bytes])); }); }

  /* ---------- GitHub ---------- */
  function gh(method, path, body) {
    return fetch(API + path, { method: method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.ok) return r.status === 204 ? null : r.json();
      return r.text().then(function (t) { var e = new Error('GitHub answered ' + r.status + ' to ' + method + ' ' + path + ': ' + t.slice(0, 160)); e.status = r.status; throw e; });
    });
  }
  function parse(kind, text) {
    if (kind === 'care') return JSON.parse(text || '[]');
    var m = text.match(/=\s*\[/); if (!m) return [];
    return JSON.parse(text.slice(m.index + m[0].length - 1, text.lastIndexOf(']') + 1));
  }
  function serialize(kind, list) {
    if (kind === 'care') return JSON.stringify(list, null, 1) + '\n';
    return HEADS[kind] + '[\n' + list.map(function (x) { return JSON.stringify(x); }).join(',\n') + '\n];\n';
  }
  function readState() {
    var s = {};
    return gh('GET', '/git/ref/heads/' + BRANCH).then(function (ref) {
      s.head = ref.object.sha; return gh('GET', '/git/commits/' + s.head);
    }).then(function (c) {
      s.tree = c.tree.sha; return gh('GET', '/git/trees/' + s.tree + '?recursive=1');
    }).then(function (t) {
      s.files = t.tree.filter(function (x) { return x.type === 'blob'; });
      return Promise.all(Object.keys(PATHS).map(function (k) {
        var f = s.files.filter(function (x) { return x.path === PATHS[k]; })[0];
        if (!f) { s[k] = []; return; }
        return gh('GET', '/git/blobs/' + f.sha).then(function (b) { s[k] = parse(k, b64ToText(b.content)); });
      }));
    }).then(function () { return s; });
  }
  /* uploads: [{path, bytes}]; mutate(state) changes state.walks/listen/care and returns {changed:[kinds], remove:[paths]} */
  function commit(message, uploads, mutate) {
    var blobs = [], attempt = 0;
    function up(i) {
      if (i >= uploads.length) return Promise.resolve();
      say('Uploading ' + (i + 1) + ' of ' + uploads.length + ': ' + uploads[i].path.split('/').pop());
      return bytesToB64(uploads[i].bytes).then(function (b64) { return gh('POST', '/git/blobs', { content: b64, encoding: 'base64' }); })
        .then(function (r) { blobs.push({ path: uploads[i].path, sha: r.sha }); return up(i + 1); });
    }
    function tryOnce() {
      attempt++;
      return readState().then(function (s) {
        var res = mutate(s) || {}, entries = blobs.map(function (b) { return { path: b.path, mode: '100644', type: 'blob', sha: b.sha }; });
        (res.remove || []).forEach(function (p) { if (s.files.some(function (f) { return f.path === p; })) entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
        return Promise.all((res.changed || []).map(function (k) {
          return gh('POST', '/git/blobs', { content: serialize(k, s[k]), encoding: 'utf-8' }).then(function (r) { entries.push({ path: PATHS[k], mode: '100644', type: 'blob', sha: r.sha }); });
        })).then(function () {
          if (!entries.length) return null;
          return gh('POST', '/git/trees', { base_tree: s.tree, tree: entries })
            .then(function (t) { return gh('POST', '/git/commits', { message: message, tree: t.sha, parents: [s.head] }); })
            .then(function (c) { return gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: c.sha }); });
        });
      }).catch(function (e) {
        if ((e.status === 422 || e.status === 409) && attempt < 4) return tryOnce();   /* the repository moved meanwhile (e.g. a CARE contribution): redo on the new state */
        throw e;
      });
    }
    busy = true; lock(true);
    return up(0).then(tryOnce).then(function () { return refresh(); })
      .then(function () { say('Saved. The website updates in about a minute.'); })
      .catch(function (e) { say(e.message, true); throw e; })
      .finally(function () { busy = false; lock(false); });
  }
  function lock(on) { document.querySelectorAll('[data-lock]').forEach(function (b) { b.disabled = on || (b.dataset.lock === 'ready' && !readyCards().length); }); }

  /* ---------- connecting ---------- */
  function connect() {
    token = $('m-token').value.trim();
    if (!token) { say('Paste the token first.', true); return; }
    say('Connecting.');
    readState().then(function (s) {
      state = s;
      try { if ($('m-remember').checked) localStorage.setItem('wc-manage-token', token); else localStorage.removeItem('wc-manage-token'); } catch (x) {}
      $('m-login').hidden = true; $('m-app').hidden = false; say('Connected to ' + REPO + '.');
      initMap(); render();
    }, function (e) { say(e.status === 401 ? 'GitHub does not accept this token. Check that it is copied whole and has not expired.' : e.message, true); });
  }
  function refresh() { return readState().then(function (s) { state = s; render(); }); }
  $('m-connect').addEventListener('click', connect);
  $('m-token').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
  $('m-forget').addEventListener('click', function () { try { localStorage.removeItem('wc-manage-token'); } catch (x) {} token = ''; location.reload(); });
  try { var saved = localStorage.getItem('wc-manage-token'); if (saved) { $('m-token').value = saved; $('m-remember').checked = true; connect(); } } catch (x) {}

  /* ---------- map ---------- */
  function initMap() {
    if (map) return;
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = WC.base + 'assets/vendor/leaflet-1.9.4/leaflet.css'; document.head.appendChild(css);
    map = L.map('m-map', { scrollWheelZoom: true }).setView([46.5, 11], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', function (e) {
      if (!pinTarget) return;
      pinTarget.set(+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5));
      pinTarget = null; $('m-map').classList.remove('pinning'); $('m-pinhint').textContent = '';
      drawPins();
    });
  }
  var icon = function (cls) { return L.divIcon({ className: '', html: '<div class="pin ' + cls + '"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }); };
  function drawPins() {
    if (!layer) return; layer.clearLayers();
    (state ? state.listen : []).forEach(function (s) { L.marker([s.lat, s.lng], { icon: icon(''), title: s.title }).addTo(layer).bindTooltip(s.title); });
    cards.forEach(function (c) { if (c.dest === 'listen' && c.lat != null) L.marker([c.lat, c.lng], { icon: icon('new'), title: c.file.name }).addTo(layer).bindTooltip('New: ' + (c.f.title || c.file.name)); });
  }
  function askPin(label, set) {
    pinTarget = { set: set }; $('m-map').classList.add('pinning');
    $('m-pinhint').textContent = 'Click on the map where "' + label + '" was recorded.';
    $('m-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- adding sounds ---------- */
  $('m-files').addEventListener('change', function () { Array.prototype.forEach.call(this.files, addCard); this.value = ''; });
  var drop = $('m-drop');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); Array.prototype.forEach.call(e.dataTransfer.files, addCard); });

  function addCard(file) {
    var c = { id: 'c' + Math.random().toString(36).slice(2, 8), file: file, dest: '', f: {}, src: null, mp3: null, lat: null, lng: null, status: 'Reading the file.' };
    cards.push(c); renderCards();
    A.decode(file).then(function (src) {
      c.src = src; c.status = 'Converting.'; renderCards();
      return A.encode(src.ch, null, function (p) { c.status = 'Converting ' + Math.round(p * 100) + '%.'; updateStatus(c); });
    }).then(function (mp3) {
      c.mp3 = mp3; c.url = URL.createObjectURL(new Blob([mp3.bytes], { type: 'audio/mpeg' }));
      c.status = mmss(mp3.dur) + ', ' + (mp3.channels === 1 ? 'mono' : 'stereo') + ', MP3 ' + mp3.kbps + ' kbps: ' + mb(mp3.bytes.length) + ' (was ' + mb(file.size) + ').';
      renderCards();
    }).catch(function (e) { c.status = 'This file could not be read' + (e && e.code && e.message ? ' (' + e.message + ')' : '') + '. Save it as MP3, WAV or M4A and try again.'; c.failed = true; renderCards(); });
  }
  function updateStatus(c) { var el = document.querySelector('#' + c.id + ' .c-status'); if (el) el.textContent = c.status; }
  function isReady(c) {
    if (!c.mp3) return false;
    if (c.dest === 'walk') return !!(c.f.place && /^\d{4}$/.test(c.f.year || ''));
    if (c.dest === 'listen') return !!(c.f.title && c.lat != null);
    return false;
  }
  function readyCards() { return cards.filter(isReady); }
  function field(c, k, label, opt, attrs) {
    return '<p class="field"><label for="' + c.id + '-' + k + '">' + label + (opt ? ' <span>(optional)</span>' : '') + '</label><input id="' + c.id + '-' + k + '" data-k="' + k + '" value="' + esc(c.f[k] || '') + '" ' + (attrs || '') + '></p>';
  }
  function renderCards() {
    var ul = $('m-cards');
    ul.innerHTML = cards.map(function (c) {
      var h = '<li class="m-card" id="' + c.id + '"><div class="c-head"><b>' + esc(c.file.name) + '</b><button type="button" class="textbtn c-remove">Remove</button></div>' +
        '<p class="c-status">' + esc(c.status) + '</p>';
      if (c.mp3) {
        h += '<audio controls preload="none" src="' + c.url + '"></audio>' +
          '<fieldset class="c-dest"><legend>Where does it go?</legend>' +
          ['walk', 'listen'].map(function (d) { return '<label><input type="radio" name="' + c.id + '-d" value="' + d + '"' + (c.dest === d ? ' checked' : '') + '> ' + { walk: 'Walk', listen: 'Listen (map)' }[d] + '</label>'; }).join('') + '</fieldset>';
        if (c.dest === 'walk') h += field(c, 'place', 'Place') + field(c, 'year', 'Year', false, 'inputmode="numeric" maxlength="4" placeholder="2024"');
        if (c.dest === 'listen') h += field(c, 'title', 'Title') + field(c, 'place', 'Place', true) + field(c, 'date', 'Date', true, 'type="date"') +
          '<p class="field"><label for="' + c.id + '-description">Description <span>(optional)</span></label><textarea id="' + c.id + '-description" data-k="description" rows="2">' + esc(c.f.description || '') + '</textarea></p>' +
          '<p class="c-pin">' + (c.lat != null ? 'Pinned at ' + c.lat + ', ' + c.lng + '. ' : 'Not pinned yet. ') + '<button type="button" class="btn ghost c-pinbtn">' + (c.lat != null ? 'Move the pin' : 'Place on the map') + '</button></p>';
      }
      return h + (isReady(c) ? '<p class="c-ok">Ready to publish.</p>' : '') + '</li>';
    }).join('');
    $('m-publish').textContent = 'Publish ' + readyCards().length + ' sound' + (readyCards().length === 1 ? '' : 's');
    lock(busy); drawPins();
  }
  $('m-cards').addEventListener('click', function (e) {
    var li = e.target.closest('.m-card'); if (!li) return; var c = cards.filter(function (x) { return x.id === li.id; })[0];
    if (e.target.closest('.c-remove')) { cards.splice(cards.indexOf(c), 1); renderCards(); }
    if (e.target.closest('.c-pinbtn')) askPin(c.f.title || c.file.name, function (la, ln) { c.lat = la; c.lng = ln; renderCards(); });
  });
  $('m-cards').addEventListener('change', function (e) {
    var li = e.target.closest('.m-card'); if (!li) return; var c = cards.filter(function (x) { return x.id === li.id; })[0];
    if (e.target.name === c.id + '-d') { c.dest = e.target.value; renderCards(); }
  });
  $('m-cards').addEventListener('input', function (e) {
    var li = e.target.closest('.m-card'); if (!li || !e.target.dataset.k) return; var c = cards.filter(function (x) { return x.id === li.id; })[0];
    c.f[e.target.dataset.k] = e.target.value.trim();
    var ok = li.querySelector('.c-ok'); if (isReady(c) && !ok) li.insertAdjacentHTML('beforeend', '<p class="c-ok">Ready to publish.</p>'); if (!isReady(c) && ok) ok.remove();
    $('m-publish').textContent = 'Publish ' + readyCards().length + ' sound' + (readyCards().length === 1 ? '' : 's'); lock(busy);
  });
  $('m-publish').addEventListener('click', function () {
    var ready = readyCards(); if (!ready.length) return;
    var uploads = [], add = { walks: [], listen: [] };
    ready.forEach(function (c) {
      var r = rand4();
      if (c.dest === 'walk') {
        var p = 'audio/walks/' + slug(c.f.place) + '-' + c.f.year + '-' + r + '.mp3';
        uploads.push({ path: p, bytes: c.mp3.bytes });
        add.walks.push({ file: p, place: c.f.place, year: c.f.year, duration: Math.round(c.mp3.dur) });
      } else {
        var q = 'audio/listen/' + slug(c.f.title) + '-' + r + '.mp3';
        uploads.push({ path: q, bytes: c.mp3.bytes });
        var e = { title: c.f.title, lat: c.lat, lng: c.lng, file: q, duration: Math.round(c.mp3.dur) };
        ['date', 'place', 'description'].forEach(function (k) { if (c.f[k]) e[k] = c.f[k]; });
        add.listen.push(e);
      }
    });
    commit('Manager: ' + ready.length + ' new sound' + (ready.length > 1 ? 's' : ''), uploads, function (s) {
      s.walks = s.walks.concat(add.walks); s.listen = s.listen.concat(add.listen);
      return { changed: Object.keys(add).filter(function (k) { return add[k].length; }) };
    }).then(function () { cards = cards.filter(function (c) { return ready.indexOf(c) < 0; }); renderCards(); }, function () {});
  });

  /* ---------- what is on the site ---------- */
  function used() { var u = {}; ['walks', 'listen', 'care'].forEach(function (k) { state[k].forEach(function (x) { u[x.file] = true; }); }); return u; }
  function sizeOf(path) { var f = state.files.filter(function (x) { return x.path === path; })[0]; return f ? mb(f.size) : 'missing file'; }
  function render() {
    if (!state) return;
    $('m-walks').innerHTML = state.walks.length ? state.walks.map(function (w, i) {
      return '<li data-kind="walks" data-i="' + i + '"><div class="i-main"><b>' + esc(w.place) + '</b>, ' + esc(w.year) + (w.duration ? ', ' + mmss(w.duration) : '') + ' <span class="i-size">' + sizeOf(w.file) + '</span></div>' +
        '<audio controls preload="none" src="' + esc(WC.base + w.file) + '"></audio><div class="i-actions"><button type="button" class="textbtn i-edit">Edit</button><button type="button" class="textbtn i-del">Delete</button></div></li>';
    }).join('') : '<li class="empty">No walks.</li>';
    $('m-listen').innerHTML = state.listen.length ? state.listen.map(function (s, i) {
      return '<li data-kind="listen" data-i="' + i + '"><div class="i-main"><b>' + esc(s.title) + '</b>' + [s.place, s.date].filter(Boolean).map(function (x) { return ', ' + esc(x); }).join('') + ' <span class="i-size">' + s.lat + ', ' + s.lng + '. ' + sizeOf(s.file) + '</span></div>' +
        (s.description ? '<p class="i-desc">' + esc(s.description) + '</p>' : '') +
        '<audio controls preload="none" src="' + esc(WC.base + s.file) + '"></audio><div class="i-actions"><button type="button" class="textbtn i-edit">Edit</button><button type="button" class="textbtn i-pin">Move the pin</button><button type="button" class="textbtn i-del">Delete</button></div></li>';
    }).join('') : '<li class="empty">No recordings on the map.</li>';
    var u = used(), loose = state.files.filter(function (f) { return AUDIO_EXT.test(f.path) && !u[f.path]; });
    $('m-loose').innerHTML = loose.length ? loose.map(function (f) { return '<li><label><input type="checkbox" value="' + esc(f.path) + '"> ' + esc(f.path) + ' <span class="i-size">' + mb(f.size) + '</span></label></li>'; }).join('') : '<li class="empty">None.</li>';
    $('m-loose-del').hidden = !loose.length;
    var total = state.files.reduce(function (a, f) { return a + (f.size || 0); }, 0);
    $('m-usage').textContent = 'The repository holds ' + mb(total) + ' of the 1 GB GitHub allows for a website.';
    $('m-count-walks').textContent = state.walks.length; $('m-count-listen').textContent = state.listen.length;
    drawPins();
  }
  var EDIT = {
    walks: [['place', 'Place'], ['year', 'Year']],
    listen: [['title', 'Title'], ['place', 'Place'], ['date', 'Date (YYYY-MM-DD)'], ['description', 'Description']]
  };
  document.querySelector('.m-lists').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-kind]'); if (!li || busy) return;
    var kind = li.dataset.kind, i = +li.dataset.i, item = state[kind][i], key = item.file;
    var find = function (s) { return s[kind].filter(function (x) { return x.file === key; })[0]; };
    if (e.target.closest('.i-del')) {
      var name = item.title || item.place || key;
      if (!confirm('Delete "' + name + '" from the website? The sound file is deleted too.')) return;
      commit('Manager: deleted ' + name, [], function (s) { s[kind] = s[kind].filter(function (x) { return x.file !== key; }); return { changed: [kind], remove: [key] }; }).catch(function () {});
    }
    if (e.target.closest('.i-edit')) {
      if (li.querySelector('.i-form')) return;
      li.insertAdjacentHTML('beforeend', '<div class="i-form">' + EDIT[kind].map(function (f) { return '<p class="field"><label>' + f[1] + '<input data-k="' + f[0] + '" value="' + esc(item[f[0]] || '') + '"></label></p>'; }).join('') +
        '<div class="btn-row"><button type="button" class="btn i-save">Save</button><button type="button" class="btn ghost i-cancel">Cancel</button></div></div>');
    }
    if (e.target.closest('.i-cancel')) li.querySelector('.i-form').remove();
    if (e.target.closest('.i-save')) {
      var vals = {}; li.querySelectorAll('.i-form input').forEach(function (inp) { vals[inp.dataset.k] = inp.value.trim(); });
      if (kind === 'walks' && (!vals.place || !/^\d{4}$/.test(vals.year))) { say('A walk needs a place and a four-digit year.', true); return; }
      if (kind === 'listen' && !vals.title) { say('A recording on the map needs a title.', true); return; }
      commit('Manager: edited ' + (vals.title || vals.place || key), [], function (s) {
        var x = find(s); if (!x) return {}; Object.keys(vals).forEach(function (k) { if (vals[k]) x[k] = vals[k]; else delete x[k]; }); return { changed: [kind] };
      }).catch(function () {});
    }
    if (e.target.closest('.i-pin')) askPin(item.title, function (la, ln) {
      commit('Manager: moved the pin of ' + item.title, [], function (s) { var x = find(s); if (!x) return {}; x.lat = la; x.lng = ln; return { changed: ['listen'] }; }).catch(function () {});
    });
  });
  $('m-loose-del').addEventListener('click', function () {
    var paths = Array.prototype.map.call(document.querySelectorAll('#m-loose input:checked'), function (x) { return x.value; });
    if (!paths.length) { say('Tick the files to delete first.', true); return; }
    if (!confirm('Delete ' + paths.length + ' file' + (paths.length > 1 ? 's' : '') + ' from the repository?')) return;
    commit('Manager: deleted ' + paths.length + ' unused file' + (paths.length > 1 ? 's' : ''), [], function () { return { remove: paths }; }).catch(function () {});
  });
  $('m-loose-all').addEventListener('click', function () { document.querySelectorAll('#m-loose input').forEach(function (x) { x.checked = true; }); });
  window.addEventListener('beforeunload', function (e) { if (busy || cards.some(function (c) { return c.mp3; })) { e.preventDefault(); e.returnValue = ''; } });
})();
