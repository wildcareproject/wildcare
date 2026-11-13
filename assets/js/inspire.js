/* INSPIRE: draw one Kit instruction. Each sheet comes up once before any repeats. */
(function () {
  var WC = window.WC, out = document.getElementById('drawn'), btn = document.getElementById('draw'),
      copy = document.getElementById('copy'), status = document.getElementById('copy-status');
  var bag = [];
  function next() {
    if (!bag.length) bag = WC.shuffle(WC.pool);
    return bag.pop();
  }
  function show(s, animate) {
    var f = WC.famById[s.family];
    out.innerHTML =
      '<article class="sheet' + (animate ? ' unfold' : '') + '" style="--paper:' + f.color + '" aria-labelledby="drawn-title">' +
      '<p class="fam">' + WC.esc(f.name) + '</p>' +
      '<h2 class="title" id="drawn-title">' + WC.esc(s.title_en) + '</h2>' +
      '<p class="line">' + WC.esc(s.line_en) + '</p>' +
      '<p class="orig" lang="it"><b>' + WC.esc(s.title_it) + '.</b> ' + WC.esc(s.line_it) + '</p>' +
      '<p class="meta">' + WC.esc(s.players) + (WC.pdfLinks(s) ? '. ' + WC.pdfLinks(s) : '.') + '</p>' +
      '</article>';
    if (history.replaceState) history.replaceState(null, '', '#' + s.id);
    btn.textContent = 'Draw another instruction';
    copy.hidden = false; status.textContent = '';
  }
  btn.addEventListener('click', function () {
    var s = next();
    show(s, true);
    document.getElementById('drawn-title').setAttribute('tabindex', '-1');
    document.getElementById('drawn-title').focus({ preventScroll: true });
  });
  copy.addEventListener('click', function () {
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { status.textContent = 'Link copied.'; },
        function () { status.textContent = url; });
    } else { status.textContent = url; }
  });
  var h = decodeURIComponent(location.hash.slice(1));
  var start = WC.pool.filter(function (s) { return s.id === h; })[0];
  if (start) { show(start, false); bag = WC.shuffle(WC.pool.filter(function (s) { return s !== start; })); }
})();
