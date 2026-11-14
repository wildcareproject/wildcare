/* Reading sound files in the browser, whatever the format.
   1. WAV / BWF / RF64, AIFF / AIFC and CAF with plain PCM are read directly, any size:
      only the part that is needed is loaded, so a 2 GB field recording opens instantly.
   2. Everything else goes to the browser's own decoder (MP3, M4A/AAC, FLAC, Ogg, Opus, WebM,
      and the sound of MP4 / MOV videos; Safari also ALAC and AMR).
   3. If the browser refuses an Ogg (Opus, Vorbis) or FLAC file, small decoders stored on the site take over.
   The result is always at 44.1 kHz, mono or stereo (more channels are folded into two). */
(function () {
  'use strict';
  var SR = 44100;
  var ACCEPT = 'audio/*,video/*,.mp3,.wav,.wave,.bwf,.rf64,.aif,.aiff,.aifc,.caf,.flac,.ogg,.oga,.opus,.m4a,.m4b,.aac,.adts,.alac,' +
               '.mp4,.mov,.m4v,.3gp,.3ga,.3g2,.webm,.weba,.mka,.mkv,.amr,.awb,.wma,.asf';
  var VENDOR = 'assets/vendor/wasm-audio-decoders/';

  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function readBytes(file, a, b) { return file.slice(a, b).arrayBuffer().then(function (ab) { return new DataView(ab); }); }
  function str(dv, o, n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s; }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  /* ---------- what is this file ---------- */
  function sniff(file) {
    return readBytes(file, 0, 4096).then(function (dv) {
      var n = dv.byteLength, s4 = n >= 4 ? str(dv, 0, 4) : '', s8 = n >= 12 ? str(dv, 8, 4) : '';
      if ((s4 === 'RIFF' || s4 === 'RF64' || s4 === 'BW64') && s8 === 'WAVE') return { kind: 'wav', rf64: s4 !== 'RIFF', name: 'WAV' };
      if (s4 === 'FORM' && (s8 === 'AIFF' || s8 === 'AIFC')) return { kind: 'aiff', aifc: s8 === 'AIFC', name: 'AIFF' };
      if (s4 === 'caff') return { kind: 'caf', name: 'CAF' };
      if (s4 === 'fLaC') return { kind: 'flac', name: 'FLAC' };
      if (s4 === 'OggS') {
        var head = str(dv, 0, Math.min(n, 200));
        return { kind: head.indexOf('OpusHead') >= 0 ? 'opus' : head.indexOf('vorbis') >= 0 ? 'vorbis' : head.indexOf('FLAC') >= 0 ? 'oggflac' : 'ogg', name: 'Ogg' };
      }
      if (str(dv, 0, 3) === 'ID3' || (n > 1 && dv.getUint8(0) === 0xFF && (dv.getUint8(1) & 0xE0) === 0xE0 && (dv.getUint8(1) & 0x06) !== 0)) return { kind: 'mp3', name: 'MP3' };
      if (n > 1 && dv.getUint8(0) === 0xFF && (dv.getUint8(1) & 0xF6) === 0xF0) return { kind: 'aac', name: 'AAC' };
      if (n >= 8 && str(dv, 4, 4) === 'ftyp') {
        var brand = str(dv, 8, 4);
        return { kind: 'mp4', video: !/^(M4A |M4B |mp42)$/.test(brand) && !/m4a|m4b/.test(ext(file.name)), name: /^3g/.test(brand) ? '3GP' : brand === 'qt  ' ? 'MOV' : 'MP4/M4A' };
      }
      if (n >= 8 && (str(dv, 4, 4) === 'moov' || str(dv, 4, 4) === 'wide' || str(dv, 4, 4) === 'mdat')) return { kind: 'mp4', video: true, name: 'MOV' };
      if (n >= 4 && dv.getUint32(0) === 0x1A45DFA3) return { kind: 'webm', video: !/weba|mka/.test(ext(file.name)), name: 'WebM/Matroska' };
      if (str(dv, 0, 5) === '#!AMR') return { kind: 'amr', name: 'AMR, a phone recorder format' };
      if (n >= 4 && dv.getUint32(0) === 0x3026B275) return { kind: 'wma', name: 'WMA, Windows Media' };
      if (str(dv, 0, 4) === 'MThd') return { kind: 'midi', name: 'MIDI' };
      return { kind: 'unknown', name: (ext(file.name) || 'unknown').toUpperCase() };
    });
  }

  /* ---------- PCM containers ---------- */
  function wavInfo(file, info) {
    var pos = 12, fmt = null, data = null, ds64 = null;
    function next() {
      if (pos + 8 > file.size || (fmt && data)) return finish();
      return readBytes(file, pos, pos + 8).then(function (h) {
        var id = str(h, 0, 4), size = h.getUint32(4, true), body = pos + 8;
        var p = Promise.resolve();
        if (id === 'ds64') p = readBytes(file, body, body + 28).then(function (d) { ds64 = { data: d.getUint32(8, true) + d.getUint32(12, true) * 4294967296 }; });
        if (id === 'fmt ') p = readBytes(file, body, body + Math.min(size, 40)).then(function (d) {
          var tag = d.getUint16(0, true);
          if (tag === 0xFFFE && size >= 26) tag = d.getUint16(24, true);
          fmt = { tag: tag, ch: d.getUint16(2, true), sr: d.getUint32(4, true), align: d.getUint16(12, true), bits: d.getUint16(14, true) };
        });
        if (id === 'data') {
          var len = (ds64 && (size === 0xFFFFFFFF || info.rf64)) ? ds64.data : size;
          if (!len || body + len > file.size) len = file.size - body;
          data = { offset: body, length: len };
        }
        return p.then(function () { pos = body + (id === 'data' ? data.length : size) + ((id === 'data' ? data.length : size) & 1); return next(); });
      });
    }
    function finish() {
      if (!fmt || !data) return null;
      var codec = fmt.tag === 1 ? 'int' : fmt.tag === 3 ? 'float' : null;
      if (!codec) return null;
      return { ch: fmt.ch, sr: fmt.sr, bits: fmt.bits, codec: codec, le: true, frameBytes: fmt.align || fmt.ch * fmt.bits / 8, offset: data.offset, length: data.length };
    }
    return next();
  }
  function ext80(dv, o) {   /* 80-bit IEEE extended, big-endian */
    var e = dv.getUint16(o) & 0x7FFF, hi = dv.getUint32(o + 2), lo = dv.getUint32(o + 6);
    if (!e && !hi && !lo) return 0;
    return (hi * 4294967296 + lo) * Math.pow(2, e - 16383 - 63);
  }
  function aiffInfo(file, info) {
    var pos = 12, comm = null, ssnd = null;
    function next() {
      if (pos + 8 > file.size || (comm && ssnd)) return finish();
      return readBytes(file, pos, pos + 8).then(function (h) {
        var id = str(h, 0, 4), size = h.getUint32(4), body = pos + 8, p = Promise.resolve();
        if (id === 'COMM') p = readBytes(file, body, body + Math.min(size, 40)).then(function (d) {
          comm = { ch: d.getUint16(0), frames: d.getUint32(2), bits: d.getUint16(6), sr: ext80(d, 8), comp: info.aifc && size >= 22 ? str(d, 18, 4) : 'NONE' };
        });
        if (id === 'SSND') p = readBytes(file, body, body + 8).then(function (d) { var off = d.getUint32(0); ssnd = { offset: body + 8 + off, length: Math.min(size - 8 - off, file.size - body - 8 - off) }; });
        return p.then(function () { pos = body + size + (size & 1); return next(); });
      });
    }
    function finish() {
      if (!comm || !ssnd) return null;
      var c = comm.comp, codec = 'int', le = false, bits = comm.bits;
      if (c === 'sowt') le = true;
      else if (c === 'fl32' || c === 'FL32') { codec = 'float'; bits = 32; }
      else if (c === 'fl64' || c === 'FL64') { codec = 'float'; bits = 64; }
      else if (c === 'in24') bits = 24; else if (c === 'in32') bits = 32;
      else if (c !== 'NONE' && c !== 'twos') return null;
      var fb = comm.ch * Math.ceil(bits / 8);
      return { ch: comm.ch, sr: comm.sr, bits: bits, codec: codec, le: le, frameBytes: fb, offset: ssnd.offset, length: Math.min(ssnd.length, comm.frames * fb) };
    }
    return next();
  }
  function cafInfo(file) {
    var pos = 8, desc = null, data = null;
    function next() {
      if (pos + 12 > file.size || (desc && data)) return finish();
      return readBytes(file, pos, pos + 12).then(function (h) {
        var id = str(h, 0, 4), size = h.getUint32(4) * 4294967296 + h.getUint32(8), body = pos + 12, p = Promise.resolve();
        if (id === 'desc') p = readBytes(file, body, body + 32).then(function (d) {
          desc = { sr: d.getFloat64(0), id: str(d, 8, 4), flags: d.getUint32(12), bpp: d.getUint32(16), ch: d.getUint32(24), bits: d.getUint32(28) };
        });
        if (id === 'data') { var len = (h.getInt32(4) === -1) ? file.size - body - 4 : size - 4; data = { offset: body + 4, length: Math.min(len, file.size - body - 4) }; size = len + 4; }
        return p.then(function () { pos = body + size; return next(); });
      });
    }
    function finish() {
      if (!desc || !data || desc.id !== 'lpcm') return null;
      return { ch: desc.ch, sr: desc.sr, bits: desc.bits, codec: (desc.flags & 1) ? 'float' : 'int', le: !!(desc.flags & 2), frameBytes: desc.bpp || desc.ch * desc.bits / 8, offset: data.offset, length: data.length };
    }
    return next();
  }
  function readPCM(file, f, maxSeconds) {
    var total = Math.floor(f.length / f.frameBytes), frames = maxSeconds ? Math.min(total, Math.ceil(maxSeconds * f.sr)) : total;
    if (!(f.ch > 0 && f.sr >= 3000 && frames > 0)) return Promise.resolve(null);
    var B = Math.ceil(f.bits / 8);
    return file.slice(f.offset, f.offset + frames * f.frameBytes).arrayBuffer().then(function (ab) {
      var dv = new DataView(ab), out = [], c, i;
      for (c = 0; c < f.ch; c++) out.push(new Float32Array(frames));
      for (i = 0; i < frames; i++) {
        var base = i * f.frameBytes;
        for (c = 0; c < f.ch; c++) {
          var o = base + c * B, v;
          if (f.codec === 'float') v = B === 8 ? dv.getFloat64(o, f.le) : dv.getFloat32(o, f.le);
          else if (B === 1) v = (dv.getUint8(o) - 128) / 128;
          else if (B === 2) v = dv.getInt16(o, f.le) / 32768;
          else if (B === 3) { var x = f.le ? (dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16)) : ((dv.getInt8(o) << 16) | (dv.getUint8(o + 1) << 8) | dv.getUint8(o + 2)); v = x / 8388608; }
          else v = dv.getInt32(o, f.le) / 2147483648;
          out[c][i] = v;
        }
      }
      return { ch: out, sr: f.sr };
    });
  }

  /* ---------- fold to 1-2 channels and bring to 44.1 kHz ---------- */
  function normalise(raw) {
    var ch = raw.ch;
    if (ch.length > 2) {   /* even channels left, odd channels right */
      var n = ch[0].length, L = new Float32Array(n), R = new Float32Array(n), nl = 0, nr = 0;
      ch.forEach(function (c, k) { var d = k % 2 ? R : L; if (k % 2) nr++; else nl++; for (var i = 0; i < n; i++) d[i] += c[i]; });
      for (var i = 0; i < n; i++) { L[i] /= nl; R[i] /= nr; }
      ch = [L, R];
    }
    if (raw.sr === SR) return Promise.resolve({ ch: ch, sr: SR, dur: ch[0].length / SR });
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var len = Math.max(1, Math.ceil(ch[0].length * SR / raw.sr)), oc = new AC(ch.length, len, SR);
    var buf = oc.createBuffer(ch.length, ch[0].length, raw.sr);
    ch.forEach(function (c, k) { buf.getChannelData(k).set(c); });
    var src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
    return oc.startRendering().then(function (r) {
      var o = []; for (var k = 0; k < r.numberOfChannels; k++) o.push(r.getChannelData(k));
      return { ch: o, sr: SR, dur: r.length / SR };
    });
  }

  /* ---------- the browser's own decoder ---------- */
  function nativeDecode(ab) {
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new AC(2, SR, SR);
    return new Promise(function (res, rej) { var p = oc.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }).then(function (buf) {
      var o = []; for (var k = 0; k < buf.numberOfChannels; k++) o.push(buf.getChannelData(k));
      return { ch: o, sr: buf.sampleRate };
    });
  }
  var loaded = {};
  function loadScript(file) {
    if (loaded[file]) return loaded[file];
    var base = document.documentElement.getAttribute('data-base') || '';
    return (loaded[file] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = base + VENDOR + file; s.charset = 'UTF-8'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }
  function wasmDecode(kind, ab) {
    var spec = { opus: ['ogg-opus-decoder-1.7.5.min.js', 'ogg-opus-decoder', 'OggOpusDecoder'],
                 vorbis: ['ogg-vorbis-decoder-0.1.20.min.js', 'ogg-vorbis-decoder', 'OggVorbisDecoder'],
                 flac: ['flac-decoder-0.2.11.min.js', 'flac-decoder', 'FLACDecoder'],
                 oggflac: ['flac-decoder-0.2.11.min.js', 'flac-decoder', 'FLACDecoder'] }[kind];
    if (!spec) return Promise.reject(err('format'));
    return loadScript(spec[0]).then(function () {
      var D = window[spec[1]] && window[spec[1]][spec[2]]; if (!D) throw err('format');
      var d = new D();
      return d.ready.then(function () { return d.decodeFile ? d.decodeFile(new Uint8Array(ab)) : d.decode(new Uint8Array(ab)); })
        .then(function (r) { d.free(); if (!r || !r.samplesDecoded) throw err('format'); return { ch: r.channelData, sr: r.sampleRate }; });
    });
  }

  function hasFourCC(ab, cc) {
    var u = new Uint8Array(ab), a = cc.charCodeAt(0), b = cc.charCodeAt(1), c = cc.charCodeAt(2), d = cc.charCodeAt(3);
    for (var i = 0; i + 3 < u.length; i++) if (u[i] === a && u[i + 1] === b && u[i + 2] === c && u[i + 3] === d) return true;
    return false;
  }
  /* ---------- public ---------- */
  /* opts.maxSeconds: read only the beginning (PCM files, and MP3 by slicing). opts.maxBytes: limit for files that must be read whole. */
  function decode(file, opts) {
    opts = opts || {};
    return sniff(file).then(function (info) {
      var pcm = info.kind === 'wav' ? wavInfo(file, info) : info.kind === 'aiff' ? aiffInfo(file, info) : info.kind === 'caf' ? cafInfo(file) : Promise.resolve(null);
      return pcm.then(function (f) { return f ? readPCM(file, f, opts.maxSeconds) : null; }).then(function (raw) {
        if (raw) return raw;
        if (info.kind === 'midi') throw err('format', info.name);
        var blob = file;
        if (opts.maxSeconds && info.kind === 'mp3' && file.size > opts.maxSeconds * 40000) blob = file.slice(0, opts.maxSeconds * 40000);   /* 320 kbps × maxSeconds */
        var limit = opts.maxBytes ? (info.video ? opts.maxBytes * 3 : opts.maxBytes) : Infinity;
        if (blob.size > limit) throw err('size', info.name);
        return blob.arrayBuffer().then(function (ab) {
          return nativeDecode(ab.slice(0)).catch(function () {
            return wasmDecode(info.kind === 'ogg' ? 'vorbis' : info.kind, ab).catch(function () {
              /* Apple Lossless: only Safari reads it */
              if ((info.kind === 'mp4' || info.kind === 'caf') && hasFourCC(ab, 'alac')) throw err('format', 'Apple Lossless, which only Safari can read');
              throw err('format', info.name);
            });
          });
        });
      }).then(function (raw) {
        if (!raw.ch.length || !raw.ch[0].length) throw err('format', info.name);
        return normalise(raw);
      }).then(function (r) { r.format = info.name; return r; });
    });
  }
  window.WCDecode = { decode: decode, sniff: sniff, ACCEPT: ACCEPT, SR: SR };
})();
