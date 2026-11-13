/* CARE: giving a sound. Everything happens in the visitor's browser: recording or choosing a file,
   trimming silence, a 30-second limit, levelling, choosing the category, MP3 encoding.
   Then the sound is sent to the project's drop box, which publishes it to the soundscape. */
(function () {
  var C = window.WILDCARE_CARE || {}, box = document.getElementById('give');
  if (!C.endpoint) { box.querySelector('.give-open').hidden = true; box.querySelector('.give-soon').hidden = false; return; }
  var rec = document.getElementById('give-rec'), file = document.getElementById('give-file'), msg = document.getElementById('give-msg'),
      ready = document.getElementById('give-ready'), preview = document.getElementById('give-preview'), heard = document.getElementById('give-heard'),
      send = document.getElementById('give-send'), consent = document.getElementById('give-consent'), title = document.getElementById('give-title'), credit = document.getElementById('give-credit');
  var MAX = 30, SR = 44100, result = null, mr = null, chunks = [], timer = null;

  function say(t) { msg.textContent = t; }
  function process(arrayBuf) {
    say('Preparing the sound.');
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var oc = new AC(2, SR, SR);
    var p = new Promise(function (res, rej) { var r = oc.decodeAudioData(arrayBuf, res, rej); if (r && r.then) r.then(res, rej); });
    return p.then(function (buf) {
      var ch = [], n = buf.length, i, c, nc = Math.min(2, buf.numberOfChannels);
      for (c = 0; c < nc; c++) ch.push(buf.getChannelData(c));
      var mono = new Float32Array(n); for (c = 0; c < nc; c++) for (i = 0; i < n; i++) mono[i] += ch[c][i] / nc;
      // trim silence below -50 dBFS at both ends
      var thr = Math.pow(10, -50 / 20), a = 0, b = n - 1;
      while (a < n && Math.abs(mono[a]) < thr) a++;
      while (b > a && Math.abs(mono[b]) < thr) b--;
      if (b - a < SR * 0.2) throw new Error('silent');
      b = Math.min(b + 1, a + MAX * SR);
      var len = b - a, dur = len / SR;
      // analysis on 50 ms frames
      var fr = Math.floor(SR * 0.05), dbs = [], peak = 0, sum = 0;
      for (i = a; i + fr <= b; i += fr) { var s = 0; for (var j = i; j < i + fr; j++) { s += mono[j] * mono[j]; } dbs.push(10 * Math.log10(s / fr + 1e-12)); }
      for (i = a; i < b; i++) { var v = Math.abs(mono[i]); if (v > peak) peak = v; sum += mono[i] * mono[i]; }
      var rms = Math.sqrt(sum / len), mean = dbs.reduce(function (x, y) { return x + y; }, 0) / dbs.length;
      var sd = Math.sqrt(dbs.reduce(function (x, y) { return x + (y - mean) * (y - mean); }, 0) / dbs.length);
      var onsets = 0; for (i = 1; i < dbs.length; i++) if (dbs[i] - dbs[i - 1] > 6 && dbs[i] > mean - 6) onsets++;
      var category = dur < 6 ? 'event' : (sd < 5 ? 'ambience' : (onsets / dur < 0.25 && 20 * Math.log10(peak / rms) > 18 && dur < 12 ? 'event' : 'texture'));
      // level: RMS to about -24 dBFS, peaks kept under -1 dBFS
      var gain = Math.min(Math.pow(10, -24 / 20) / (rms + 1e-9), Math.pow(10, -1 / 20) / (peak + 1e-9));
      var fade = Math.floor(SR * 0.02), out = [];
      for (c = 0; c < nc; c++) {
        var o = new Int16Array(len);
        for (i = 0; i < len; i++) {
          var f = Math.min(1, i / fade, (len - 1 - i) / fade);
          var x = ch[c][a + i] * gain * f; o[i] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
        }
        out.push(o);
      }
      // MP3, 128 kbps
      var enc = new lamejs.Mp3Encoder(nc, SR, 128), parts = [], blk = 1152;
      for (i = 0; i < len; i += blk) {
        var d = nc === 2 ? enc.encodeBuffer(out[0].subarray(i, i + blk), out[1].subarray(i, i + blk)) : enc.encodeBuffer(out[0].subarray(i, i + blk));
        if (d.length) parts.push(new Uint8Array(d));
      }
      var e = enc.flush(); if (e.length) parts.push(new Uint8Array(e));
      return { blob: new Blob(parts, { type: 'audio/mpeg' }), dur: Math.round(dur * 10) / 10, category: category };
    });
  }
  var WORDS = {
    event: 'It will be heard as an event: it comes back now and then, never at predictable moments.',
    ambience: 'It will be heard as an ambience: near-raw, drifting slowly in and out.',
    texture: 'It will be heard as a texture: fragments of it, filtered a little differently each time.'
  };
  function ready_(r) {
    result = r; preview.src = URL.createObjectURL(r.blob); ready.hidden = false;
    heard.textContent = r.dur + ' seconds. ' + WORDS[r.category] + ' For its first day it also sounds in the foreground, so you can find it; then it slowly sinks into the soundscape.';
    say(''); send.disabled = !consent.checked;
  }
  function fail(err) {
    say(err && err.message === 'silent' ? 'This recording seems to be silent. Try again a little closer to the sound.' : 'This file could not be read. Try another recording, or a WAV or MP3 file.');
  }
  file.addEventListener('change', function () {
    var f = file.files[0]; if (!f) return;
    if (f.size > 60 * 1024 * 1024) { say('This file is too large. Choose a shorter one.'); return; }
    f.arrayBuffer().then(process).then(ready_, fail);
  });
  rec.addEventListener('click', function () {
    if (mr && mr.state === 'recording') { mr.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { say('This browser cannot record. Choose a file instead.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      chunks = []; mr = new MediaRecorder(stream);
      mr.ondataavailable = function (ev) { if (ev.data.size) chunks.push(ev.data); };
      mr.onstop = function () {
        clearInterval(timer); stream.getTracks().forEach(function (t) { t.stop(); });
        rec.textContent = 'Record again';
        new Blob(chunks, { type: mr.mimeType }).arrayBuffer().then(process).then(ready_, fail);
      };
      mr.start(); var left = MAX; rec.textContent = 'Stop (' + left + ')';
      timer = setInterval(function () { left--; rec.textContent = 'Stop (' + left + ')'; if (left <= 0) mr.stop(); }, 1000);
    }, function () { say('The microphone is not available. You can choose a file instead.'); });
  });
  consent.addEventListener('change', function () { send.disabled = !(consent.checked && result); });
  send.addEventListener('click', function () {
    if (!result || !consent.checked) return;
    send.disabled = true; say('Sending.');
    var fr = new FileReader();
    fr.onload = function () {
      var b64 = String(fr.result).split(',')[1];
      fetch(C.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mp3: b64, title: title.value.trim().slice(0, 40), credit: credit.value.trim().slice(0, 40), category: result.category, dur: result.dur }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { say('Thank you. Your sound joins the soundscape in about half an hour.'); ready.hidden = true; result = null; title.value = ''; credit.value = ''; consent.checked = false; }
          else if (d.error === 'busy') { say('Many sounds have arrived this hour. Try again a little later.'); send.disabled = false; }
          else { say('The sound could not be sent. Try again in a moment.'); send.disabled = false; }
        }, function () { say('The sound could not be sent. Check the connection and try again.'); send.disabled = false; });
    };
    fr.readAsDataURL(result.blob);
  });
})();
