'use strict';
// Rough layout preview WITHOUT the BMW kit or SDK: stubs ./kit/* with a recorder, runs the app's
// render on demo data and writes the drawing ops as JSON (tools/novanex_tyres/draw_ops.py turns it into a PNG).
//   node tools/novanex_tyres/layout_preview.js <minutes into the demo> <out.json> [key=value settings...]
const path = require('path');
const fs = require('fs');
const Module = require('module');

const APP = path.join(__dirname, '..', '..', 'apps', 'novanex_tyres');
const SPEC = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
const minutes = Number(process.argv[2] || 0), out = process.argv[3] || 'ops.json';

const ops = [];
class Cv {
    constructor(w, h) { this.w = w; this.h = h; }
    clear(c) { ops.push(['rect', 0, 0, this.w, this.h, 0, c]); return this; }
    fillRect(x, y, w, h, c) { ops.push(['rect', x, y, w, h, 0, c]); }
    roundRect(x, y, w, h, r, c) { ops.push(['rect', x, y, w, h, r, c]); }
    strokeRoundRect(x, y, w, h, r, lw, c) { ops.push(['stroke', x, y, w, h, r, c, lw]); }
    line(x0, y0, x1, y1, lw, c) { ops.push(['line', x0, y0, x1, y1, lw, c]); }
    textWidth(s, size, o) { return String(s).length * size * ((o && o.font) === 'num' ? 0.5 : 0.52); }
    text(s, x, y, size, c, o) { o = o || {}; ops.push(['text', String(s), x, y, size, c, o.align || 'left', o.font || 'label']); return this.textWidth(s, size, o); }
}
const theme = { name: 'm_tricolour', bg: '#0b0d12', text: '#f4f7fb', dim: '#8a95a6', track: '#1b212b', tick: '#4c5666', warn: '#ffb020', crit: '#ef2b2d', cold: '#7fd1ff', accent: '#3d8bff' };
const withAlpha = (c, a) => c + Math.round(a * 255).toString(16).padStart(2, '0');
const G = {
    TOP: 44, BOTTOM: 512,
    panel(cv, t, x, y, w, h, title) {
        cv.roundRect(x, y, w, h, 8, '#141821');
        if (title) cv.text(title.toUpperCase(), x + 20, y + 32, 22, t.dim, { font: 'bold' });
        return { x, y, w, h };
    },
    frame(cv, t, tabs, sel, badges) {
        cv.fillRect(0, 0, cv.w, 36, '#1a1d24');
        cv.text(tabs[0].toUpperCase(), 80, 26, 20, t.text, { font: 'bold', align: 'center' });
        (badges || []).filter(Boolean).forEach((b) => cv.text(b.text, cv.w - 60, 26, 18, t.warn, { font: 'bold' }));
    },
};
let app = null, render = null;
const S = {};
SPEC.settings.forEach((s) => { S[s.key] = s.default; });
process.argv.slice(4).forEach((kv) => { const [k, v] = kv.split('='); S[k] = isNaN(Number(v)) ? v : Number(v); });
const stubs = {
    './kit/mgu': { run(a) { app = a; } },
    './kit/canvas': { withAlpha },
    './kit/gauges': G,
};
const load = Module._load;
Module._load = function (req, parent, isMain) { return stubs[req] || load.call(this, req, parent, isMain); };

// demo clock: start `minutes` into the simulated cool-down (30x faster)
const realNow = Date.now;
const t0 = realNow();
Date.now = () => t0;
require(path.join(APP, 'main.js'));
(async () => {
    await app.start({
        ui: { image: async () => {}, onClick() {} },
        settings: { get: (k) => S[k], set: (k, v) => { S[k] = v; }, onChange() {} },
        log: { info() {}, warn(m) { console.error(m); }, error(m, e) { console.error(m, e); } },
        signals: { watch: async (iface) => ({ iface, available: false }) },
        theme: () => theme,
        canvas: (w, h) => { ops.length = 0; return new Cv(w, h); },
        loop: (name, fps, fn) => { render = fn; },
    });
    Date.now = () => t0 + 6000 + minutes * 60000 / 30;          // past the 5 s wait for the car, then the demo time
    await render();
    fs.writeFileSync(out, JSON.stringify(ops));
    console.log('ops: ' + ops.length + ' -> ' + out);
})().catch((e) => { console.error(e); process.exit(1); });
