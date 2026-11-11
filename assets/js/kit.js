/* LISTENING KIT page: every sheet, grouped by family (paper shape and colour). */
(function () {
  var WC = window.WC, root = document.getElementById('families');
  var html = '';
  WC.families.forEach(function (f) {
    var list = WC.pool.filter(function (s) { return s.family === f.id; });
    if (!list.length) return;
    html += '<section class="family" aria-labelledby="fam-' + f.id + '">' +
      '<div class="family-head"><span class="swatch" style="--paper:' + f.color + '" aria-hidden="true"></span>' +
      '<h2 id="fam-' + f.id + '">' + WC.esc(f.name) + '</h2></div><ul class="grid-tiles">';
    list.forEach(function (s) {
      var links = WC.pdfLinks(s) || '[PDF links at release]';
      html += '<li id="' + s.id + '"><div class="sheet tile f-' + f.fold + '" style="--paper:' + f.color + '" aria-hidden="true">' +
        WC.folds(f.fold) + '<div class="along">' + WC.esc(s.title_en) + '</div></div>' +
        '<h3>' + WC.esc(s.title_en) + '</h3><p class="it" lang="it">' + WC.esc(s.title_it) + '</p>' +
        '<p class="meta">' + WC.esc(s.players) + '. ' + links + '</p></li>';
    });
    html += '</ul></section>';
  });
  root.innerHTML = html;
})();
