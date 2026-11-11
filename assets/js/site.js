/* WILD:CARE shared helpers. Loaded on every page after data/worksheets.js (where present). */
(function () {
  var base = document.documentElement.getAttribute('data-base') || '';
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
    if (s.pdf_en) out.push('<a href="' + esc(base + s.pdf_en) + '">English PDF</a>');
    if (s.pdf_it) out.push('<a href="' + esc(base + s.pdf_it) + '" hreflang="it">Italian PDF</a>');
    return out.join(' <span aria-hidden="true">/</span> ');
  }

  /* Kit lines placed in the pages: the static text is the fallback; the data file is the source. */
  document.querySelectorAll('[data-sheet]').forEach(function (el) {
    var s = byId[el.getAttribute('data-sheet')];
    if (!s) return;
    var l = el.querySelector('.kit-line'), t = el.querySelector('.kit-title');
    if (l && s.line_en) l.textContent = s.line_en;
    if (t) t.textContent = s.title_en;
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

  window.WC = {
    base: base, sheets: sheets, families: families, byId: byId, famById: famById,
    pool: sheets.filter(function (s) { return !s.oliveros; }),
    esc: esc, shuffle: shuffle, folds: folds, pdfLinks: pdfLinks
  };
})();
