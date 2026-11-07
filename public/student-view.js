/* Student device renderer (used by / and by the demo). */
(function () {
  const { esc, LETTERS, CLASSES } = ECC;
  const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M10 21v-6h4v6"/></svg>';
  const OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 12l3.5 3.5L17 9"/></svg>';
  const NO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 8l8 8M16 8l-8 8"/></svg>';
  const R = 27, CIRC = 2 * Math.PI * R;

  ECC.qrSvg = function (text) {
    try {
      const q = window.qrcode(0, 'M');
      q.addData(text); q.make();
      return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    } catch (e) { return ''; }
  };
  ECC.ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  ECC.Student = function (root, api) {
    root.innerHTML = `<div class="bg">${ECC.stars(26)}</div><div class="app" id="app"></div>`;
    const app = root.querySelector('#app');
    let st = null, pickClass = null, filter = '', busy = false, pending = null, error = '', streak = 0, lastRevealKey = '', online = true, viewKey = '';

    function head(me) {
      return `<div class="s-head"><div class="s-brand">English Class Challenge!<small>Think fast. Answer right. Cheer for your class!</small></div>
        ${me ? `<span class="chip cls-${me.classId}"><i></i><span dir="auto">${esc(me.name)}</span></span>` : ''}</div>
        ${online ? '' : '<div class="conn">Reconnecting…</div>'}`;
    }
    function toast(msg) {
      const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
      document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
    }

    async function doJoin(c, sid) {
      if (busy) return; busy = true;
      try { await api.join(c, sid); pickClass = null; filter = ''; }
      catch (e) { toast(e.message); }
      busy = false;
    }
    async function doLeave() {
      try { await api.leave(); } catch (e) { }
      pickClass = null; render(true);
    }
    async function doAnswer(i) {
      if (pending !== null || !st || st.status !== 'question') return;
      pending = { q: st.qIndex, choice: i };
      render(true);
      try { await api.answer(st.qIndex, i); }
      catch (e) { if (e.code !== 'already') { pending = null; toast(e.message); render(true); } }
    }

    function screen() {
      const s = st, me = s.me;
      if (!me) {
        if (s.status === 'idle') return { k: 'idle', h: head() + `<h1 class="s-title">Welcome!</h1><div class="bigcard"><p class="s-sub">The quiz is not open yet.<br>Your teacher will open it soon.</p><div class="waitdots"><i></i><i></i><i></i></div></div>` };
        if (s.status !== 'lobby') return { k: 'late', h: head() + `<div class="bigcard"><div class="who">The quiz has started</div><p class="s-sub">Watch the shared screen and cheer for your class!</p></div>` };
        if (!pickClass) {
          return { k: 'class', h: head() + `<h1 class="s-title">Choose your class</h1><div class="classes">${CLASSES.map(c => `<button class="classbtn cls-${c}" data-class="${c}"><span class="ic">${ICON_PIN}</span>Class ${c}</button>`).join('')}</div>` };
        }
        const list = (s.rosters && s.rosters[pickClass]) || [];
        const f = filter.trim().toLowerCase();
        const norm = x => x.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ئ/g, 'ي');
        const shown = f ? list.filter(x => norm(x.name).includes(norm(f))) : list;
        return { k: 'name:' + pickClass + ':' + f + ':' + list.map(x => x.taken ? 1 : 0).join(''), h: head() + `
          <h1 class="s-title cls-${pickClass}" style="color:var(--cls)">Class ${pickClass}</h1>
          <p class="s-sub">Tap your name</p>
          ${list.length > 6 ? `<input class="search" id="search" type="search" placeholder="Search your name… ابحثي عن اسمك" dir="auto" value="${esc(filter)}" aria-label="Search your name">` : ''}
          <div class="names cls-${pickClass}">${shown.map(x => `<button class="namebtn" dir="auto" data-sid="${x.id}" ${x.taken ? 'disabled' : ''}>${esc(x.name)}${x.taken ? '<em>joined</em>' : ''}</button>`).join('') || '<p class="s-sub">No names found. Ask your teacher.</p>'}</div>
          <button class="linkbtn" data-back>← Change class</button>` };
      }
      if (s.status === 'lobby') return { k: 'lobby', h: head(me) + `
        <div class="bigcard pop"><span class="badge cls-${me.classId}">Class ${me.classId}</span><div class="who" dir="auto">${esc(me.name)}</div>
        <p class="s-sub" style="font-size:19px;color:#fff">Get ready! Your teacher will start the quiz soon.</p><div class="waitdots"><i></i><i></i><i></i></div></div>
        <button class="linkbtn" data-leave>Not you? Change class or name</button>` };
      if (s.status === 'intro') return { k: 'intro', h: head(me) + `<div class="result wait pop"><div class="big">Get ready!</div><div class="small">The first question is coming…</div></div>` };
      if (s.status === 'question') {
        const answered = me.answer !== undefined || (pending && pending.q === s.qIndex);
        const choice = me.answer !== undefined ? me.answer : pending && pending.choice;
        const q = s.question;
        const top = `<div class="s-qtop"><span class="s-qn">QUESTION ${s.qIndex + 1} / ${s.qTotal}</span><div class="s-timer" id="stimer"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${R}" fill="rgba(10,14,53,.6)" stroke="rgba(255,255,255,.18)" stroke-width="6"/><circle id="sring" cx="32" cy="32" r="${R}" fill="none" stroke="#22D3EE" stroke-width="6" stroke-linecap="round" stroke-dasharray="${CIRC}"/></svg><b id="snum"></b></div></div>`;
        if (answered) return { k: 'q' + s.qIndex + 'a', h: head(me) + `<div class="s-q">${top}<div class="result wait pop"><div class="big">Answer submitted!</div><div class="small">You chose <b>${LETTERS[choice]}</b>. Wait for the answer…</div></div>
          <div class="s-ans">${q.options.map((o, i) => `<div class="s-opt opt${LETTERS[i]} ${i === choice ? 'picked' : 'dim'}"><span class="lt">${LETTERS[i]}</span>${esc(o)}</div>`).join('')}</div></div>` };
        return { k: 'q' + s.qIndex, h: head(me) + `<div class="s-q">${top}<div class="s-qcard">${esc(q.text)}</div>
          <div class="s-ans">${q.options.map((o, i) => `<button class="s-opt opt${LETTERS[i]}" data-opt="${i}"><span class="lt">${LETTERS[i]}</span>${esc(o)}</button>`).join('')}</div></div>` };
      }
      if (s.status === 'reveal') {
        const q = s.question, right = me.wasCorrect === true, none = me.answer === undefined;
        const key = s.roundId + ':' + s.qIndex;
        if (lastRevealKey !== key) { lastRevealKey = key; streak = right ? streak + 1 : 0; if (right && navigator.vibrate) navigator.vibrate([60, 40, 60]); }
        const cheer = right ? (streak >= 3 ? `On fire! ${streak} in a row!` : 'Great job!') : none ? "Time's up!" : 'Nice try! Keep going!';
        return { k: 'r' + s.qIndex, h: head(me) + `
          <div class="result ${right ? 'ok' : 'no'} pop">${right ? OK : NO}<div class="big">${right ? 'Correct!' : none ? 'No answer' : 'Not this time'}</div><div class="small">${cheer}</div></div>
          <div class="bigcard"><p class="s-sub">Correct answer</p><div class="s-opt opt${LETTERS[s.correct]} right" style="width:100%;min-height:70px"><span class="lt">${LETTERS[s.correct]}</span>${esc(q.options[s.correct])}</div>
          <div class="stat"><span>${me.correct || 0} correct</span>${me.rank ? `<span>Rank ${me.rank} of ${me.total}</span>` : ''}</div></div>` };
      }
      if (s.status === 'final') {
        const w = s.winners || [];
        const mine = w.includes(me.classId);
        const certUrl = me.certToken ? location.origin + '/c/' + me.certToken : '';
        return { k: 'final', h: head(me) + `
          <div class="result ${mine ? 'ok' : 'wait'} pop"><div class="small">WINNING CLASS</div><div class="big">${w.length ? w.map(c => 'Class ' + c).join(' & ') : '—'}</div>${mine ? '<div class="small">That\'s your class! Well done!</div>' : '<div class="small">Great effort, Class ' + me.classId + '!</div>'}</div>
          <div class="bigcard"><div class="stat"><span>${me.correct || 0} correct</span>${me.rank ? `<span>Your rank: ${ECC.ordinal(me.rank)}</span>` : ''}</div>
          ${certUrl ? `<p class="s-sub" style="color:#fff">You earned ${me.certCount > 1 ? 'two certificates' : 'a certificate'}!</p>
            <a class="cta" href="${certUrl}" target="_blank" rel="noopener">Download My Certificate</a>
            <div class="qrbox" aria-label="QR code to download your certificate"><img src="/c/${me.certToken}/qr.svg" alt="QR code for your certificate page"></div>
            <p class="s-sub" style="font-size:13px">Scan to open your certificate page</p>` : '<p class="s-sub">Thank you for playing!</p>'}</div>` };
      }
      return { k: 'x', h: head(me) };
    }

    function render(force) {
      if (!st) return;
      const v = screen();
      if (!force && v.k === viewKey && v.k !== 'final') return;
      const hadFocus = document.activeElement && document.activeElement.id === 'search';
      viewKey = v.k;
      app.innerHTML = v.h;
      if (hadFocus) { const i = app.querySelector('#search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }

    app.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.class) { pickClass = b.dataset.class; filter = ''; render(true); }
      else if (b.dataset.sid) doJoin(pickClass, b.dataset.sid);
      else if (b.hasAttribute('data-back')) { pickClass = null; render(true); }
      else if (b.hasAttribute('data-leave')) doLeave();
      else if (b.dataset.opt !== undefined) doAnswer(Number(b.dataset.opt));
    });
    app.addEventListener('input', e => { if (e.target.id === 'search') { filter = e.target.value; render(true); } });

    (function tick() {
      if (st && st.status === 'question') {
        const ring = app.querySelector('#sring'), num = app.querySelector('#snum'), box = app.querySelector('#stimer');
        if (ring) {
          const total = st.deadline - st.qOpenedAt, left = Math.max(0, st.deadline - ECC.serverNow());
          const secs = Math.ceil(left / 1000);
          num.textContent = secs;
          ring.style.strokeDashoffset = String(CIRC * (1 - left / total));
          ring.style.stroke = secs > 10 ? '#22D3EE' : secs > 5 ? '#FFD24A' : '#FF4D6D';
          box.classList.toggle('hurry', secs <= 5);
        }
      }
      requestAnimationFrame(tick);
    })();

    return {
      update(s) {
        if (st && (s.qIndex !== st.qIndex || s.status !== st.status)) pending = null;
        if (!s.me && st && st.me) pickClass = null;
        st = s; render();
      },
      online(v) { if (online !== v) { online = v; render(true); } }
    };
  };
})();
