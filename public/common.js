/* Shared client helpers: live connection, server clock, sounds. */
(function () {
  const ECC = (window.ECC = {});
  ECC.CLASSES = ['1A', '1B', '1C'];
  ECC.LETTERS = ['A', 'B', 'C', 'D'];
  ECC.offset = 0; // serverNow - Date.now()
  ECC.serverNow = () => Date.now() + ECC.offset;

  ECC.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  ECC.$ = (sel, root = document) => root.querySelector(sel);
  ECC.pct = v => (v === null || v === undefined ? '—' : Math.round(v * 100) + '%');

  // precise clock offset using a few round-trips
  ECC.syncClock = async function () {
    let best = null;
    for (let i = 0; i < 4; i++) {
      try {
        const t0 = Date.now();
        const r = await fetch('/api/time', { cache: 'no-store' });
        const { now } = await r.json();
        const t1 = Date.now();
        const rtt = t1 - t0;
        if (!best || rtt < best.rtt) best = { rtt, off: now - (t0 + rtt / 2) };
      } catch (e) { /* offline */ }
    }
    if (best) ECC.offset = best.off;
  };

  // live updates over Server-Sent Events, with automatic reconnection
  ECC.connect = function (params, onState, onStatus) {
    let es;
    const qs = new URLSearchParams(params).toString();
    function open() {
      es = new EventSource('/events?' + qs);
      es.onopen = () => onStatus && onStatus(true);
      es.onmessage = ev => {
        const st = JSON.parse(ev.data);
        onState(st);
      };
      es.onerror = () => { onStatus && onStatus(false); };
    }
    open();
    ECC.syncClock();
    setInterval(ECC.syncClock, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ECC.syncClock(); });
    return { close: () => es && es.close(), reopen: () => { es && es.close(); open(); } };
  };

  ECC.post = async function (url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'same-origin' });
    let data = {};
    try { data = await r.json(); } catch (e) { }
    if (!r.ok) { const err = new Error(data.message || data.error || 'Request failed'); err.code = data.error; err.status = r.status; throw err; }
    return data;
  };

  // ------------------------------------------------------------ original synthesized sound effects
  const Snd = (ECC.sound = { enabled: false, ctx: null });
  function ctx() {
    if (!Snd.ctx) Snd.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (Snd.ctx.state === 'suspended') Snd.ctx.resume();
    return Snd.ctx;
  }
  function tone(freq, start, dur, { type = 'square', vol = 0.12, slide = 0, attack = 0.005 } = {}) {
    const c = ctx();
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(start, dur, vol = 0.1) {
    const c = ctx();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    s.connect(f).connect(g).connect(c.destination);
    s.start(c.currentTime + start);
  }
  Snd.unlock = () => { try { ctx(); } catch (e) { } };
  Snd.play = function (name) {
    if (!Snd.enabled) return;
    try {
      const fx = {
        start() { // rising game-show arpeggio + sparkle
          [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: 'square', vol: 0.09 }));
          tone(1047, 0.48, 0.5, { type: 'triangle', vol: 0.12 });
          tone(1319, 0.48, 0.5, { type: 'triangle', vol: 0.08 });
          noise(0.45, 0.35, 0.05);
        },
        question() { tone(880, 0, 0.08, { type: 'triangle', vol: 0.1 }); tone(1175, 0.08, 0.14, { type: 'triangle', vol: 0.1 }); },
        pulse() { // heartbeat-style double thump
          tone(110, 0, 0.16, { type: 'sine', vol: 0.5, slide: -50 });
          tone(95, 0.17, 0.14, { type: 'sine', vol: 0.35, slide: -40 });
          tone(1500, 0, 0.03, { type: 'square', vol: 0.04 });
        },
        timeup() { // falling buzzer
          tone(330, 0, 0.5, { type: 'sawtooth', vol: 0.12, slide: -170 });
          tone(220, 0.05, 0.55, { type: 'square', vol: 0.07, slide: -100 });
        },
        reveal() { [659, 880, 1319].forEach((f, i) => tone(f, i * 0.07, 0.25, { type: 'triangle', vol: 0.1 })); },
        lead() { // short fanfare
          tone(523, 0, 0.12, { vol: 0.08 }); tone(659, 0.12, 0.12, { vol: 0.08 }); tone(784, 0.24, 0.12, { vol: 0.08 });
          tone(1047, 0.36, 0.35, { type: 'triangle', vol: 0.13 }); tone(784, 0.36, 0.35, { type: 'triangle', vol: 0.06 });
        },
        win() { // victory fanfare with chord
          const m = [[523, 0], [523, 0.15], [523, 0.3], [659, 0.45], [784, 0.75], [659, 1.0], [784, 1.15]];
          m.forEach(([f, t]) => tone(f, t, 0.22, { vol: 0.09 }));
          [523, 659, 784, 1047].forEach(f => tone(f, 1.4, 1.4, { type: 'triangle', vol: 0.08 }));
          for (let i = 0; i < 6; i++) noise(1.4 + i * 0.12, 0.2, 0.03);
        },
        correct() { tone(784, 0, 0.12, { type: 'triangle', vol: 0.12 }); tone(1175, 0.1, 0.25, { type: 'triangle', vol: 0.12 }); },
        tap() { tone(660, 0, 0.06, { type: 'triangle', vol: 0.08 }); }
      };
      fx[name] && fx[name]();
    } catch (e) { }
  };

  // ------------------------------------------------------------ original looping game-show music
  // lobby: bouncy major groove; think: driving minor arpeggio that speeds up near the end
  const TRACKS = {
    lobby: { bpm: 118, bass: [131, 131, 165, 165, 175, 175, 196, 147], chord: [[523, 659, 784], [523, 659, 784], [659, 831, 988], [659, 831, 988], [698, 880, 1047], [698, 880, 1047], [784, 988, 1175], [587, 740, 880]], lead: [784, 0, 659, 784, 880, 0, 784, 659, 698, 0, 880, 1047, 988, 784, 0, 587] },
    think: { bpm: 140, bass: [110, 110, 87, 87, 98, 98, 82, 82], arp: [440, 523, 659, 523, 349, 440, 523, 440, 392, 494, 587, 494, 330, 415, 494, 415] }
  };
  let music = null;
  Snd.music = function (name) {
    if (music && music.name === name) return;
    Snd.stopMusic();
    if (!name || !Snd.enabled) return;
    let c; try { c = ctx(); } catch (e) { return; }
    const tr = TRACKS[name];
    const m = (music = { name, step: 0, next: c.currentTime + 0.1, rate: 1, timer: null });
    m.timer = setInterval(() => {
      if (!Snd.enabled) return Snd.stopMusic();
      const spb = 60 / (tr.bpm * m.rate) / 2; // eighth notes
      while (m.next < c.currentTime + 0.25) {
        const s = m.step, t = m.next - c.currentTime;
        if (name === 'lobby') {
          if (s % 2 === 0) tone(tr.bass[(s / 2) % 8] , t, spb * 1.6, { type: 'triangle', vol: 0.16 });
          if (s % 4 === 2) tr.chord[Math.floor(s / 2) % 8].forEach(f => tone(f, t, spb * 0.9, { type: 'square', vol: 0.025 }));
          const L = tr.lead[s % 16]; if (L && s % 32 >= 16) tone(L, t, spb * 0.8, { type: 'triangle', vol: 0.05 });
          if (s % 2 === 1) noise(t, 0.04, 0.025);
        } else {
          tone(tr.arp[s % 16], t, spb * 0.8, { type: 'square', vol: 0.035 });
          if (s % 2 === 0) tone(tr.bass[(s / 2) % 8], t, spb * 1.5, { type: 'triangle', vol: 0.15 });
          if (s % 4 === 0) tone(60, t, 0.12, { type: 'sine', vol: 0.3, slide: -25 });
          noise(t, 0.03, s % 2 ? 0.02 : 0.035);
        }
        m.step++; m.next += spb;
      }
    }, 60);
  };
  Snd.setRate = r => { if (music) music.rate = r; };
  Snd.stopMusic = function () { if (music) { clearInterval(music.timer); music = null; } };
})();
