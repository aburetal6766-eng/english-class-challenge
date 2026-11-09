'use strict';
/*
 * English Class Challenge! — live classroom quiz server.
 * Zero dependencies: Node.js 18+ built-ins only.
 *   PORT, DATA_DIR, AREEJ_PASSWORD, WAAD_PASSWORD (optional env vars)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { certificatePdf, ordinal } = require('./lib/pdf');
const { makeZip } = require('./lib/zip');
const qrSvg = require('./lib/qrsvg');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC = path.join(__dirname, 'public');
const CLASSES = ['1A', '1B', '1C'];
const INTRO_MS = 3500;

const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();

// ---------------------------------------------------------------- seed data
function q(text, options, correct) { return { id: rid(6), text, options, correct }; }
const SAMPLE_QUESTIONS = require('./lib/sample-questions').map(([t, o, c]) => q(t, o, c));
const DEMO_QUESTIONS = [
  q('DEMO: What color is the sky on a sunny day?', ['green', 'blue', 'purple', 'black'], 1),
  q('DEMO: How many days are in a week?', ['five', 'six', 'seven', 'eight'], 2),
  q('DEMO: Which one is a fruit?', ['carrot', 'bread', 'apple', 'milk'], 2),
  q('DEMO: "Good ____!" (in the morning)', ['night', 'morning', 'bye', 'evening'], 1)
];
function demoRoster(cls) {
  const first = { '1A': ['Sara', 'Lama', 'Noura', 'Reem', 'Hala'], '1B': ['Maha', 'Dana', 'Joud', 'Lina', 'Rana'], '1C': ['Huda', 'Asma', 'Nada', 'Mai', 'Ruba'] }[cls];
  return first.map((f, i) => ({ id: rid(6), name: `${f} Demo ${cls}`, english: `${f} Demo ${['Ali', 'Saad', 'Omar', 'Fahad', 'Nasser'][i]}`, display: '' }));
}
function liveRosters() {
  const src = require('./lib/rosters');
  return Object.fromEntries(CLASSES.map(c => [c, (src[c] || []).map(([name, english, display], i) => ({ id: `${c.toLowerCase()}-${String(i + 1).padStart(2, '0')}`, name, english, display: display || '' }))]));
}
function freshData() {
  return {
    v: 1,
    settings: {
      compName: 'English Class Challenge!',
      questionSeconds: 30,
      revealSeconds: 6,
      teacher1: 'Areej Al-Ameer',
      teacher2: 'Waad Al-Marzouq',
      principal: 'Amal Hijri'
    },
    teachers: [
      { id: 't1', login: 'areej', label: 'أريج الأمير' },
      { id: 't2', login: 'waad', label: 'وعد المرزوق' }
    ],
    auth: {},
    sessions: {},
    hostId: 't1',
    modes: {
      live: { rosters: liveRosters(), questions: SAMPLE_QUESTIONS },
      demo: { rosters: { '1A': demoRoster('1A'), '1B': demoRoster('1B'), '1C': demoRoster('1C') }, questions: DEMO_QUESTIONS }
    },
    round: null,
    results: []
  };
}

// ---------------------------------------------------------------- persistence
let D;
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { D = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { D = freshData(); }
  const f = freshData();
  D.settings = Object.assign(f.settings, D.settings || {});
  // update 2026-11-09: 30 s per question, map questions removed
  if (!D.settings.upd1109) {
    D.settings.questionSeconds = 30;
    D.settings.upd1109 = true;
    const drop = ["Gino's Italian Restaurant", "Andy's Bookstore is between", 'The health club is ____ the park'];
    if (D.modes && D.modes.live) D.modes.live.questions = D.modes.live.questions.filter(q => !drop.some(d => q.text.startsWith(d)));
  }
  D.teachers = D.teachers || f.teachers;
  D.auth = D.auth || {};
  D.sessions = D.sessions || {};
  D.modes = D.modes || f.modes;
  if (CLASSES.every(c => !(D.modes.live.rosters[c] || []).length)) D.modes.live.rosters = f.modes.live.rosters;
  D.results = D.results || [];
  // passwords
  for (const t of D.teachers) {
    const envPw = process.env[t.login.toUpperCase() + '_PASSWORD'];
    if (envPw) setPassword(t.id, envPw);
    else if (!D.auth[t.id]) {
      const pw = crypto.randomBytes(4).toString('hex');
      setPassword(t.id, pw);
      console.log(`\n  Initial password for ${t.login}: ${pw}\n  (set ${t.login.toUpperCase()}_PASSWORD to choose your own)\n`);
    }
  }
  save(true);
}
let saveTimer = null;
function save(immediate) {
  const write = () => {
    saveTimer = null;
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(D));
    fs.renameSync(tmp, DATA_FILE);
  };
  if (immediate) return write();
  if (!saveTimer) saveTimer = setTimeout(write, 250);
}
function setPassword(tid, pw) {
  const salt = rid(8);
  D.auth[tid] = { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') };
}
function checkPassword(tid, pw) {
  const a = D.auth[tid];
  if (!a || typeof pw !== 'string') return false;
  const h = crypto.scryptSync(pw, a.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
}

// ---------------------------------------------------------------- helpers
function shortName(st) {
  // screen name: teacher-set display name, else the English name (girl + father), else first two words of the list name
  if (st.display && st.display.trim()) return st.display.trim();
  if (st.english && st.english.trim()) return st.english.trim();
  return (st.name || '').trim().split(/\s+/).filter(w => w !== 'بنت' && w !== 'بن').slice(0, 2).join(' ');
}
function rosterIndex(rosters) {
  const m = {};
  for (const c of CLASSES) for (const s of rosters[c] || []) m[s.id] = { ...s, classId: c };
  return m;
}
function roundRosters(r) { return r.rosters || D.modes[r.mode].rosters; }

function computeStandings(r) {
  const idx = rosterIndex(roundRosters(r));
  const finished = r.finishedCount || 0;
  const players = {};
  for (const sid of r.startPlayers || Object.keys(r.players)) {
    const p = r.players[sid];
    if (!p) continue;
    const st = idx[sid] || { name: '?', english: '', display: '' };
    players[sid] = { sid, classId: p.classId, name: st.name, english: st.english || '', short: shortName(st), correct: 0, timeMs: 0, answered: 0 };
  }
  for (let qi = 0; qi < finished; qi++) {
    const ans = (r.answers[qi]) || {};
    for (const sid in ans) {
      const a = ans[sid];
      if (!players[sid]) continue;
      players[sid].answered++;
      if (a.correct) { players[sid].correct++; players[sid].timeMs += a.ms; }
    }
  }
  const ranking = Object.values(players).sort((a, b) =>
    b.correct - a.correct || a.timeMs - b.timeMs || a.short.localeCompare(b.short));
  ranking.forEach((p, i) => { p.rank = i + 1; });
  const classes = CLASSES.map(c => {
    const joined = (r.joinedAtStart && r.joinedAtStart[c]) || 0;
    const correct = Object.values(players).filter(p => p.classId === c).reduce((s, p) => s + p.correct, 0);
    const pct = joined === 0 ? null : (finished === 0 ? 0 : correct / (joined * finished));
    return { id: c, joined, correct, pct };
  });
  const vals = classes.filter(c => c.pct !== null).map(c => c.pct);
  const best = vals.length ? Math.max(...vals) : null;
  const leaders = (best === null || (finished === 0) || best === 0) ? [] :
    classes.filter(c => c.pct !== null && Math.abs(c.pct - best) < 1e-9).map(c => c.id);
  return { ranking, classes, leaders };
}

// ---------------------------------------------------------------- live round engine
let timer = null;
function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
function schedule(at, fn) { clearTimer(); timer = setTimeout(fn, Math.max(0, at - now())); }

function openRound(mode) {
  clearTimer();
  D.round = {
    id: rid(6), mode, status: 'lobby', createdAt: now(),
    players: {},        // sid -> {token, classId, joinedAt}
    tokens: {},         // token -> sid
    answers: {}, finishedCount: 0, qIndex: -1,
    ticker: 'Get ready! Your teacher will start the quiz soon.', leaders: [], leadEvent: 0
  };
  save(); broadcast();
}
function startRound() {
  const r = D.round;
  if (!r || r.status !== 'lobby') return 'not_in_lobby';
  const qs = D.modes[r.mode].questions.filter(x => x.text && x.options.every(o => o !== ''));
  if (!qs.length) return 'no_questions';
  r.questions = JSON.parse(JSON.stringify(qs));
  r.rosters = JSON.parse(JSON.stringify(D.modes[r.mode].rosters));
  r.startPlayers = Object.keys(r.players);
  r.joinedAtStart = Object.fromEntries(CLASSES.map(c => [c, r.startPlayers.filter(s => r.players[s].classId === c).length]));
  r.startedAt = now();
  r.status = 'intro';
  r.introEnds = now() + INTRO_MS;
  r.ticker = "Let's go! Cheer for your class!";
  schedule(r.introEnds, () => openQuestion(0));
  save(); broadcast();
  return null;
}
function openQuestion(i) {
  const r = D.round;
  if (!r) return;
  r.status = 'question';
  r.qIndex = i;
  r.qOpenedAt = now();
  r.deadline = r.qOpenedAt + D.settings.questionSeconds * 1000;
  r.answers[i] = r.answers[i] || {};
  schedule(r.deadline, () => closeQuestion());
  save(); broadcast();
}
function closeQuestion() {
  const r = D.round;
  if (!r || r.status !== 'question') return;
  r.status = 'reveal';
  r.finishedCount = r.qIndex + 1;
  r.closedAt = now();
  const prev = (r.leaders || []).join(',');
  const s = computeStandings(r);
  r.leaders = s.leaders;
  const cur = s.leaders.join(',');
  if (cur && cur !== prev) {
    r.leadEvent = (r.leadEvent || 0) + 1;
    r.ticker = s.leaders.length === 1 ? `Class ${s.leaders[0]} takes the lead!` :
      `${s.leaders.map(c => 'Class ' + c).join(' & ')} share the lead!`;
  } else if (cur) {
    const others = CLASSES.filter(c => !s.leaders.includes(c) && r.joinedAtStart[c] > 0);
    const pick = others[r.qIndex % Math.max(1, others.length)];
    r.ticker = pick ? `Class ${s.leaders.join(' & ')} stays on top — come on, Class ${pick}!` : `Class ${s.leaders.join(' & ')} stays on top!`;
  } else {
    r.ticker = 'Every answer counts — keep going!';
  }
  const last = r.qIndex >= r.questions.length - 1;
  r.nextAt = now() + D.settings.revealSeconds * 1000;
  schedule(r.nextAt, () => last ? finishRound() : openQuestion(r.qIndex + 1));
  save(); broadcast();
}
function finishRound() {
  const r = D.round;
  if (!r) return;
  clearTimer();
  if (r.status === 'question') { r.finishedCount = r.qIndex + 1; }
  r.status = 'final';
  r.finishedAt = now();
  const s = computeStandings(r);
  const winners = s.leaders.length ? s.leaders : [];
  r.leaders = winners;
  r.ticker = winners.length === 1 ? `Class ${winners[0]} wins the English Class Challenge!` :
    winners.length > 1 ? `It's a tie! ${winners.map(c => 'Class ' + c).join(' & ')} win together!` : 'Great job, everyone!';
  // certificates
  const idx = rosterIndex(r.rosters);
  const date = new Date(r.startedAt);
  const dateText = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh' });
  const ymd = new Date(r.startedAt + 3 * 3600e3).toISOString().slice(2, 10).replace(/-/g, '');
  const certs = [];
  const tokenFor = {};
  const tok = sid => (tokenFor[sid] = tokenFor[sid] || rid(20));
  const code = () => `ECC-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  s.ranking.slice(0, 10).forEach(p => {
    if (p.correct < 1) return;
    certs.push({ id: rid(6), code: code(), type: 'achievement', sid: p.sid, classId: p.classId, rank: p.rank, name: p.name, englishName: p.english, token: tok(p.sid) });
  });
  for (const c of winners) {
    for (const st of r.rosters[c] || []) {
      certs.push({ id: rid(6), code: code(), type: 'winning', sid: st.id, classId: c, name: st.name, englishName: st.english || '', coWinner: winners.length > 1, token: tok(st.id) });
    }
  }
  const result = {
    id: r.id, mode: r.mode, startedAt: r.startedAt, finishedAt: r.finishedAt, dateText,
    winners, classes: s.classes,
    top10: s.ranking.slice(0, 10).map(p => ({ rank: p.rank, sid: p.sid, short: p.short, name: p.name, classId: p.classId, correct: p.correct, timeMs: p.timeMs })),
    questionCount: r.finishedCount,
    certs
  };
  r.resultId = result.id;
  D.results = D.results.filter(x => x.id !== result.id);
  D.results.unshift(result);
  save(); broadcast();
}

// ---------------------------------------------------------------- views (what each client may see)
function publicView() {
  const r = D.round;
  const base = { serverNow: now(), compName: D.settings.compName, questionSeconds: D.settings.questionSeconds };
  if (!r) return { ...base, status: 'idle' };
  const v = { ...base, roundId: r.id, mode: r.mode, status: r.status, ticker: r.ticker, leadEvent: r.leadEvent || 0 };
  const lobbyCounts = Object.fromEntries(CLASSES.map(c => [c, Object.values(r.players).filter(p => p.classId === c).length]));
  v.lobbyCounts = lobbyCounts;
  if (r.status === 'lobby') return v;
  v.introEnds = r.introEnds;
  v.qTotal = r.questions.length;
  const s = computeStandings(r);
  v.classes = s.classes.map(c => ({ id: c.id, joined: c.joined, pct: c.pct }));
  v.leaders = r.leaders || [];
  v.top10 = s.ranking.slice(0, 10).map(p => ({ rank: p.rank, short: p.short, classId: p.classId, correct: p.correct }));
  v.finished = r.finishedCount;
  if (r.qIndex >= 0 && r.status !== 'final') {
    const qq = r.questions[r.qIndex];
    v.qIndex = r.qIndex;
    v.question = { text: qq.text, options: qq.options };
    v.deadline = r.deadline;
    v.qOpenedAt = r.qOpenedAt;
    v.answerCount = Object.keys(r.answers[r.qIndex] || {}).length;
    v.playerCount = (r.startPlayers || []).length;
    if (r.status === 'reveal') {
      v.correct = qq.correct;
      const dist = [0, 0, 0, 0];
      for (const a of Object.values(r.answers[r.qIndex] || {})) dist[a.choice]++;
      v.dist = dist;
      v.nextAt = r.nextAt;
      v.isLast = r.qIndex >= r.questions.length - 1;
    }
  }
  if (r.status === 'final') {
    v.winners = r.leaders;
    v.finishedAt = r.finishedAt;
  }
  return v;
}
function studentView(token) {
  const v = publicView();
  const r = D.round;
  // class + name lists (for joining)
  if (r) {
    const rosters = r.rosters || D.modes[r.mode].rosters;
    v.rosters = Object.fromEntries(CLASSES.map(c => [c, (rosters[c] || []).map(s => ({ id: s.id, name: s.name, taken: !!r.players[s.id] && r.players[s.id].token !== token && !r.players[s.id].token.startsWith('released-') }))]));
  }
  const sid = r && token ? r.tokens[token] : null;
  if (sid && r.players[sid] && r.players[sid].token === token) {
    const p = r.players[sid];
    const idx = rosterIndex(r.rosters || D.modes[r.mode].rosters);
    v.me = { sid, classId: p.classId, name: (idx[sid] || {}).name || '', inRound: !r.startPlayers || r.startPlayers.includes(sid) };
    if (r.qIndex >= 0 && r.answers[r.qIndex] && r.answers[r.qIndex][sid]) {
      const a = r.answers[r.qIndex][sid];
      v.me.answer = a.choice;
      if (r.status === 'reveal') v.me.wasCorrect = a.correct;
    }
    if (r.status !== 'lobby') {
      const s = computeStandings(r);
      const mine = s.ranking.find(x => x.sid === sid);
      if (mine) { v.me.correct = mine.correct; v.me.rank = mine.rank; v.me.total = s.ranking.length; }
    }
    if (r.status === 'final') {
      const res = D.results.find(x => x.id === r.resultId);
      const mc = res ? res.certs.filter(c => c.sid === sid) : [];
      if (mc.length) v.me.certToken = mc[0].token;
      v.me.certCount = mc.length;
    }
  }
  return v;
}
function teacherView(tid) {
  const r = D.round;
  const v = publicView();
  v.me = tid;
  v.hostId = D.hostId;
  v.teachers = D.teachers.map(t => ({ id: t.id, login: t.login, label: t.label }));
  v.settings = D.settings;
  v.modes = D.modes;
  if (r) {
    const idx = rosterIndex(r.rosters || D.modes[r.mode].rosters);
    v.players = Object.entries(r.players).map(([sid, p]) => ({ sid, classId: p.classId, name: (idx[sid] || {}).name || '?', english: (idx[sid] || {}).english || '', joinedAt: p.joinedAt, inRound: !r.startPlayers || r.startPlayers.includes(sid) }));
    if (r.status !== 'lobby') v.fullRanking = computeStandings(r).ranking;
    if (r.status === 'reveal' || r.status === 'question') {
      v.correctNow = r.questions[r.qIndex] ? r.questions[r.qIndex].correct : null;
    }
  }
  v.results = D.results.map(x => ({
    id: x.id, mode: x.mode, startedAt: x.startedAt, winners: x.winners, classes: x.classes, top10: x.top10, questionCount: x.questionCount,
    certs: x.certs.map(c => ({ id: c.id, code: c.code, type: c.type, name: c.name, englishName: c.englishName, classId: c.classId, rank: c.rank, token: c.token }))
  }));
  return v;
}

// ---------------------------------------------------------------- SSE
const clients = new Set();
function payloadFor(c) {
  if (c.role === 'teacher') return teacherView(c.tid);
  if (c.role === 'screen') return publicView();
  return studentView(c.token);
}
function sendTo(c) {
  try { c.res.write(`data: ${JSON.stringify(payloadFor(c))}\n\n`); } catch { /* ignore */ }
}
let bTimer = null;
function broadcast() {
  if (bTimer) return;
  bTimer = setTimeout(() => { bTimer = null; for (const c of clients) sendTo(c); }, 30);
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch { } } }, 15000);

