/* DESIGN: the tangram composer. Based on tangram.html (aldoweb.xyz): same 7-piece dissection of the 8x8 square.
   Each piece is one family of the Kit and draws one sheet from it. No order: the score is read any way. */
(function () {
  var WC = window.WC;
  var UNIT = 40, W = 800, H = 800, SNAP = 13, STEP = 10;
  var DEF = [
    { id: 'lt1', fam: 'large-triangle',   shape: 'Large triangle',  unitPoly: [[0,0],[0,8],[4,4]] },
    { id: 'lt2', fam: 'large-rectangle',  shape: 'Large triangle',  unitPoly: [[0,0],[8,0],[4,4]] },
    { id: 'mt',  fam: 'large-square',     shape: 'Medium triangle', unitPoly: [[4,8],[8,8],[8,4]] },
    { id: 'sq',  fam: 'small-square',     shape: 'Square',          unitPoly: [[2,6],[4,8],[6,6],[4,4]] },
    { id: 'par', fam: 'narrow-rectangle', shape: 'Parallelogram',   unitPoly: [[6,2],[6,6],[8,4],[8,0]] },
    { id: 'st1', fam: 'small-triangle',   shape: 'Small triangle',  unitPoly: [[4,4],[6,6],[6,2]] },
    { id: 'st2', fam: 'small-rectangle',  shape: 'Small triangle',  unitPoly: [[0,8],[4,8],[2,6]] }
  ];
  DEF.forEach(function (d) {
    var cx = 0, cy = 0;
    d.unitPoly.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= d.unitPoly.length; cy /= d.unitPoly.length;
    d.poly = d.unitPoly.map(function (p) { return [(p[0] - cx) * UNIT, (p[1] - cy) * UNIT]; });
    d.color = WC.famById[d.fam].color;
  });
  var SPOTS = [[140,300],[400,640],[665,260],[135,630],[668,585],[400,85],[615,700]];

  var canvas = document.getElementById('board'), ctx = canvas.getContext('2d');
  var listEl = document.getElementById('pieces'), detail = document.getElementById('detail');
  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);

  var pieces = [], sel = null, dragging = false, moved = false, down = null, dragOff = { x: 0, y: 0 }, lastTap = { t: 0, id: null }, rect = null;

  function drawSheet(fam, not) {
    var pool = WC.pool.filter(function (s) { return s.family === fam && s !== not; });
    if (!pool.length) pool = WC.pool.filter(function (s) { return s.family === fam; });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function scatter(keepSheets) {
    var old = {};
    pieces.forEach(function (p) { old[p.id] = p.sheet; });
    pieces = DEF.map(function (d, i) {
      return { id: d.id, def: d, poly: d.poly, color: d.color, x: SPOTS[i][0], y: SPOTS[i][1],
        rot: ((i * 3) % 8) * Math.PI / 4, flip: 1, sheet: (keepSheets && old[d.id]) || drawSheet(d.fam) };
    });
    renderList(); schedule();
  }
  function tr(p) {
    var c = Math.cos(p.rot), s = Math.sin(p.rot);
    return p.poly.map(function (q) { var x = q[0] * p.flip, y = q[1]; return [p.x + x * c - y * s, p.y + x * s + y * c]; });
  }
  var pending = false;
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; draw(ctx, 0, 0); }); }
  function poly(c, pts, ox, oy) { c.beginPath(); c.moveTo(pts[0][0] + ox, pts[0][1] + oy); for (var j = 1; j < pts.length; j++) c.lineTo(pts[j][0] + ox, pts[j][1] + oy); c.closePath(); }
  function draw(c, ox, oy, forExport) {
    if (!forExport) { c.clearRect(0, 0, W, H); c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); }
    c.lineJoin = 'round'; c.strokeStyle = '#111111';
    pieces.forEach(function (p) {
      var pts = tr(p);
      poly(c, pts, ox, oy); c.fillStyle = p.color; c.fill();
      c.lineWidth = (!forExport && p === sel) ? 7 : 3; c.stroke();
    });
  }
  function pt(e) { var r = rect || canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; }
  function hit(q) {
    for (var i = pieces.length - 1; i >= 0; i--) {
      var P = tr(pieces[i]), inside = false;
      for (var a = 0, b = P.length - 1; a < P.length; b = a++) {
        if (((P[a][1] > q.y) !== (P[b][1] > q.y)) && (q.x < (P[b][0] - P[a][0]) * (q.y - P[a][1]) / (P[b][1] - P[a][1]) + P[a][0])) inside = !inside;
      }
      if (inside) return pieces[i];
    }
    return null;
  }
  function toTop(p) { pieces.splice(pieces.indexOf(p), 1); pieces.push(p); }
  function select(p) {
    sel = p;
    listEl.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(!!p && b.dataset.piece === p.id)); });
    document.querySelectorAll('[data-needs-sel]').forEach(function (b) { b.disabled = !p; });
    renderDetail(); schedule();
  }
  function snap(p) {
    var V = tr(p), T = [], best = { d: Infinity, dx: 0, dy: 0 };
    pieces.forEach(function (q) { if (q !== p) tr(q).forEach(function (v) { T.push(v); }); });
    V.forEach(function (v) { T.forEach(function (t) { var dx = t[0] - v[0], dy = t[1] - v[1], d = Math.sqrt(dx * dx + dy * dy); if (d < best.d) best = { d: d, dx: dx, dy: dy }; }); });
    if (best.d < SNAP) { p.x += best.dx; p.y += best.dy; }
  }
  function clamp(p) { p.x = Math.max(10, Math.min(W - 10, p.x)); p.y = Math.max(10, Math.min(H - 10, p.y)); }
  function rotate() { if (!sel) return; sel.rot += Math.PI / 4; snap(sel); schedule(); }
  function flip() { if (!sel) return; sel.flip *= -1; snap(sel); schedule(); }
  function redraw() { if (!sel) return; sel.sheet = drawSheet(sel.def.fam, sel.sheet); renderList(); select(sel); }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); rect = canvas.getBoundingClientRect();
    var q = pt(e), p = hit(q);
    if (!p) { select(null); lastTap = { t: 0, id: null }; return; }
    toTop(p); select(p);
    var now = Date.now();
    if (now - lastTap.t < 300 && lastTap.id === p.id) { rotate(); lastTap = { t: 0, id: null }; return; }
    lastTap = { t: now, id: p.id };
    dragging = true; moved = false; down = q; dragOff.x = q.x - p.x; dragOff.y = q.y - p.y;
    canvas.classList.add('dragging'); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging || !sel) return;
    var q = pt(e);
    if (!moved && Math.abs(q.x - down.x) + Math.abs(q.y - down.y) < 4) return;
    moved = true; sel.x = q.x - dragOff.x; sel.y = q.y - dragOff.y; clamp(sel); schedule();
  });
  function end() { if (dragging && sel && moved) snap(sel); dragging = false; rect = null; canvas.classList.remove('dragging'); schedule(); }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function shapeIcon(d, size) {
    var pts = d.unitPoly, xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var minx = Math.min.apply(0, xs), miny = Math.min.apply(0, ys), w = Math.max.apply(0, xs) - minx, h = Math.max.apply(0, ys) - miny, k = (size - 4) / Math.max(w, h);
    var s = pts.map(function (p) { return (2 + (p[0] - minx) * k).toFixed(1) + ',' + (2 + (p[1] - miny) * k).toFixed(1); }).join(' ');
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true" focusable="false"><polygon points="' + s + '" fill="' + d.color + '" stroke="#111111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function renderList() {
    var cur = sel && sel.id;
    listEl.innerHTML = DEF.map(function (d) {
      var p = pieces.filter(function (x) { return x.id === d.id; })[0];
      return '<li><button type="button" data-piece="' + d.id + '" aria-pressed="' + (cur === d.id) + '" aria-describedby="keys">' +
        shapeIcon(d, 30) + '<span><span class="vh">' + WC.esc(WC.famById[d.fam].name) + ': </span>' + WC.esc(p.sheet.title_en) + '</span></button></li>';
    }).join('');
  }
  function renderDetail() {
    if (!sel) { detail.innerHTML = '<p class="help" style="margin:0">Tap a piece, or choose one from the list, to read its sheet.</p>'; return; }
    var s = sel.sheet, f = WC.famById[sel.def.fam], links = WC.pdfLinks(s);
    detail.innerHTML = '<p class="fam">' + WC.esc(sel.def.shape) + ', ' + WC.esc(f.name.toLowerCase()) + '</p>' +
      '<h3>' + WC.esc(s.title_en) + '</h3><p class="line">' + WC.esc(s.line_en) + '</p>' +
      '<p class="orig" lang="it"><b>' + WC.esc(s.title_it) + '.</b> ' + WC.esc(s.line_it) + '</p>' +
      '<p class="orig">' + WC.esc(s.players) + (links ? '. ' + links : '.') + '</p>' +
      '<button type="button" class="btn ghost" id="again">Draw another sheet for this piece</button>';
    document.getElementById('again').addEventListener('click', function () { redraw(); var b = document.getElementById('again'); if (b) b.focus(); });
  }

  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var p = pieces.filter(function (x) { return x.id === b.dataset.piece; })[0]; toTop(p); select(p);
  });
  listEl.addEventListener('focusin', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var p = pieces.filter(function (x) { return x.id === b.dataset.piece; })[0]; if (p !== sel) { toTop(p); select(p); }
  });
  listEl.addEventListener('keydown', function (e) {
    if (!sel) return;
    var k = e.key, st = e.shiftKey ? STEP * 4 : STEP, used = true;
    if (k === 'ArrowLeft') sel.x -= st; else if (k === 'ArrowRight') sel.x += st;
    else if (k === 'ArrowUp') sel.y -= st; else if (k === 'ArrowDown') sel.y += st;
    else if (k === 'r' || k === 'R') rotate(); else if (k === 'f' || k === 'F') flip();
    else used = false;
    if (used) { e.preventDefault(); clamp(sel); schedule(); }
  });
  document.getElementById('rotate').addEventListener('click', rotate);
  document.getElementById('flip').addEventListener('click', flip);
  document.getElementById('scatter').addEventListener('click', function () { var id = sel && sel.id; scatter(true); select(pieces.filter(function (p) { return p.id === id; })[0] || null); });

  /* the result: the composition plus the seven titles, unnumbered, keyed by colour */
  document.getElementById('save').addEventListener('click', function () {
    var ready = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('400 22px Prompt'), document.fonts.load('600 22px Prompt')]) : Promise.resolve();
    ready.then(function () {
      var M = 40, RH = 46, LW = W + 2 * M, legendTop = M + H + 44, LH = legendTop + DEF.length * RH + 70;
      var c = document.createElement('canvas'); c.width = LW * 2; c.height = LH * 2;
      var x = c.getContext('2d'); x.scale(2, 2);
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, LW, LH);
      draw(x, M, M, true);
      x.textBaseline = 'middle';
      DEF.forEach(function (d, i) {
        var p = pieces.filter(function (q) { return q.id === d.id; })[0], y = legendTop + i * RH;
        var img = new Path2D(); var pts = d.unitPoly, mx = Math.min.apply(0, pts.map(function (q) { return q[0]; })), my = Math.min.apply(0, pts.map(function (q) { return q[1]; }));
        var k = 28 / Math.max.apply(0, pts.map(function (q) { return Math.max(q[0] - mx, q[1] - my); }));
        pts.forEach(function (q, j) { var px = M + (q[0] - mx) * k, py = y - 14 + (q[1] - my) * k; j ? img.lineTo(px, py) : img.moveTo(px, py); }); img.closePath();
        x.fillStyle = d.color; x.fill(img); x.lineWidth = 1.5; x.strokeStyle = '#111111'; x.stroke(img);
        x.fillStyle = '#111111'; x.font = '600 22px Prompt, Arial, sans-serif'; x.fillText(p.sheet.title_en, M + 46, y);
        var w1 = x.measureText(p.sheet.title_en).width; x.font = '400 18px Prompt, Arial, sans-serif'; x.fillText(p.sheet.title_it, M + 46 + w1 + 14, y);
      });
      x.font = '400 16px Prompt, Arial, sans-serif'; x.fillText('WILD:CARE Listening Kit, wildcareproject.org', M, LH - 34);
      c.toBlob(function (blob) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wildcare-score.png';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }, 'image/png');
    });
  });

  scatter(false); select(null);
  window.WC_design = { pieces: function () { return pieces; } };
})();
