'use strict';
// Certificate PDF generator — hand-written PDF using the 14 standard fonts (no dependencies).
const WIDTHS = require('./widths.json');

const FONTS = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Times-BoldItalic', F4: 'Times-Italic' };
const W = 842, H = 595;

function hex(c) {
  const n = parseInt(c.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' ');
}
function clean(s) {
  // WinAnsi-safe: keep printable Latin-1, map common punctuation
  return String(s || '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
function esc(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function textWidth(s, font, size, cs = 0) {
  const tbl = WIDTHS[FONTS[font]];
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += (c >= 32 && c < 127) ? tbl[c - 32] : 556;
  }
  return w * size / 1000 + cs * Math.max(0, s.length - 1);
}

class Page {
  constructor() { this.ops = []; }
  fill(c) { this.ops.push(hex(c) + ' rg'); return this; }
  stroke(c) { this.ops.push(hex(c) + ' RG'); return this; }
  lw(w) { this.ops.push(w + ' w'); return this; }
  rect(x, y, w, h, mode = 'f') { this.ops.push(`${x} ${y} ${w} ${h} re ${mode}`); return this; }
  line(x1, y1, x2, y2) { this.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`); return this; }
  poly(pts, mode = 'f') {
    this.ops.push(pts.map((p, i) => `${p[0].toFixed(2)} ${p[1].toFixed(2)} ${i ? 'l' : 'm'}`).join(' ') + ' h ' + mode);
    return this;
  }
  circle(cx, cy, r, mode = 'f') {
    const k = 0.5523 * r;
    this.ops.push([
      `${cx + r} ${cy} m`,
      `${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c`,
      `${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c`,
      `${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c`,
      `${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c`,
      mode
    ].join(' '));
    return this;
  }
  star(cx, cy, r, color, rot = 0) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + rot + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    this.fill(color).poly(pts);
    return this;
  }
  text(s, x, y, { font = 'F1', size = 12, color = '#222222', align = 'left', cs = 0 } = {}) {
    s = clean(s);
    const w = textWidth(s, font, size, cs);
    const tx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.ops.push(`BT /${font} ${size} Tf ${hex(color)} rg ${cs} Tc ${tx.toFixed(2)} ${y} Td (${esc(s)}) Tj ET`);
    return w;
  }
  fitSize(s, font, max, maxW) {
    s = clean(s);
    let size = max;
    while (size > 14 && textWidth(s, font, size) > maxW) size -= 1;
    return size;
  }
}

function buildPdf(page) {
  const content = Buffer.from(page.ops.join('\n'), 'latin1');
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const fontRefs = Object.keys(FONTS).map((k, i) => `/${k} ${5 + i} 0 R`).join(' ');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << ${fontRefs} >> >> /Contents 4 0 R >>`);
  objs.push(null); // content stream placeholder
  for (const k of Object.keys(FONTS)) objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k]} /Encoding /WinAnsiEncoding >>`);
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [];
  let len = parts[0].length;
  objs.forEach((o, i) => {
    let buf;
    if (o === null) {
      buf = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    } else {
      buf = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    }
    offsets.push(len);
    parts.push(buf);
    len += buf.length;
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (English Class Challenge Certificate) /Producer (English Class Challenge) >> >>\nstartxref\n${len}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

const CLASS_COLORS = { '1A': '#E8338A', '1B': '#2A86E8', '1C': '#E0A800' };
const NAVY = '#1A1752', PURPLE = '#5B2A9D', GOLD = '#D9A520', GRAY = '#555566';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * cert: {type:'achievement'|'winning', englishName, classId, rank, code, dateText, coWinner}
 * people: {teacher1, teacher2, principal, compName}
 */
function certificatePdf(cert, people) {
  const p = new Page();
  // background
  p.fill('#FFFDF6').rect(0, 0, W, H);
  // soft corner washes
  p.fill('#FCE7F2').circle(0, H, 150);
  p.fill('#E4F0FD').circle(W, 0, 150);
  p.fill('#FFF4D1').circle(W, H, 110);
  p.fill('#F1E8FB').circle(0, 0, 110);
  // borders
  p.stroke(NAVY).lw(10).rect(20, 20, W - 40, H - 40, 'S');
  p.stroke(GOLD).lw(1.6).rect(36, 36, W - 72, H - 72, 'S');
  // colour stripe
  const sx = 36, sw = (W - 72) / 3;
  p.fill(CLASS_COLORS['1A']).rect(sx, H - 48, sw, 7);
  p.fill(CLASS_COLORS['1B']).rect(sx + sw, H - 48, sw, 7);
  p.fill(CLASS_COLORS['1C']).rect(sx + 2 * sw, H - 48, sw, 7);
  // stars
  [[70, 500, 9, '#E8338A'], [96, 470, 5, GOLD], [772, 500, 9, '#2A86E8'], [746, 470, 5, GOLD],
   [70, 96, 6, GOLD], [772, 96, 6, '#E8338A'], [100, 120, 4, '#2A86E8'], [742, 120, 4, PURPLE]]
    .forEach(([x, y, r, c], i) => p.star(x, y, r, c, i * 0.2));

  const cx = W / 2;
  p.text('ENGLISH CLASS CHALLENGE!', cx, 500, { font: 'F2', size: 15, color: PURPLE, align: 'center', cs: 3 });
  p.text('Think fast. Answer right. Cheer for your class!', cx, 482, { font: 'F4', size: 11.5, color: GRAY, align: 'center' });
  const title = cert.type === 'achievement' ? 'Certificate of Achievement' : 'Winning Class Certificate';
  p.text(title, cx, 428, { font: 'F3', size: 40, color: NAVY, align: 'center' });
  p.text('This certificate is proudly presented to', cx, 390, { font: 'F1', size: 13, color: GRAY, align: 'center' });
  const name = clean(cert.englishName) || 'Student';
  const ns = p.fitSize(name, 'F2', 36, 470);
  p.text(name, cx, 342, { font: 'F2', size: ns, color: '#141030', align: 'center' });
  p.stroke(GOLD).lw(1.4).line(cx - 210, 328, cx + 210, 328);

  if (cert.type === 'achievement') {
    p.text(`for earning ${ordinal(cert.rank)} place among all students`, cx, 298, { font: 'F1', size: 14.5, color: '#2A2A3A', align: 'center' });
    p.text(`in the ${people.compName}  -  Class ${cert.classId}`, cx, 277, { font: 'F1', size: 14.5, color: '#2A2A3A', align: 'center' });
  } else {
    p.text(`for being a proud member of Class ${cert.classId},`, cx, 298, { font: 'F1', size: 14.5, color: '#2A2A3A', align: 'center' });
    p.text(`${cert.coWinner ? 'a winning class' : 'the winning class'} of the ${people.compName}`, cx, 277, { font: 'F1', size: 14.5, color: '#2A2A3A', align: 'center' });
  }
  p.text(cert.dateText, cx, 245, { font: 'F2', size: 11.5, color: PURPLE, align: 'center', cs: 1 });

  // medal (left) and class badge (right)
  const mx = 140, my = 300;
  p.fill(cert.type === 'achievement' ? '#E8338A' : '#2A86E8').poly([[mx - 26, my - 20], [mx - 8, my - 20], [mx - 18, my - 82], [mx - 28, my - 70], [mx - 40, my - 76]]);
  p.fill(cert.type === 'achievement' ? '#2A86E8' : '#E8338A').poly([[mx + 26, my - 20], [mx + 8, my - 20], [mx + 18, my - 82], [mx + 28, my - 70], [mx + 40, my - 76]]);
  p.fill(GOLD).circle(mx, my, 44);
  p.fill('#F5C842').circle(mx, my, 36);
  if (cert.type === 'achievement') {
    p.text(ordinal(cert.rank), mx, my - 8, { font: 'F2', size: cert.rank >= 10 ? 22 : 26, color: NAVY, align: 'center' });
  } else {
    p.star(mx, my + 2, 24, NAVY);
  }
  const bx = W - 140, by = 300, cc = CLASS_COLORS[cert.classId] || PURPLE;
  p.fill(cc).circle(bx, by, 44);
  p.fill('#FFFFFF').circle(bx, by, 37);
  p.fill(cc).circle(bx, by, 33);
  p.text('CLASS', bx, by + 9, { font: 'F2', size: 9, color: '#FFFFFF', align: 'center', cs: 1.5 });
  p.text(cert.classId, bx, by - 14, { font: 'F2', size: 22, color: '#FFFFFF', align: 'center' });

  // signatures
  const sigs = [
    [people.teacher1, 'English Teacher'],
    [people.teacher2, 'English Teacher'],
    [people.principal, 'School Principal']
  ];
  const cols = [cx - 230, cx, cx + 230];
  sigs.forEach(([n, role], i) => {
    p.stroke('#9A9AAE').lw(0.8).line(cols[i] - 90, 158, cols[i] + 90, 158);
    p.text(n || '', cols[i], 140, { font: 'F2', size: 11.5, color: NAVY, align: 'center' });
    p.text(role, cols[i], 125, { font: 'F1', size: 10, color: GRAY, align: 'center' });
  });
  p.text(`Certificate code: ${cert.code}`, cx, 62, { font: 'F1', size: 9, color: '#77778A', align: 'center', cs: 0.5 });
  return buildPdf(p);
}

module.exports = { certificatePdf, ordinal };