// ---------------------------------------------------------------- HTTP plumbing
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function teacherOf(req) {
  const t = parseCookies(req).ecc_t;
  return t && D.sessions[t] ? D.sessions[t].tid : null;
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > 5e6) { reject(new Error('too big')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveFile(res, file) {
  const p = path.join(PUBLIC, file);
  if (!p.startsWith(PUBLIC)) { res.writeHead(404); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
function cleanStudents(list) {
  return (Array.isArray(list) ? list : []).map(s => ({
    id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : rid(6),
    name: String(s.name || '').trim().slice(0, 80),
    english: String(s.english || '').trim().slice(0, 80),
    display: String(s.display || '').trim().slice(0, 40)
  })).filter(s => s.name);
}
function cleanQuestions(list) {
  return (Array.isArray(list) ? list : []).map(x => ({
    id: typeof x.id === 'string' && x.id ? x.id.slice(0, 40) : rid(6),
    text: String(x.text || '').trim().slice(0, 300),
    options: [0, 1, 2, 3].map(i => String((x.options || [])[i] || '').trim().slice(0, 120)),
    correct: [0, 1, 2, 3].includes(Number(x.correct)) ? Number(x.correct) : 0
  }));
}
function certPeople() {
  const s = D.settings;
  return { teacher1: s.teacher1, teacher2: s.teacher2, principal: s.principal, compName: s.compName };
}
function certFile(c) {
  const kind = c.type === 'achievement' ? `Achievement-${String(c.rank).padStart(2, '0')}` : 'Winning-Class';
  const nm = (c.englishName || c.name || 'Student').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Student';
  return `${kind}_Class${c.classId}_${nm}.pdf`;
}
function findCertsByToken(token) {
  for (const res of D.results) {
    const list = res.certs.filter(c => c.token === token);
    if (list.length) return { result: res, list };
  }
  return null;
}

// ---------------------------------------------------------------- routes
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // pages
    if (req.method === 'GET') {
      if (p === '/' || p === '/index.html') return serveFile(res, 'student.html');
      if (p === '/teacher') return serveFile(res, 'teacher.html');
      if (p === '/screen') {
        if (!teacherOf(req)) { res.writeHead(302, { Location: '/teacher' }); return res.end(); }
        return serveFile(res, 'screen.html');
      }
      if (/^\/c\/[a-f0-9]{40}$/.test(p)) return serveFile(res, 'cert.html');
      let m = p.match(/^\/c\/([a-f0-9]{40})\/([a-f0-9]{12})\.pdf$/);
      if (m) {
        const f = findCertsByToken(m[1]);
        const c = f && f.list.find(x => x.id === m[2]);
        if (!c) { res.writeHead(404); return res.end('Not found'); }
        const pdf = certificatePdf({ ...c, dateText: f.result.dateText }, certPeople());
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${certFile(c)}"`, 'Cache-Control': 'no-store' });
        return res.end(pdf);
      }
      m = p.match(/^\/c\/([a-f0-9]{40})\/qr\.svg$/);
      if (m) {
        if (!findCertsByToken(m[1])) { res.writeHead(404); return res.end(); }
        const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        return res.end(qrSvg(`${proto}://${req.headers.host}/c/${m[1]}`));
      }
      if (p.startsWith('/static/')) return serveFile(res, p.slice(8));
      if (p === '/api/time') return json(res, 200, { now: now() });
      m = p.match(/^\/api\/certs\/([a-f0-9]{40})$/);
      if (m) {
        const f = findCertsByToken(m[1]);
        if (!f) return json(res, 404, { error: 'not_found' });
        return json(res, 200, {
          compName: D.settings.compName, dateText: f.result.dateText, winners: f.result.winners,
          certs: f.list.map(c => ({ id: c.id, code: c.code, type: c.type, classId: c.classId, rank: c.rank, rankText: c.rank ? ordinal(c.rank) : '', englishName: c.englishName, name: c.name, file: certFile(c) }))
        });
      }
      if (p === '/events') {
        const role = url.searchParams.get('role');
        const c = { res, role: 'student', token: url.searchParams.get('token') || '' };
        if (role === 'teacher' || role === 'screen') {
          const tid = teacherOf(req);
          if (!tid) return json(res, 401, { error: 'auth' });
          c.role = role; c.tid = tid;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 1500\n\n');
        clients.add(c);
        sendTo(c);
        req.on('close', () => clients.delete(c));
        return;
      }
      // admin downloads
      if (p === '/api/admin/certs.zip' || p === '/api/admin/backup') {
        const tid = teacherOf(req);
        if (!tid) { res.writeHead(401); return res.end('Login required'); }
        if (p === '/api/admin/backup') {
          const copy = { ...D, sessions: {} };
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="english-class-challenge-backup.json"' });
          return res.end(JSON.stringify(copy, null, 1));
        }
        const result = D.results.find(x => x.id === url.searchParams.get('round')) || D.results[0];
        if (!result) { res.writeHead(404); return res.end('No results yet'); }
        const used = new Set();
        const files = result.certs.map(c => {
          let name = (c.type === 'achievement' ? 'Top10/' : 'Winning-Class/') + certFile(c);
          while (used.has(name)) name = name.replace(/\.pdf$/, '_2.pdf');
          used.add(name);
          return { name, data: certificatePdf({ ...c, dateText: result.dateText }, certPeople()) };
        });
        const zip = makeZip(files);
        const tag = result.mode === 'demo' ? 'DEMO_' : '';
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${tag}Certificates_${new Date(result.startedAt).toISOString().slice(0, 10)}.zip"` });
        return res.end(zip);
      }
      res.writeHead(404); return res.end('Not found');
    }

    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const body = await readBody(req);

    // ---- student actions
    if (p === '/api/student/join') {
      const r = D.round;
      if (!r) return json(res, 409, { error: 'no_round', message: 'The quiz is not open yet. Please wait for your teacher.' });
      const { classId, sid } = body;
      let token = typeof body.token === 'string' && /^[a-f0-9]{32}$/.test(body.token) ? body.token : rid(16);
      if (!CLASSES.includes(classId)) return json(res, 400, { error: 'bad_class' });
      const st = (D.modes[r.mode].rosters[classId] || []).find(s => s.id === sid) || (r.rosters && (r.rosters[classId] || []).find(s => s.id === sid));
      if (!st) return json(res, 400, { error: 'bad_student', message: 'Name not found in this class list.' });
      const existing = r.players[sid];
      if (existing && existing.token.startsWith('released-')) {
        // teacher freed this name during a running round: the first device to pick it takes over (scores kept)
        if (r.tokens[token] && r.tokens[token] !== sid) return json(res, 409, { error: 'started', message: 'The quiz has already started.' });
        existing.token = token; r.tokens[token] = sid;
        save(); broadcast();
        return json(res, 200, { token });
      }
      if (existing && existing.token !== token) return json(res, 409, { error: 'taken', message: 'This name has already joined. If this is your name, ask your teacher to free it.' });
      const prevSid = r.tokens[token];
      if (r.status !== 'lobby') {
        if (existing && existing.token === token) return json(res, 200, { token });
        return json(res, 409, { error: 'started', message: 'The quiz has already started. Please watch the shared screen.' });
      }
      if (prevSid && prevSid !== sid) delete r.players[prevSid];
      r.players[sid] = { token, classId, joinedAt: now() };
      r.tokens[token] = sid;
      save(); broadcast();
      return json(res, 200, { token });
    }
    if (p === '/api/student/leave') {
      const r = D.round;
      if (r && r.status === 'lobby') {
        const sid = r.tokens[body.token];
        if (sid && r.players[sid] && r.players[sid].token === body.token) delete r.players[sid];
        delete r.tokens[body.token];
        save(); broadcast();
      }
      return json(res, 200, { ok: true });
    }
    if (p === '/api/student/answer') {
      const t = now();
      const r = D.round;
      if (!r || r.status !== 'question') return json(res, 409, { error: 'closed', message: "Time's up!" });
      const sid = r.tokens[body.token];
      if (!sid || !r.players[sid] || r.players[sid].token !== body.token || !r.startPlayers.includes(sid)) return json(res, 403, { error: 'not_player' });
      if (Number(body.qIndex) !== r.qIndex) return json(res, 409, { error: 'stale' });
      if (t > r.deadline) return json(res, 409, { error: 'closed', message: "Time's up!" });
      const choice = Number(body.choice);
      if (![0, 1, 2, 3].includes(choice)) return json(res, 400, { error: 'bad_choice' });
      const bucket = r.answers[r.qIndex];
      if (bucket[sid]) return json(res, 200, { ok: true, already: true });
      bucket[sid] = { choice, ms: t - r.qOpenedAt, correct: choice === r.questions[r.qIndex].correct };
      save(); broadcast();
      // everyone answered → close a moment early
      if (Object.keys(bucket).length >= r.startPlayers.length) {
        const qi = r.qIndex;
        setTimeout(() => { if (D.round === r && r.status === 'question' && r.qIndex === qi) closeQuestion(); }, 800);
      }
      return json(res, 200, { ok: true });
    }

    // ---- teacher auth
    if (p === '/api/login') {
      const t = D.teachers.find(x => x.id === body.teacherId || x.login === body.teacherId);
      if (!t || !checkPassword(t.id, body.password)) return json(res, 401, { error: 'bad_login' });
      const tok = rid(24);
      D.sessions[tok] = { tid: t.id, at: now() };
      save();
      res.writeHead(200, { 'Set-Cookie': `ecc_t=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}`, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (p === '/api/logout') {
      const t = parseCookies(req).ecc_t;
      if (t) delete D.sessions[t];
      save();
      res.writeHead(200, { 'Set-Cookie': 'ecc_t=; Path=/; Max-Age=0', 'Content-Type': 'application/json' });
      return res.end('{"ok":true}');
    }

    const tid = teacherOf(req);
    if (!p.startsWith('/api/admin/')) { res.writeHead(404); return res.end(); }
    if (!tid) return json(res, 401, { error: 'auth' });
    const isHost = D.hostId === tid;
    const hostOnly = () => json(res, 403, { error: 'not_host', message: 'Only the host teacher can control the live round.' });
    const ok = () => { save(); broadcast(); return json(res, 200, { ok: true }); };

    switch (p) {
      case '/api/admin/settings': {
        const s = D.settings;
        for (const k of ['compName', 'teacher1', 'teacher2', 'principal']) if (typeof body[k] === 'string') s[k] = body[k].trim().slice(0, 80) || s[k];
        if (body.questionSeconds) s.questionSeconds = Math.min(120, Math.max(5, Number(body.questionSeconds) || 20));
        if (body.revealSeconds) s.revealSeconds = Math.min(30, Math.max(2, Number(body.revealSeconds) || 6));
        return ok();
      }
      case '/api/admin/roster': {
        const mode = body.mode === 'demo' ? 'demo' : 'live';
        if (!CLASSES.includes(body.classId)) return json(res, 400, { error: 'bad_class' });
        D.modes[mode].rosters[body.classId] = cleanStudents(body.students);
        return ok();
      }
      case '/api/admin/questions': {
        const mode = body.mode === 'demo' ? 'demo' : 'live';
        D.modes[mode].questions = cleanQuestions(body.questions);
        return ok();
      }
      case '/api/admin/host': {
        const target = D.teachers.find(t => t.id === body.teacherId);
        if (!target) return json(res, 400, { error: 'bad_teacher' });
        D.hostId = target.id;
        return ok();
      }
      case '/api/admin/password': {
        if (typeof body.password !== 'string' || body.password.length < 6) return json(res, 400, { error: 'short', message: 'Password must be at least 6 characters.' });
        setPassword(tid, body.password);
        return ok();
      }
      case '/api/admin/round/open': {
        if (!isHost) return hostOnly();
        if (D.round && ['intro', 'question', 'reveal'].includes(D.round.status)) return json(res, 409, { error: 'running', message: 'A round is running. End it first.' });
        openRound(body.mode === 'demo' ? 'demo' : 'live');
        return json(res, 200, { ok: true });
      }
      case '/api/admin/round/start': {
        if (!isHost) return hostOnly();
        const err = startRound();
        if (err) return json(res, 409, { error: err, message: err === 'no_questions' ? 'Add at least one complete question.' : 'Open the lobby first.' });
        return json(res, 200, { ok: true });
      }
      case '/api/admin/round/skip': {
        if (!isHost) return hostOnly();
        const r = D.round;
        if (r && r.status === 'question') closeQuestion();
        else if (r && r.status === 'reveal') { clearTimer(); r.qIndex >= r.questions.length - 1 ? finishRound() : openQuestion(r.qIndex + 1); }
        return json(res, 200, { ok: true });
      }
      case '/api/admin/round/end': {
        if (!isHost) return hostOnly();
        const r = D.round;
        if (r && ['question', 'reveal', 'intro'].includes(r.status)) {
          if (r.status === 'question') { r.finishedCount = r.qIndex; } // the open question doesn't count
          if (r.status === 'intro') { clearTimer(); D.round = null; save(); broadcast(); return json(res, 200, { ok: true }); }
          r.status = 'reveal';
          finishRound();
        }
        return json(res, 200, { ok: true });
      }
      case '/api/admin/round/close': {
        if (!isHost) return hostOnly();
        clearTimer(); D.round = null;
        return ok();
      }
      case '/api/admin/round/release': {
        const r = D.round;
        if (!r) return json(res, 409, { error: 'no_round' });
        const pl = r.players[body.sid];
        if (pl) {
          delete r.tokens[pl.token];
          if (r.status === 'lobby') delete r.players[body.sid];
          else pl.token = 'released-' + rid(4); // keeps her scores; the real student can re-claim the name
        }
        return ok();
      }
      case '/api/admin/results/delete': {
        D.results = D.results.filter(x => x.id !== body.id);
        return ok();
      }
      case '/api/admin/restore': {
        if (!body || !body.modes || !body.settings) return json(res, 400, { error: 'bad_backup' });
        clearTimer();
        const keepAuth = D.auth, keepSessions = D.sessions;
        D = body; D.auth = Object.keys(body.auth || {}).length ? body.auth : keepAuth; D.sessions = keepSessions; D.round = null;
        return ok();
      }
    }
    res.writeHead(404); return res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'server', message: String(e.message || e) });
  }
});

load();
// resume a round interrupted by a restart
if (D.round) {
  const r = D.round;
  if (r.status === 'intro') schedule(r.introEnds, () => openQuestion(0));
  else if (r.status === 'question') schedule(r.deadline, () => closeQuestion());
  else if (r.status === 'reveal') schedule(r.nextAt, () => (r.qIndex >= r.questions.length - 1 ? finishRound() : openQuestion(r.qIndex + 1)));
}
server.listen(PORT, () => console.log(`English Class Challenge! running on http://localhost:${PORT}`));
