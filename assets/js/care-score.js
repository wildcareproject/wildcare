/* CARE: the shared score.
   Every visitor's browser computes the same soundscape from the same clock and the same list of sounds,
   so everyone listening at the same moment hears the same thing, with no server.
   Time is cut into 5-minute blocks; each block is generated from its own seed. A sound joins the score
   13 minutes after it was published, so every visitor has received the updated list before it is used. */
(function (root) {
  var BLOCK = 300, MARGIN = 780, DAY = 86400;

  function h32(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function addedAt(s) { return Date.parse(s.added) / 1000; }
  function pick(pool, R, avoid) {
    if (!pool.length) return null;
    var s = pool[Math.floor(R() * pool.length)];
    if (avoid && s === avoid && pool.length > 1) s = pool[(pool.indexOf(s) + 1 + Math.floor(R() * (pool.length - 1))) % pool.length];
    return s;
  }
  function mk(s, layer, start, len, R, o) {
    var rate = o.rate || 1, used = len * rate;
    if (used > s.dur) { len = s.dur / rate; used = s.dur; }
    var off = Math.max(0, (s.dur - used) * R());
    return { key: s.id + '@' + start.toFixed(2), id: s.id, file: s.file, title: s.title, credit: s.credit, layer: layer,
      start: start, len: len, off: off, rate: rate, gain: o.gain || 0, pan: o.pan || 0,
      hp: o.hp || 0, lp: o.lp || 0, fade: o.fade != null ? o.fade : Math.min(6, len / 4), lfo: !!o.lfo };
  }

  function block(corpus, b) {
    var t0 = b * BLOCK, R = rng(h32('wildcare-care:' + b)), ev = [];
    var C = corpus.filter(function (s) { return addedAt(s) <= t0 - MARGIN; }).sort(function (x, y) { return x.id < y.id ? -1 : 1; });
    var seed = function (c) { return C.filter(function (s) { return s.origin !== 'contribution' && s.category === c; }); };
    var contrib = C.filter(function (s) { return s.origin === 'contribution'; });
    var age = function (s) { return t0 - addedAt(s); };
    var cat = function (c) { return contrib.filter(function (s) { return s.category === c; }); };
    // the ladder: contributions sink with age (slowed, darkened) into material after 3 days, sediment after 10
    var oldMat = contrib.filter(function (s) { return age(s) > 3 * DAY; });
    var oldSed = contrib.filter(function (s) { return age(s) > 10 * DAY; });
    // while the ground has not formed yet (fewer than three sunken sounds), the bed borrows from every sound
    if (oldMat.length < 3) oldMat = contrib.slice();
    if (oldSed.length < 3) oldSed = contrib.slice();

    // SEDIMENT: a continuous bed, two or three layers overlapping
    var sed = seed('sediment').concat(oldSed), t = t0 + R() * 10, prev = null;
    while (sed.length && t < t0 + BLOCK) {
      var s = pick(sed, R, prev), isOld = s.origin === 'contribution';
      var e = mk(s, 'sediment', t, 80 + R() * 40, R, { gain: -4, pan: (R() - 0.5) * 0.6, rate: isOld ? 0.25 : 1, lp: isOld ? 1200 : 0, fade: 12 });
      ev.push(e); prev = s; t += e.len * (0.45 + R() * 0.15);
    }
    // MATERIAL: substance, already stretched
    var mat = seed('material').concat(oldMat), n = 2 + Math.floor(R() * 3), i;
    for (i = 0; i < n && mat.length; i++) {
      var m = pick(mat, R), mo = m.origin === 'contribution';
      ev.push(mk(m, 'material', t0 + R() * BLOCK, 35 + R() * 25, R, { gain: -3, pan: (R() - 0.5) * 1.2, rate: mo ? 0.5 : 1, lp: mo ? 4000 : 0, fade: 8 }));
    }
    // TEXTURE: excerpts with a gentle band-pass that changes every time
    var tex = seed('texture').concat(cat('texture'));
    n = 4 + Math.floor(R() * 4);
    for (i = 0; i < n && tex.length; i++) {
      ev.push(mk(pick(tex, R), 'texture', t0 + R() * BLOCK, 15 + R() * 25, R,
        { gain: -2, pan: (R() - 0.5) * 1.4, hp: 90 + R() * 210, lp: 3000 + R() * 5000, fade: 4 }));
    }
    // AMBIENCE: near-raw, never filtered, a slow 10 dB drift
    var amb = cat('ambience'); n = amb.length ? 1 + Math.floor(R() * 3) : 0;
    for (i = 0; i < n; i++) ev.push(mk(pick(amb, R), 'ambience', t0 + R() * BLOCK, 60, R, { gain: -1, pan: (R() - 0.5) * 0.8, fade: 3, lfo: true }));
    // EVENT: heavy-tailed returns, so nobody can predict the next one
    // (few events = sparser; the same event never returns within two minutes)
    var evp = cat('event'), last = {}, base = 8 * Math.max(1, 5 / Math.max(1, evp.length)); t = t0 + R() * 20;
    while (evp.length && t < t0 + BLOCK) {
      var es = pick(evp, R);
      if (last[es.id] != null && t - last[es.id] < 120) { t += 5 + R() * 10; continue; }
      ev.push(mk(es, 'event', t, 30, R, { gain: 0, pan: (R() - 0.5) * 1.6, hp: 90, lp: 8000, fade: 0.05 }));
      last[es.id] = t; t += Math.min(240, base * Math.pow(1 - R(), -1 / 1.3));
    }
    // FOREGROUND: the newest sounds, near-raw and findable, for about a day
    contrib.forEach(function (s) {
      var w = Math.exp(-age(s) / DAY), k = Math.floor(1.5 * w + R());
      for (var j = 0; j < k; j++) ev.push(mk(s, 'foreground', t0 + R() * BLOCK, 30, R, { gain: 1, pan: (R() - 0.5) * 0.4, fade: 0.05 }));
    });
    // no two different sounds start at the same moment
    ev.sort(function (x, y) { return x.start - y.start || (x.key < y.key ? -1 : 1); });
    for (i = 1; i < ev.length; i++) if (ev[i].start - ev[i - 1].start < 0.6) ev[i].start = ev[i - 1].start + 0.6;
    ev.forEach(function (e) { e.key = e.id + '@' + e.start.toFixed(2); });
    return ev;
  }

  /* every event sounding between `from` and `to` (seconds, UTC) */
  function events(corpus, from, to) {
    var out = [], b0 = Math.floor(from / BLOCK) - 1, b1 = Math.floor(to / BLOCK);
    for (var b = b0; b <= b1; b++) block(corpus, b).forEach(function (e) { if (e.start < to && e.start + e.len > from) out.push(e); });
    return out;
  }

  var api = { events: events, block: block, BLOCK: BLOCK, MARGIN: MARGIN };
  if (typeof module !== 'undefined') module.exports = api; else root.CareScore = api;
})(this);
