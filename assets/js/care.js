/* CARE: the player. Joins the shared score at the right moment and writes what is sounding.
   Long files stream through <audio> elements (low memory on phones); Web Audio does the
   fades, filters, panning and the slow drift. */
(function () {
  var WC = window.WC, S = window.CareScore;
  var startBtn = document.getElementById('care-start'), stopBtn = document.getElementById('care-stop'),
      nowEl = document.getElementById('care-now'), statusEl = document.getElementById('care-status');
  var CORPUS_URL = WC.base + 'care/corpus.json', LOOKAHEAD = 6, MAXV = 9;
  var RANK = { sediment: 0, material: 1, foreground: 2, event: 3, ambience: 4, texture: 5 };
  var ctx = null, master = null, corpus = [], offset = 0, voices = {}, tick = null, refresh = null, running = false;

  function now() { return Date.now() / 1000 + offset; }
  function loadCorpus() {
    return fetch(CORPUS_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      var d = r.headers.get('Date'); if (d) { var srv = Date.parse(d) / 1000 + 0.5; if (!isNaN(srv)) offset = srv - Date.now() / 1000; }
      return r.json();
    }).then(function (c) { if (Array.isArray(c) && c.length) corpus = c; });
  }
  function db(x) { return Math.pow(10, x / 20); }

  function startVoice(e) {
    var into = Math.max(0, now() - e.start), left = e.len - into;
    if (left < 0.5) return;
    var el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto';
    el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false;
    el.src = WC.base + e.file;
    var src = ctx.createMediaElementSource(el), node = src;
    if (e.hp) { var h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = e.hp; h.Q.value = 0.5; node.connect(h); node = h; }
    if (e.lp) { var l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = e.lp; l.Q.value = 0.5; node.connect(l); node = l; }
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = e.pan; node.connect(p); node = p; }
    var env = ctx.createGain(); env.gain.value = 0; node.connect(env); node = env;
    if (e.lfo) {   /* slow drift of about 10 dB */
      var lg = ctx.createGain(); lg.gain.value = 0.66; var o = ctx.createOscillator(); o.frequency.value = 0.015 + (e.start % 7) / 400;
      var depth = ctx.createGain(); depth.gain.value = 0.34; o.connect(depth); depth.connect(lg.gain); o.start(); node.connect(lg); node = lg;
    }
    node.connect(master);
    var v = { e: e, el: el, env: env, alive: true };
    voices[e.key] = v;
    el.addEventListener('loadedmetadata', function () {
      if (!v.alive) return;
      var into2 = Math.max(0, now() - e.start);
      try { el.currentTime = e.off + into2 * e.rate; } catch (x) {}
      el.playbackRate = e.rate;
      var g = db(e.gain), t = ctx.currentTime, end = e.start + e.len - now(), f = Math.max(0.03, Math.min(e.fade, e.len / 2));
      var inPos = into2 / f, startG = inPos >= 1 ? g : g * inPos;
      env.gain.setValueAtTime(startG, t);
      if (inPos < 1) env.gain.linearRampToValueAtTime(g, t + (f - into2));
      var fo = Math.max(t + 0.05, t + end - f); env.gain.setValueAtTime(g, fo); env.gain.linearRampToValueAtTime(0.0001, t + end);
      var pr = el.play(); if (pr && pr.catch) pr.catch(function () {});
      v.timer = setTimeout(function () { stopVoice(e.key); }, (end + 0.3) * 1000);
    });
    el.load();
  }
  function stopVoice(k) {
    var v = voices[k]; if (!v) return; v.alive = false; clearTimeout(v.timer);
    try { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); } catch (x) {}
    delete voices[k];
  }
  function schedule() {
    var t = now(), due = S.events(corpus, t, t + LOOKAHEAD);
    var live = S.events(corpus, t, t + 0.01).sort(function (a, b) { return RANK[a.layer] - RANK[b.layer] || a.start - b.start; }).slice(0, MAXV);
    var keep = {}; live.forEach(function (e) { keep[e.key] = true; });
    due.forEach(function (e) {
      if (voices[e.key] || voices[e.key + ':pending']) return;
      if (e.start <= t) { if (keep[e.key]) startVoice(e); }
      else if (!voices[e.key + ':pending']) {
        voices[e.key + ':pending'] = { alive: true, timer: setTimeout(function () { delete voices[e.key + ':pending']; if (running && !voices[e.key] && Object.keys(voices).length < MAXV + 4) startVoice(e); }, (e.start - t) * 1000) };
      }
    });
    renderNow(live);
  }
  var lastNow = '';
  function renderNow(live) {
    var html = live.map(function (e) {
      var credit = e.credit ? ', ' + WC.esc(e.credit) : '';
      return '<li><b>' + WC.esc(e.title || 'Untitled sound') + '</b>' + credit + '. <span class="as">As ' + e.layer + '.</span></li>';
    }).join('');
    if (html !== lastNow) { nowEl.innerHTML = html || '<li>Silence, for a moment.</li>'; lastNow = html; }
  }
  function start() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { statusEl.textContent = 'This browser cannot play the soundscape.'; return; }
    ctx = ctx || new AC(); ctx.resume();
    if (!master) {
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(comp); comp.connect(ctx.destination);
    }
    statusEl.textContent = 'Joining the soundscape.';
    loadCorpus().then(function () {
      running = true; startBtn.hidden = true; stopBtn.hidden = false; statusEl.textContent = '';
      schedule(); tick = setInterval(schedule, 1000);
      refresh = setInterval(loadCorpus, 120000);
      stopBtn.focus();
    }, function () { statusEl.textContent = 'The soundscape could not load. Try again in a moment.'; });
  }
  function stop() {
    running = false; clearInterval(tick); clearInterval(refresh);
    Object.keys(voices).forEach(function (k) { if (voices[k].e) stopVoice(k); else { clearTimeout(voices[k].timer); delete voices[k]; } });
    startBtn.hidden = false; stopBtn.hidden = true; nowEl.innerHTML = ''; lastNow = ''; startBtn.focus();
  }
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  window.WC_care = { voices: function () { return voices; }, corpus: function () { return corpus; }, offset: function () { return offset; } };
})();
