/* WILD:CARE shared helpers. Loaded on every page after data/worksheets.js (where present). */
(function () {
  var base = document.documentElement.getAttribute('data-base') || '';
  /* language of the page: Italian pages live under /it/ and carry lang="it" */
  var lang = document.documentElement.lang === 'it' ? 'it' : 'en';
  function T(en, it) { return lang === 'it' ? it : en; }
  var PLAYERS = { 'Solo': 'Da soli', 'Pair': 'In coppia', 'Group': 'In gruppo', 'Solo or group': 'Da soli o in gruppo' };
  function title(s) { return lang === 'it' ? (s.title_it || s.title_en) : s.title_en; }
  function line(s) { return lang === 'it' ? (s.line_it || s.line_en) : s.line_en; }
  function players(s) { return lang === 'it' ? (PLAYERS[s.players] || s.players) : s.players; }
  function famName(f) { return lang === 'it' ? (f.name_it || f.name) : f.name; }
  var sheets = window.WILDCARE_SHEETS || [];
  var families = window.WILDCARE_FAMILIES || [];
  var byId = {}, famById = {};
  sheets.forEach(function (s) { byId[s.id] = s; });
  families.forEach(function (f) { famById[f.id] = f; });

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /* fold lines drawn the way each family of sheets is folded (approximation for the screen) */
  function folds(kind) {
    var L = {
      'triangle': [[0, 0, 100, 100], [100, 0, 0, 100]],
      'rect-large': [[50, 0, 50, 100], [0, 50, 100, 50]],
      'rect-narrow': [[25, 0, 25, 100], [50, 0, 50, 100], [75, 0, 75, 100]],
      'rect-small': [[0, 33.3, 100, 33.3], [0, 66.6, 100, 66.6], [50, 0, 50, 100]],
      'square': [[50, 0, 50, 100], [0, 50, 100, 50]]
    }[kind] || [];
    return '<svg class="folds" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      L.map(function (l) {
        return '<line x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] +
          '" stroke="#111111" stroke-width="1.2" stroke-dasharray="7 4" vector-effect="non-scaling-stroke"/>';
      }).join('') + '</svg>';
  }
  function pdfLinks(s) {
    var out = [];
    if (s.pdf_en) out.push('<a href="' + esc(base + s.pdf_en) + '" hreflang="en">' + T('English PDF', 'PDF in inglese') + '</a>');
    if (s.pdf_it) out.push('<a href="' + esc(base + s.pdf_it) + '" hreflang="it">' + T('Italian PDF', 'PDF in italiano') + '</a>');
    return out.join(' <span aria-hidden="true">/</span> ');
  }

  /* Kit lines placed in the pages: the static text is the fallback; the data file is the source. */
  document.querySelectorAll('[data-sheet]').forEach(function (el) {
    var s = byId[el.getAttribute('data-sheet')];
    if (!s) return;
    var l = el.querySelector('.kit-line'), t = el.querySelector('.kit-title');
    if (l && line(s)) l.textContent = line(s);
    if (t) t.textContent = title(s);
  });

  /* one recording at a time (the Walk chain manages its own pair of players) */
  document.addEventListener('play', function (e) {
    var chain = e.target.hasAttribute && e.target.hasAttribute('data-chain');
    document.querySelectorAll('audio').forEach(function (a) {
      if (a === e.target) return;
      if (chain && a.hasAttribute('data-chain')) return;
      a.pause();
    });
    if (!chain && window.WC_pauseChain) window.WC_pauseChain();
  }, true);


  /* hide the EU emblem box if the image is missing (replaces an inline handler blocked by the security policy) */
  var eu = document.querySelector('.eu-box img');
  if (eu) { var hideEU = function () { eu.parentNode.hidden = true; }; if (eu.complete && !eu.naturalWidth) hideEU(); else eu.addEventListener('error', hideEU); }
  /* the ITA | ENG switch keeps the drawn instruction (#id) when changing language */
  document.querySelectorAll('.lang a').forEach(function (a) {
    a.addEventListener('click', function () { if (location.hash) a.href = a.href.split('#')[0] + location.hash; });
  });

  window.WC = {
    lang: lang, T: T, title: title, line: line, players: players, famName: famName,
    base: base, sheets: sheets, families: families, byId: byId, famById: famById,
    pool: sheets.filter(function (s) { return !s.oliveros; }),
    esc: esc, shuffle: shuffle, folds: folds, pdfLinks: pdfLinks
  };
})();
