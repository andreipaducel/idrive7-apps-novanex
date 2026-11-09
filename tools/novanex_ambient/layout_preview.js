'use strict';
// Rough layout preview WITHOUT the BMW kit or SDK: stubs ./kit/* with a recorder, runs the app's
// render on a chosen effect and time, writes drawing ops as JSON (draw_ops.py turns it into a PNG).
//   node tools/novanex_ambient/layout_preview.js <ms into the effect> <out.json> [key=value settings...]
const path = require('path');
const fs = require('fs');
const Module = require('module');

const APP = path.join(__dirname, '..', '..', 'apps', 'novanex_ambient');
const SPEC = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
const atMs = Number(process.argv[2] || 0), out = process.argv[3] || 'ops.json';

const ops = [];
class Cv {
    constructor(w, h) { this.w = w; this.h = h; this.own = true; }
    clear(c) { ops.push(['rect', 0, 0, this.w, this.h, 0, c]); return this; }
    fillRect(x, y, w, h, c) { ops.push(['rect', x, y, w, h, 0, c]); }
    roundRect(x, y, w, h, r, c) { ops.push(['rect', x, y, w, h, r, c]); }
    strokeRoundRect(x, y, w, h, r, lw, c) { ops.push(['stroke', x, y, w, h, r, c, lw]); }
    line(x0, y0, x1, y1, lw, c) { ops.push(['line', x0, y0, x1, y1, lw, c]); }
    target() {}
    textWidth(s, size, o) { return String(s).length * size * ((o && o.font) === 'num' ? 0.5 : 0.52); }
    text(s, x, y, size, c, o) { o = o || {}; ops.push(['text', String(s), x, y, size, c, o.align || 'left', o.font || 'label']); return this.textWidth(s, size, o); }
}
const withAlpha = (c, a) => c + Math.round(a * 255).toString(16).padStart(2, '0');
const theme = { name: 'm_tricolour', bg: '#0b0d12', text: '#f4f7fb', dim: '#8a95a6', track: '#1b212b', tick: '#4c5666', warn: '#ffb020', crit: '#ef2b2d', cold: '#7fd1ff', accent: '#3d8bff', sel: '#3d8bff' };
const G = {
    TOP: 44, BOTTOM: 512,
    panel(cv, t, x, y, w, h, title) { cv.roundRect(x, y, w, h, 8, '#141821'); if (title) cv.text(String(title).toUpperCase(), x + 20, y + 34, 22, t.dim, { font: 'bold' }); return { x, y, w, h }; },
    button(cv, t, x, y, w, h, label, run, o) {
        o = o || {}; if (!w) w = Math.max(h * 3, cv.textWidth(String(label), h * 0.4) + h * 1.2);
        const c = o.color || t.accent;
        cv.roundRect(x, y, w, h, h / 2, o.primary ? withAlpha(c, o.busy ? 0.35 : 0.85) : withAlpha('#ffffff', 0.07));
        if (!o.primary) cv.strokeRoundRect(x, y, w, h, h / 2, 1.5, withAlpha('#ffffff', o.busy ? 0.2 : 0.3));
        cv.text(String(label), x + w / 2, y + h / 2 + h * 0.15, h * 0.4, o.primary ? '#ffffff' : o.busy ? t.dim : t.text, { align: 'center', font: 'bold' });
        return w;
    },
    frame(cv, t, tabs, sel, badges) { cv.fillRect(0, 0, cv.w, 36, '#1a1d24'); cv.text(String(tabs[0]).toUpperCase(), 80, 26, 20, t.text, { font: 'bold', align: 'center' }); (badges || []).filter(Boolean).forEach((b) => cv.text(b.text, cv.w - 90, 26, 18, b.color || t.warn, { font: 'bold' })); },
    pageBottom(cv) { return 512; },
};
let impl = null;
const stubs = { './kit/mgu': { run(a) { impl = a; } }, './kit/canvas': { withAlpha }, './kit/gauges': G };
const load = Module._load;
Module._load = function (req, parent, isMain) { return stubs[req] || load.call(this, req, parent, isMain); };

const S = {};
SPEC.settings.forEach((s) => { S[s.key] = s.default; });
process.argv.slice(4).forEach((kv) => { const [k, v] = kv.split('='); S[k] = (v === 'true' || v === 'false') ? v === 'true' : isNaN(Number(v)) || v === '' ? v : Number(v); });

const t0 = 1000; let clock = t0;
const RealDate = Date;
global.Date = class extends RealDate { static now() { return clock; } };

require(path.join(APP, 'main.js'));
(async () => {
    const settings = { get: (k) => S[k], set: (k, v) => { S[k] = v; }, onChange() {} };
    const signals = { watch: async (iface) => ({ iface, proxy: null, available: false, error: null }), set: async () => {} };
    const log = { info() {}, warn(m) { console.error(m); }, error(m) { console.error(m); } };
    const ctx = {
        ui: { image: async () => {}, onClick() {} },
        settings, log, signals,
        theme: () => theme,
        canvas: (w, h) => { ops.length = 0; return new Cv(w, h); },
        loop() {},
        background: null,
    };
    if (impl.background) ctx.background = await impl.background({ settings, signals, log });
    clock = t0 + atMs;
    // find and run the render loop by calling start (which calls ctx.loop and an initial render)
    let renderFn = null;
    ctx.loop = (name, fps, fn) => { renderFn = fn; };
    await impl.start(ctx);
    if (renderFn) await renderFn();
    if (ctx.background && ctx.background.stop) ctx.background.stop();   // clear the effect timer so node exits
    fs.writeFileSync(out, JSON.stringify(ops));
    console.log('ops: ' + ops.length + ' -> ' + out);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
