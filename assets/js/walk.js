/* WALK: a chain of walks, each recorded by a different person.
   Random order, every walk once before any repeats, crossfade between walks, a "next" control, captions.
   Web Audio gain nodes do the fades (iOS ignores the volume of audio elements). */
(function () {
  var WC = window.WC, walks = window.WILDCARE_WALKS || [], FADE = 6;
  var empty = document.getElementById('walk-empty'), player = document.getElementById('walk-player'), list = document.getElementById('walk-list');
  if (!walks.length) { empty.hidden = false; return; }
  player.hidden = false; document.getElementById('walk-all').hidden = false;
  list.innerHTML = walks.map(function (w) {
    return '<li><p style="margin:0;font-weight:600">' + WC.esc(w.author) + '</p><p style="margin:0 0 6px;font-size:16px">' + WC.esc(w.place) + ', ' + fmt(w.date) + '</p><p style="margin:0">' + WC.esc(w.description) + '</p></li>';
  }).join('');

  var startBtn = document.getElementById('walk-start'), nextBtn = document.getElementById('walk-next'), pauseBtn = document.getElementById('walk-pause');
  var who = document.getElementById('now-who'), when = document.getElementById('now-when'), desc = document.getElementById('now-desc');
  var ctx = null, slots = [], cur = -1, bag = [], fading = false, paused = false;

  function fmt(d) { var x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function mk() {
    var a = new Audio(); a.preload = 'auto'; a.setAttribute('data-chain', ''); document.body.appendChild(a); a.hidden = true;
    var s = { el: a, gain: null };
    if (ctx) { var src = ctx.createMediaElementSource(a); s.gain = ctx.createGain(); s.gain.gain.value = 0; src.connect(s.gain); s.gain.connect(ctx.destination); }
    a.addEventListener('timeupdate', function () { if (slots[cur] === s && a.duration && !fading && a.currentTime > a.duration - FADE) step(); });
    a.addEventListener('ended', function () { if (slots[cur] === s && !fading) step(); });
    return s;
  }
  function ramp(s, to, sec) {
    if (s.gain) { var g = s.gain.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec); }
    else { s.el.volume = to; }
  }
  function nextWalk() { if (!bag.length) { bag = WC.shuffle(walks); if (bag.length > 1 && bag[bag.length - 1] === slots.lastWalk) bag.unshift(bag.pop()); } return bag.pop(); }
  function step() {
    fading = true;
    var w = nextWalk(); slots.lastWalk = w;
    var prev = slots[cur], ni = cur === 0 ? 1 : 0, s = slots[ni];
    s.el.src = WC.base + w.file; s.el.currentTime = 0;
    var p = s.el.play(); if (p && p.catch) p.catch(function () {});
    ramp(s, 1, prev ? FADE : 1.5);
    if (prev) { ramp(prev, 0, FADE); setTimeout(function () { if (slots[cur] !== prev) prev.el.pause(); }, FADE * 1000 + 200); }
    cur = ni;
    who.textContent = w.author; when.textContent = w.place + ', ' + fmt(w.date); desc.textContent = w.description;
    setTimeout(function () { fading = false; }, FADE * 1000);
  }
  startBtn.addEventListener('click', function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC && location.protocol !== 'file:') { ctx = new AC(); }
    slots = [mk(), mk()];
    startBtn.hidden = true; nextBtn.hidden = false; pauseBtn.hidden = false;
    step(); nextBtn.focus();
  });
  nextBtn.addEventListener('click', function () { if (!fading) step(); });
  function setPaused(v) {
    paused = v; pauseBtn.textContent = v ? 'Resume' : 'Pause';
    slots.forEach(function (s) { if (v) s.el.pause(); else if (s === slots[cur]) s.el.play(); });
    if (ctx) { v ? ctx.suspend() : ctx.resume(); }
  }
  pauseBtn.addEventListener('click', function () { setPaused(!paused); });
  window.WC_pauseChain = function () { if (slots.length && !paused) setPaused(true); };
})();
