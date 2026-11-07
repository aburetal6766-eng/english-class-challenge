/* Presentation screen renderer (used by /screen and by the demo). */
(function () {
  const { esc, pct, LETTERS, CLASSES } = ECC;
  const ICON = {
    crown: '<svg class="crown" viewBox="0 0 40 32" aria-hidden="true"><path fill="currentColor" d="M3 9l8 7 9-13 9 13 8-7-3 19H6z"/><rect x="6" y="27" width="28" height="4" rx="2" fill="currentColor"/></svg>',
    trophy: '<svg class="trophy" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M18 6h28v6h10v6c0 8-6 14-13 15-2 5-5 8-9 9v7h8v6H22v-6h8v-7c-4-1-7-4-9-9C14 32 8 26 8 18v-6h10zm-4 12c0 4 2 7 5 9-1-3-1-6-1-9zm32 0c0 3 0 6-1 9 3-2 5-5 5-9z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>',
    on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>',
    off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>'
  };
  ECC.ICON = ICON;
  const R = 78, CIRC = 2 * Math.PI * R;

  function stars(n) {
    let h = '';
    for (let i = 0; i < n; i++) {
      const edge = Math.random() < 0.5;
      const x = edge ? (Math.random() < 0.5 ? Math.random() * 18 : 82 + Math.random() * 18) : Math.random() * 100;
      const y = edge ? Math.random() * 100 : (Math.random() < 0.5 ? Math.random() * 14 : 86 + Math.random() * 14);
      h += `<i class="star" style="left:${x}%;top:${y}%;animation-delay:${(Math.random() * 3).toFixed(2)}s"></i>`;
    }
    return h;
  }
  ECC.stars = stars;

  ECC.Screen = function (root, opts = {}) {
    root.innerHTML = `
      <div class="bg">${stars(46)}</div>
      <div class="stage-wrap${opts.embedded ? ' embedded' : ''}"><div class="stage" id="stage">
        <header class="topbar">
          <div class="brand">ENGLISH CLASS CHALLENGE<span class="bang">!</span></div>
          <span class="live"><i></i>LIVE</span>
          <span class="demo-tag hidden" id="demoTag">DEMO ROUND</span>
          <div class="qcount hidden" id="qcount"></div>
          <button class="sound-btn" id="soundBtn" type="button"></button>
        </header>
        <section class="main" id="main"></section>
        <footer class="ticker">${ICON.star}<span class="msg" id="ticker"></span></footer>
      </div></div>`;
    const stage = root.querySelector('#stage');
    const main = root.querySelector('#main');
    const soundBtn = root.querySelector('#soundBtn');
    const tickerEl = root.querySelector('#ticker');
    let st = null, layout = null, lastTicker = '', mem = { status: null, qIndex: null, leadEvent: null, pulse: null };

    function fit() {
      const w = opts.embedded ? root.clientWidth : window.innerWidth, h = opts.embedded ? root.clientHeight : window.innerHeight;
      const s = Math.min(w / 1920, h / 1080);
      stage.style.transform = `scale(${s})`;
    }
    window.addEventListener('resize', fit); fit();
    if (opts.embedded && window.ResizeObserver) new ResizeObserver(fit).observe(root);

    // sound toggle
    let pref = true;
    try { pref = localStorage.getItem('ecc_sound') !== 'off'; } catch (e) { }
    function paintSound() {
      const on = ECC.sound.enabled;
      soundBtn.className = 'sound-btn' + (on ? '' : ' off');
      soundBtn.innerHTML = (on ? ICON.on : ICON.off) + (on ? 'Sound on' : (pref ? 'Click for sound' : 'Muted'));
      soundBtn.setAttribute('aria-label', on ? 'Mute sound effects' : 'Turn on sound effects');
    }
    soundBtn.addEventListener('click', e => {
      e.stopPropagation();
      ECC.sound.unlock();
      ECC.sound.enabled = !ECC.sound.enabled;
      pref = ECC.sound.enabled;
      try { localStorage.setItem('ecc_sound', pref ? 'on' : 'off'); } catch (e2) { }
      if (!pref) ECC.sound.stopMusic(); else syncMusic(true);
      paintSound();
    });
    document.addEventListener('click', () => {
      if (pref && !ECC.sound.enabled) { ECC.sound.unlock(); ECC.sound.enabled = true; paintSound(); syncMusic(true); }
    });
    paintSound();

    function syncMusic(force) {
      if (!st || !ECC.sound.enabled) return;
      if (st.status === 'lobby' || st.status === 'idle') ECC.sound.music('lobby');
      else if (st.status === 'question') { if (force || mem.status !== 'question') ECC.sound.music('think'); }
      else ECC.sound.stopMusic();
    }

    function sounds(prev, s) {
      if (!ECC.sound.enabled) return;
      if (s.status === 'intro' && prev.status !== 'intro') ECC.sound.play('start');
      if (s.status === 'question' && (prev.status !== 'question' || prev.qIndex !== s.qIndex)) ECC.sound.play('question');
      if (s.status === 'reveal' && prev.status === 'question') { ECC.sound.play('timeup'); setTimeout(() => ECC.sound.play('reveal'), 650); }
      if (s.leadEvent && prev.leadEvent !== null && s.leadEvent !== prev.leadEvent && s.status === 'reveal') setTimeout(() => ECC.sound.play('lead'), 1400);
      if (s.status === 'final' && prev.status && prev.status !== 'final') setTimeout(() => ECC.sound.play('win'), 300);
    }

    // ------------------------------------------------------------ layouts
    function heroLayout() {
      main.innerHTML = `<div class="hero" id="hero"></div>`;
      return { kind: 'hero', hero: main.querySelector('#hero') };
    }
    function gameLayout() {
      main.innerHTML = `
        <aside class="panel"><h3>CLASS RACE</h3><div class="race">
          ${CLASSES.map(c => `<div class="racecard cls-${c}" data-c="${c}"><div class="row"><span class="nm">Class ${c}</span><span class="cr"></span><span class="pc">—</span></div><div class="bar"><i></i></div><div class="sub"></div></div>`).join('')}
        </div></aside>
        <div class="center">
          <div class="timer" id="timer"><svg viewBox="0 0 176 176"><circle cx="88" cy="88" r="${R}" fill="rgba(10,14,53,.6)" stroke="rgba(255,255,255,.15)" stroke-width="14"/><circle id="ring" cx="88" cy="88" r="${R}" fill="none" stroke="#22D3EE" stroke-width="14" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><div class="num" id="tnum"></div></div>
          <div class="qcard" id="qtext"></div>
          <div class="answers" id="answers"></div>
          <div class="answered" id="answered"></div>
        </div>
        <aside class="panel"><h3>TOP 10</h3><div class="top10" id="top10"></div></aside>`;
      return { kind: 'game', timer: main.querySelector('#timer'), ring: main.querySelector('#ring'), tnum: main.querySelector('#tnum'), qtext: main.querySelector('#qtext'), answers: main.querySelector('#answers'), answered: main.querySelector('#answered'), top10: main.querySelector('#top10') };
    }
    function finalLayout() {
      main.innerHTML = `<div class="final"><div class="winbox" id="winbox"></div><aside class="panel"><h3>TOP 10 STUDENTS</h3><div class="top10" id="top10"></div></aside></div>`;
      const conf = document.createElement('div');
      conf.className = 'confetti';
      const cols = ['#FF4FA3', '#3BA4FF', '#FFC233', '#FF5A5F', '#22C55E', '#FFFFFF', '#A78BFA'];
      for (let i = 0; i < 90; i++) conf.innerHTML += `<i style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-duration:${(3 + Math.random() * 4).toFixed(2)}s;animation-delay:${(-Math.random() * 6).toFixed(2)}s;transform:rotate(${Math.random() * 360}deg)"></i>`;
      main.querySelector('.final').appendChild(conf);
      return { kind: 'final', winbox: main.querySelector('#winbox'), top10: main.querySelector('#top10') };
    }

    function top10Html(list, n = 10) {
      let h = '';
      for (let i = 0; i < n; i++) {
        const p = list[i];
        if (!p) { h += `<div class="trow empty"><span class="rk">${i + 1}</span><span class="tn">—</span></div>`; continue; }
        h += `<div class="trow cls-${p.classId}${i === 0 && p.correct > 0 ? ' first' : ''}"><span class="rk">${p.rank}</span><span class="tn" style="--tn:${p.short.length > 14 ? 21 : 23}px">${esc(p.short)}</span><span class="tc">${p.classId}</span><span class="ts">${p.correct}</span></div>`;
      }
      return h;
    }

    function render() {
      const s = st;
      const kind = s.status === 'question' || s.status === 'reveal' ? 'game' : s.status === 'final' ? 'final' : 'hero';
      if (!layout || layout.kind !== kind) layout = kind === 'game' ? gameLayout() : kind === 'final' ? finalLayout() : heroLayout();
      root.querySelector('#demoTag').classList.toggle('hidden', s.mode !== 'demo');
      const qc = root.querySelector('#qcount');
      if (kind === 'game') { qc.classList.remove('hidden'); qc.innerHTML = `QUESTION <b>${String(s.qIndex + 1).padStart(2, '0')}</b> / ${String(s.qTotal).padStart(2, '0')}`; }
      else qc.classList.add('hidden');

      // ticker
      let msg = s.ticker || 'Think fast. Answer right. Cheer for your class!';
      if (s.status === 'idle') msg = 'Think fast. Answer right. Cheer for your class!';
      if (msg !== lastTicker) { tickerEl.textContent = msg; tickerEl.classList.remove('msg'); void tickerEl.offsetWidth; tickerEl.classList.add('msg'); lastTicker = msg; }

      if (kind === 'hero') {
        if (s.status === 'intro') {
          layout.hero.innerHTML = `<div class="t2">GET READY!</div><div class="countdown" id="cd">3</div><div class="t2">Think fast. Answer right. Cheer for your class!</div>`;
        } else {
          const counts = s.lobbyCounts || {};
          layout.hero.innerHTML = `
            <div class="t1">ENGLISH CLASS<br>CHALLENGE<span class="bang">!</span></div>
            <div class="t2">Think fast. Answer right. Cheer for your class!</div>
            ${s.status === 'lobby' ? `<div class="joinrow">${CLASSES.map(c => `<div class="joincard cls-${c}"><div class="nm">Class ${c}</div><div class="n">${counts[c] || 0}</div><div class="l">students ready</div></div>`).join('')}</div>` : ''}`;
        }
      }
      if (kind === 'game') {
        // race
        main.querySelectorAll('.racecard').forEach(card => {
          const c = (s.classes || []).find(x => x.id === card.dataset.c) || { pct: null, joined: 0 };
          const lead = (s.leaders || []).includes(card.dataset.c);
          card.classList.toggle('lead', lead);
          card.querySelector('.cr').innerHTML = lead ? ICON.crown : '';
          card.querySelector('.pc').textContent = pct(c.pct);
          card.querySelector('.bar i').style.width = (c.pct ? Math.round(c.pct * 100) : 0) + '%';
          card.querySelector('.sub').textContent = c.joined ? `${c.joined} student${c.joined > 1 ? 's' : ''} playing` : 'No students joined';
        });
        layout.top10.innerHTML = top10Html(s.top10 || []);
        const q = s.question || { text: '', options: ['', '', '', ''] };
        if (layout.qtext.dataset.k !== s.roundId + ':' + s.qIndex) {
          layout.qtext.textContent = q.text;
          layout.qtext.dataset.k = s.roundId + ':' + s.qIndex;
          const len = q.text.length;
          layout.qtext.style.fontSize = len > 95 ? '42px' : len > 65 ? '48px' : '56px';
        }
        layout.answers.innerHTML = q.options.map((o, i) => {
          let cls = 'ans opt' + LETTERS[i];
          if (s.status === 'reveal') cls += i === s.correct ? ' right' : ' dim';
          const fs = o.length > 26 ? 'font-size:34px' : '';
          return `<div class="${cls}" style="${fs}"><span class="lt">${LETTERS[i]}</span><span>${esc(o)}</span>${s.status === 'reveal' ? (i === s.correct ? `<span class="tick" style="margin-left:auto">${ICON.check}</span>` : '') + `<span class="cnt" ${i === s.correct ? 'style="margin-left:14px"' : ''}>${(s.dist || [])[i] || 0}</span>` : ''}</div>`;
        }).join('');
        layout.answered.textContent = s.status === 'question' ? `${s.answerCount || 0} of ${s.playerCount || 0} answered` : (s.isLast ? 'Final results coming up…' : 'Next question coming up…');
      }
      if (kind === 'final') {
        const w = s.winners || [];
        layout.winbox.innerHTML = `
          ${ICON.trophy}
          <div class="lbl">WINNING CLASS</div>
          <div class="wincls">${w.length ? w.map(c => `<span class="w cls-${c}">Class ${c}</span>`).join('') : '<span class="w" style="--cls:#fff">—</span>'}</div>
          ${w.length > 1 ? '<div class="tie">A tie at the top — both classes win!</div>' : ''}
          <div class="scores">${(s.classes || []).map(c => `<span class="cls-${c.id}">${c.id}: ${pct(c.pct)}</span>`).join('')}</div>`;
        layout.top10.innerHTML = top10Html(s.top10 || []);
      }
    }

    function tick() {
      if (st && layout) {
        const now = ECC.serverNow();
        if (layout.kind === 'game' && st.status === 'question') {
          const total = st.deadline - st.qOpenedAt;
          const left = Math.max(0, st.deadline - now);
          const secs = Math.ceil(left / 1000);
          layout.tnum.textContent = secs;
          layout.ring.style.strokeDashoffset = String(CIRC * (1 - left / total));
          layout.ring.style.stroke = secs > 10 ? '#22D3EE' : secs > 5 ? '#FFD24A' : '#FF4D6D';
          layout.timer.classList.toggle('hurry', secs <= 5);
          if (secs <= 3 && secs >= 1 && mem.pulse !== st.qIndex + ':' + secs) { mem.pulse = st.qIndex + ':' + secs; ECC.sound.play('pulse'); }
          ECC.sound.setRate(secs <= 5 ? 1.3 : 1);
        } else if (layout.kind === 'game' && st.status === 'reveal') {
          layout.tnum.textContent = '0'; layout.ring.style.strokeDashoffset = String(CIRC); layout.timer.classList.remove('hurry');
        } else if (st.status === 'intro') {
          const cd = main.querySelector('#cd');
          if (cd) { const n = Math.max(1, Math.ceil((st.introEnds - now - 500) / 1000)); if (cd.textContent !== String(n)) cd.textContent = n; }
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return {
      enableSound() { if (!ECC.sound.enabled) { ECC.sound.unlock(); ECC.sound.enabled = true; pref = true; paintSound(); syncMusic(true); } },
      update(s) {
        const prev = { ...mem };
        st = s;
        render();
        if (prev.status !== null) sounds(prev, s);
        syncMusic();
        mem.status = s.status; mem.qIndex = s.qIndex; mem.leadEvent = s.leadEvent || 0;
      }
    };
  };
})();
