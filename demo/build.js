// Inline the app's real renderers + simulation into one self-contained demo page.
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const qs = require('../lib/sample-questions');
let html = R('demo/demo-src.html');
const put = (k, v) => { html = html.split(k).join(v); };
put('/*STYLES*/', R('public/styles.css'));
put('/*COMMON*/', R('public/common.js'));
put('/*SCREEN*/', R('public/screen-view.js'));
put('/*STUDENT*/', R('public/student-view.js'));
put('/*SIM*/', R('demo/sim.js').replace('/*QUESTIONS*/[]', JSON.stringify(qs)));
const out = process.argv[2] || path.join(__dirname, 'demo.html');
fs.writeFileSync(out, html);
console.log('wrote', out, html.length);
