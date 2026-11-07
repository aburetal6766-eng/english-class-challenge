'use strict';
// QR code → SVG, using the vendored QRCode encoder (Apache-2.0, see lib/qr/LICENSE).
const QRCode = require('./qr');
const L = require('./qr/QRErrorCorrectLevel');
module.exports = function qrSvg(text) {
  const q = new QRCode(-1, L.M);
  q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2, size = n + m * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules[r][c]) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#14102E"/></svg>`;
};
