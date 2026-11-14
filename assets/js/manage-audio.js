/* Sound manager: audio work done in the browser.
   Decoding any format the browser reads, MP3 encoding (lamejs), and the CARE renders:
   texture (excerpt), material (paulstretch x4), sediment (paulstretch x8, darkened). */
(function () {
  var SR = 44100;
  var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  function decode(file) {
    return file.arrayBuffer().then(function (ab) {
      var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new AC(2, SR, SR);
      return new Promise(function (res, rej) { var p = oc.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    }).then(function (buf) {
      var ch = []; for (var c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(buf.getChannelData(c));
      return { ch: ch, sr: SR, dur: buf.length / SR };
    });
  }
  /* true if the two channels are (almost) identical: then mono is enough and halves the size */
  function isMono(ch) {
    if (ch.length < 2) return true;
    var a = ch[0], b = ch[1], step = Math.max(1, Math.floor(a.length / 200000)), d = 0, s = 0;
    for (var i = 0; i < a.length; i += step) { d += Math.abs(a[i] - b[i]); s += Math.abs(a[i]) + Math.abs(b[i]); }
    return s === 0 || d / s < 0.002;
  }
  /* MP3, constant bitrate (browsers read the length of CBR files exactly). stereo 128 kbps, mono 80 kbps unless told */
  function encode(ch, kbps, onProgress) {
    var mono = isMono(ch), chans = mono ? [ch[0]] : ch, n = chans[0].length;
    var rate = kbps || (mono ? 80 : 128), enc = new lamejs.Mp3Encoder(chans.length, SR, rate);
    var parts = [], blk = 1152, perYield = blk * 200, i0 = 0;
    var I = chans.map(function () { return new Int16Array(blk); });
    function run() {
      var end = Math.min(n, i0 + perYield);
      for (var i = i0; i < end; i += blk) {
        var m = Math.min(blk, n - i);
        for (var c = 0; c < chans.length; c++) {
          var src = chans[c], dst = I[c];
          for (var j = 0; j < m; j++) { var v = src[i + j]; v = v > 1 ? 1 : v < -1 ? -1 : v; dst[j] = v * 32767; }
        }
        var d = chans.length === 2 ? enc.encodeBuffer(I[0].subarray(0, m), I[1].subarray(0, m)) : enc.encodeBuffer(I[0].subarray(0, m));
        if (d.length) parts.push(new Uint8Array(d));
      }
      i0 = end; if (onProgress) onProgress(i0 / n);
      if (i0 < n) return tick().then(run);
      var f = enc.flush(); if (f.length) parts.push(new Uint8Array(f));
      var total = parts.reduce(function (a, p) { return a + p.length; }, 0), out = new Uint8Array(total), o = 0;
      parts.forEach(function (p) { out.set(p, o); o += p.length; });
      return { bytes: out, kbps: rate, channels: chans.length, dur: n / SR };
    }
    return tick().then(run);
  }

  /* ---------- CARE renders ---------- */
  var fftCache = {};
  function tables(N) {
    if (fftCache[N]) return fftCache[N];
    var cos = new Float64Array(N / 2), sin = new Float64Array(N / 2), rev = new Uint32Array(N), bits = Math.log2(N);
    for (var i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
    for (i = 0; i < N; i++) { var r = 0, x = i; for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    return (fftCache[N] = { cos: cos, sin: sin, rev: rev });
  }
  function fft(re, im, inverse) {
    var N = re.length, T = tables(N), i, j;
    for (i = 0; i < N; i++) { j = T.rev[i]; if (j > i) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var size = 2; size <= N; size <<= 1) {
      var half = size >> 1, step = N / size;
      for (i = 0; i < N; i += size) for (j = 0; j < half; j++) {
        var k = j * step, wr = T.cos[k], wi = inverse ? T.sin[k] : -T.sin[k];
        var a = i + j, b = a + half, tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function paulstretch(x, factor, W, R, onFrame) {
    var win = new Float64Array(W), i, j;
    for (i = 0; i < W; i++) { var u = -1 + 2 * i / (W - 1); win[i] = Math.pow(1 - u * u, 1.25); }
    var hopOut = W / 2, hopIn = hopOut / factor, frames = Math.max(1, Math.floor((x.length - W) / hopIn) + 1);
    var out = new Float32Array(frames * hopOut + W), re = new Float64Array(W), im = new Float64Array(W), k = 0;
    function run() {
      var end = Math.min(frames, k + 8);
      for (; k < end; k++) {
        var p = Math.floor(k * hopIn);
        for (j = 0; j < W; j++) { re[j] = (p + j < x.length ? x[p + j] : 0) * win[j]; im[j] = 0; }
        fft(re, im, false);
        for (j = 0; j <= W / 2; j++) {
          var mag = Math.sqrt(re[j] * re[j] + im[j] * im[j]), ph = (j === 0 || j === W / 2) ? 0 : R() * 2 * Math.PI;
          re[j] = mag * Math.cos(ph); im[j] = mag * Math.sin(ph);
          if (j > 0 && j < W / 2) { re[W - j] = re[j]; im[W - j] = -im[j]; }
        }
        fft(re, im, true);
        for (j = 0; j < W; j++) out[k * hopOut + j] += re[j] / W * win[j];
      }
      if (onFrame) onFrame(k / frames);
      return k < frames ? tick().then(run) : out;
    }
    return tick().then(run);
  }
  function excerpt(ch, sec, frac) {
    var n = Math.floor(sec * SR), L = ch[0].length;
    if (L <= n) return ch.map(function (c) { return c.slice(); });
    var best = -1, bi = 0;
    for (var q = 0; q < 9; q++) {
      var c = Math.max(0, Math.min(1, frac - 0.12 + q * 0.03)), i = Math.floor(c * (L - n)), s = 0;
      for (var j = i; j < i + n; j += 64) s += ch[0][j] * ch[0][j];
      if (s > best) { best = s; bi = i; }
    }
    return ch.map(function (c) { return c.slice(bi, bi + n); });
  }
  function fade(ch, sec) {
    ch.forEach(function (c) { var n = Math.min(Math.floor(sec * SR), Math.floor(c.length / 2)); for (var i = 0; i < n; i++) { var g = (i / n) * (i / n); c[i] *= g; c[c.length - 1 - i] *= g; } });
    return ch;
  }
  function lowpass(ch, fc) {   /* RBJ biquad, Q 0.707, two passes (4th order) */
    var w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * 0.7071), cw = Math.cos(w), a0 = 1 + al;
    var b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
    ch.forEach(function (c) { for (var pass = 0; pass < 2; pass++) { var x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (var i = 0; i < c.length; i++) { var x = c[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; c[i] = y; } } });
    return ch;
  }
  /* level: RMS about -24 dBFS, peaks under -2 dBFS (the same balance as the rest of the corpus) */
  function level(ch) {
    var s = 0, n = 0, pk = 0;
    ch.forEach(function (c) { for (var i = 0; i < c.length; i++) { s += c[i] * c[i]; var a = Math.abs(c[i]); if (a > pk) pk = a; } n += c.length; });
    var g = Math.min(Math.pow(10, -24 / 20) / (Math.sqrt(s / n) + 1e-9), Math.pow(10, -2 / 20) / (pk + 1e-9));
    ch.forEach(function (c) { for (var i = 0; i < c.length; i++) c[i] *= g; });
    return ch;
  }
  var STATES = {
    texture:  { label: 'texture',  make: function (src, R, prog) { return Promise.resolve(fade(excerpt(src, 40, 0.2), 3)); } },
    material: { label: 'material', make: function (src, R, prog) { return stretchAll(excerpt(src, 15, 0.5), 4, 8192, R, prog).then(function (o) { return fade(o, 4); }); } },
    sediment: { label: 'sediment', make: function (src, R, prog) { return stretchAll(excerpt(src, 15, 0.8), 8, 65536, R, prog).then(function (o) { return fade(lowpass(o, 1600), 8); }); } }
  };
  function stretchAll(ch, f, W, R, prog) {
    var out = [], i = 0;
    function next() {
      if (i >= ch.length) return Promise.resolve(out);
      var c = i++;
      return paulstretch(ch[c], f, W, R, function (p) { if (prog) prog((c + p) / ch.length); }).then(function (o) { out.push(o); return next(); });
    }
    return next();
  }
  function render(src, state, seed, onProgress) {
    var src2 = src.ch.length > 1 ? src.ch : [src.ch[0], src.ch[0]];
    return STATES[state].make(src2, rng(seed), onProgress).then(function (o) { return encode(level(o), 96, null); });
  }
  window.WCAudio = { decode: decode, encode: encode, render: render, isMono: isMono, STATES: Object.keys(STATES), SR: SR };
})();
