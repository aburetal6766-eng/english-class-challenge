/* Single-device simulation of a live round (same scoring rules as the server). */
(function () {
  const QUESTIONS = /*QUESTIONS*/[];
  const QSEC = 30, REVEAL = 5, INTRO = 3500;
  const CL = ['1A', '1B', '1C'];
  const NAMES = {
    '1A': ['Sara Alotaibi', 'Lama Alharbi', 'Noura Alqahtani', 'Reem Alshehri', 'Hala Alzahrani', 'Jana Almutairi'],
    '1B': ['Maha Alghamdi', 'Dana Aldosari', 'Joud Alenezi', 'Lina Alshammari', 'Rana Alsubaie', 'Raghad Alamri'],
    '1C': ['Huda Almalki', 'Asma Alanazi', 'Nada Alyami', 'Mai Alrashidi', 'Ruba Alqarni', 'Shahad Alsaeed']
  };
  const rosters = {};
  CL.forEach(c => { rosters[c] = NAMES[c].map((n, i) => ({ id: c + '-' + i, name: n })); });
  const short = n => { const p = n.split(' '); return p[0] + ' ' + p[p.length - 1][0] + '.'; };

  let S, timers = [], screen, student, me = null;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function clearAll() { timers.forEach(clearTimeout); timers = []; }

  function reset() {
    clearAll();
    S = { id: 'demo' + Date.now(), status: 'lobby', players: {}, answers: {}, qIndex: -1, finished: 0, leaders: [], leadEvent: 0, ticker: 'Get ready! Your teacher will start the quiz soon.' };
    me = null;
    // bots join the lobby one by one (4 + 3 + 4) — different class sizes on purpose
    const bots = [];
    CL.forEach(c => rosters[c].slice(1, c === '1B' ? 4 : 5).forEach(s => bots.push({ sid: s.id, classId: c, skill: 0.45 + Math.random() * 0.45, speed: 2500 + Math.random() * 9000 })));
    bots.sort(() => Math.random() - 0.5).forEach((b, i) => later(600 + i * 260, () => { if (S.status === 'lobby') { S.players[b.sid] = b; push(); } }));
    push();
  }
  function standings() {
    const ps = {};
    (S.startPlayers || Object.keys(S.players)).forEach(sid => {
      const p = S.players[sid], st = rosters[p.classId].find(x => x.id === sid);
      ps[sid] = { sid, classId: p.classId, short: short(st.name), correct: 0, timeMs: 0 };
    });
    for (let q = 0; q < S.finished; q++) for (const sid in S.answers[q] || {}) { const a = S.answers[q][sid]; if (a.correct && ps[sid]) { ps[sid].correct++; ps[sid].timeMs += a.ms; } }
    const ranking = Object.values(ps).sort((a, b) => b.correct - a.correct || a.timeMs - b.timeMs);
    ranking.forEach((p, i) => p.rank = i + 1);
    const classes = CL.map(c => {
      const joined = (S.joinedAtStart || {})[c] || 0;
      const correct = ranking.filter(p => p.classId === c).reduce((s, p) => s + p.correct, 0);
      return { id: c, joined, pct: joined ? (S.finished ? correct / (joined * S.finished) : 0) : null };
    });
    const vals = classes.filter(c => c.pct !== null).map(c => c.pct), best = vals.length ? Math.max(...vals) : 0;
    const leaders = !S.finished || !best ? [] : classes.filter(c => c.pct !== null && Math.abs(c.pct - best) < 1e-9).map(c => c.id);
    return { ranking, classes, leaders };
  }
  function start() {
    if (S.status !== 'lobby') return;
    S.startPlayers = Object.keys(S.players);
    S.joinedAtStart = Object.fromEntries(CL.map(c => [c, S.startPlayers.filter(s => S.players[s].classId === c).length]));
    S.status = 'intro'; S.introEnds = Date.now() + INTRO; S.ticker = "Let's go! Cheer for your class!";
    later(INTRO, () => openQ(0));
    push();
  }
  function openQ(i) {
    clearAll();
    S.status = 'question'; S.qIndex = i; S.qOpenedAt = Date.now(); S.deadline = S.qOpenedAt + QSEC * 1000; S.answers[i] = {};
    S.startPlayers.forEach(sid => {
      const b = S.players[sid]; if (!b.skill) return;
      const t = Math.min(QSEC * 1000 - 600, b.speed * (0.6 + Math.random() * 0.8));
      later(t, () => {
        if (S.status !== 'question' || S.qIndex !== i) return;
        const right = Math.random() < b.skill;
        const corr = QUESTIONS[i][2];
        const choice = right ? corr : [0, 1, 2, 3].filter(k => k !== corr)[Math.floor(Math.random() * 3)];
        answer(sid, choice);
      });
    });
    later(QSEC * 1000, closeQ);
    push();
  }
  function answer(sid, choice) {
    if (S.status !== 'question' || S.answers[S.qIndex][sid]) return;
    S.answers[S.qIndex][sid] = { choice, ms: Date.now() - S.qOpenedAt, correct: choice === QUESTIONS[S.qIndex][2] };
    push();
    if (Object.keys(S.answers[S.qIndex]).length >= S.startPlayers.length) { const qi = S.qIndex; later(800, () => { if (S.status === 'question' && S.qIndex === qi) closeQ(); }); }
  }
  function closeQ() {
    if (S.status !== 'question') return;
    clearAll();
    S.status = 'reveal'; S.finished = S.qIndex + 1;
    const prev = S.leaders.join(), st = standings(); S.leaders = st.leaders;
    if (st.leaders.length && st.leaders.join() !== prev) { S.leadEvent++; S.ticker = st.leaders.length === 1 ? `Class ${st.leaders[0]} takes the lead!` : `${st.leaders.map(c => 'Class ' + c).join(' & ')} share the lead!`; }
    else if (st.leaders.length) { const o = CL.filter(c => !st.leaders.includes(c) && S.joinedAtStart[c]); const p = o[S.qIndex % Math.max(1, o.length)]; S.ticker = p ? `Class ${st.leaders.join(' & ')} stays on top — come on, Class ${p}!` : `Class ${st.leaders.join(' & ')} stays on top!`; }
    else S.ticker = 'Every answer counts — keep going!';
    S.nextAt = Date.now() + REVEAL * 1000;
    later(REVEAL * 1000, () => S.qIndex >= QUESTIONS.length - 1 ? finish() : openQ(S.qIndex + 1));
    push();
  }
  function finish() {
    clearAll();
    S.status = 'final';
    const st = standings(); S.leaders = st.leaders;
    S.ticker = st.leaders.length === 1 ? `Class ${st.leaders[0]} wins the English Class Challenge!` : st.leaders.length ? `It's a tie! ${st.leaders.map(c => 'Class ' + c).join(' & ')} win together!` : 'Great job, everyone!';
    push();
  }
  function skip() { if (S.status === 'question') closeQ(); else if (S.status === 'reveal') { clearAll(); S.qIndex >= QUESTIONS.length - 1 ? finish() : openQ(S.qIndex + 1); } }

  function publicView() {
    const v = { serverNow: Date.now(), status: S.status, mode: 'demo', roundId: S.id, ticker: S.ticker, leadEvent: S.leadEvent, compName: 'English Class Challenge!' };
    v.lobbyCounts = Object.fromEntries(CL.map(c => [c, Object.values(S.players).filter(p => p.classId === c).length]));
    if (S.status === 'lobby') return v;
    const st = standings();
    v.introEnds = S.introEnds; v.qTotal = QUESTIONS.length;
    v.classes = st.classes; v.leaders = S.leaders;
    v.top10 = st.ranking.slice(0, 10).map(p => ({ rank: p.rank, short: p.short, classId: p.classId, correct: p.correct }));
    if (S.qIndex >= 0 && S.status !== 'final') {
      const q = QUESTIONS[S.qIndex];
      Object.assign(v, { qIndex: S.qIndex, question: { text: q[0], options: q[1] }, deadline: S.deadline, qOpenedAt: S.qOpenedAt, answerCount: Object.keys(S.answers[S.qIndex] || {}).length, playerCount: S.startPlayers.length });
      if (S.status === 'reveal') { v.correct = q[2]; v.dist = [0, 1, 2, 3].map(k => Object.values(S.answers[S.qIndex]).filter(a => a.choice === k).length); v.isLast = S.qIndex >= QUESTIONS.length - 1; }
    }
    if (S.status === 'final') v.winners = S.leaders;
    return v;
  }
  function studentView() {
    const v = publicView();
    v.rosters = Object.fromEntries(CL.map(c => [c, rosters[c].map(s => ({ id: s.id, name: s.name, taken: !!S.players[s.id] && s.id !== me }))]));
    if (me && S.players[me]) {
      const p = S.players[me];
      v.me = { sid: me, classId: p.classId, name: rosters[p.classId].find(x => x.id === me).name };
      const a = S.qIndex >= 0 && S.answers[S.qIndex] && S.answers[S.qIndex][me];
      if (a) { v.me.answer = a.choice; if (S.status === 'reveal') v.me.wasCorrect = a.correct; }
      if (S.status !== 'lobby') { const r = standings().ranking.find(x => x.sid === me); if (r) { v.me.correct = r.correct; v.me.rank = r.rank; v.me.total = S.startPlayers.length; } }
    }
    return v;
  }
  function push() {
    screen.update(publicView());
    student.update(studentView());
    document.getElementById('startBtn').disabled = S.status !== 'lobby';
    document.getElementById('skipBtn').disabled = !(S.status === 'question' || S.status === 'reveal');
  }

  const api = {
    join: async (c, sid) => {
      if (S.status !== 'lobby') throw new Error('The quiz has already started.');
      if (S.players[sid] && sid !== me) throw new Error('This name has already joined.');
      if (me) delete S.players[me];
      me = sid; S.players[sid] = { sid, classId: c }; push();
    },
    leave: async () => { if (me) delete S.players[me]; me = null; push(); },
    answer: async (qi, choice) => { if (qi === S.qIndex) answer(me, choice); }
  };

  document.getElementById('pagebg').innerHTML = ECC.stars(30);
  screen = ECC.Screen(document.getElementById('screen'), { embedded: true });
  student = ECC.Student(document.getElementById('phone'), api);
  document.getElementById('startBtn').onclick = () => { screen.enableSound(); start(); };
  document.getElementById('skipBtn').onclick = skip;
  document.getElementById('resetBtn').onclick = reset;
  document.getElementById('fsBtn').onclick = () => { const el = document.getElementById('screen'); (el.requestFullscreen ? el.requestFullscreen() : Promise.reject()).catch(() => {}); };
  reset();
})();
