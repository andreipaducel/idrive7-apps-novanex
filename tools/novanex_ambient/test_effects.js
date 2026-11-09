'use strict';
// Tests for apps/novanex_ambient/effects.js (pure engine, no head unit needed):
//   node tools/novanex_ambient/test_effects.js
const assert = require('assert');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'apps', 'novanex_ambient', 'effects.js'));

const near = (a, b, eps, m) => assert(Math.abs(a - b) <= (eps || 1), (m || '') + ' expected ~' + b + ', got ' + a);
const checks = [
    ['every named effect produces a frame', () => {
        for (const n of E.NAMES) assert(E.frame(n, 0, { slot: 3 }), n + ' gave no frame');
        assert.strictEqual(E.frame('nope', 0, {}), null);
    }],
    ['static holds the chosen colour over time', () => {
        const a = E.frame('static', 0, { slot: 5 }), b = E.frame('static', 9999, { slot: 5 });
        assert.strictEqual(a.slot, 5); assert.strictEqual(b.slot, 5); assert.strictEqual(a.bright, null);
    }],
    ['static clamps a bad slot into range', () => {
        assert.strictEqual(E.frame('static', 0, { slot: 99 }).slot, 1);
        assert.strictEqual(E.frame('static', 0, { slot: 0 }).slot, 1);
    }],
    ['breathe: dark at the ends of a period, bright in the middle', () => {
        const cfg = { slot: 2, periodMs: 4000, brightMin: 10, brightMax: 200 };
        near(E.frame('breathe', 0, cfg).bright, 10, 2, 'start');
        near(E.frame('breathe', 2000, cfg).bright, 200, 2, 'middle');
        near(E.frame('breathe', 4000, cfg).bright, 10, 2, 'end = start');
    }],
    ['breathe never leaves the brightness range', () => {
        const cfg = { slot: 1, periodMs: 3000, brightMin: 40, brightMax: 180 };
        for (let t = 0; t <= 3000; t += 123) {
            const b = E.frame('breathe', t, cfg).bright;
            assert(b >= 40 && b <= 180, 'bright ' + b + ' at t=' + t);
        }
    }],
    ['rainbow hue sweeps 0..max across one period and wraps', () => {
        const cfg = { slot: 1, periodMs: 6000 };
        near(E.frame('rainbow', 0, cfg).hue, 0, 1, 'start');
        near(E.frame('rainbow', 3000, cfg).hue, E.HUE_MAX / 2, 3, 'half');
        near(E.frame('rainbow', 6000, cfg).hue, 0, 1, 'wrap');
        for (let t = 0; t < 6000; t += 97) { const h = E.frame('rainbow', t, cfg).hue; assert(h >= 0 && h <= E.HUE_MAX, h); }
    }],
    ['rainbow also offers a valid palette slot for safe mode', () => {
        const f = E.frame('rainbow', 1000, { slot: 1, periodMs: 6000 });
        assert(f.slot >= 1 && f.slot <= 12, 'slot ' + f.slot);
    }],
    ['cycle walks the chosen palette in order and loops', () => {
        const cfg = { periodMs: 4000, palette: [3, 6, 9, 12] };
        assert.strictEqual(E.frame('cycle', 0, cfg).slot, 3);
        assert.strictEqual(E.frame('cycle', 1000, cfg).slot, 6);
        assert.strictEqual(E.frame('cycle', 2000, cfg).slot, 9);
        assert.strictEqual(E.frame('cycle', 3000, cfg).slot, 12);
        assert.strictEqual(E.frame('cycle', 4000, cfg).slot, 3, 'loops');
    }],
    ['cycle with no palette walks all 12', () => {
        assert.strictEqual(E.palette({}).length, 12);
        assert.strictEqual(E.frame('cycle', 0, { periodMs: 12000 }).slot, 1);
    }],
    ['cycle ignores out-of-range palette entries', () => {
        assert.deepStrictEqual(E.palette({ palette: [0, 3, 99, 7] }), [3, 7]);
    }],
    ['strobe is on for the first half, off for the second (default duty)', () => {
        const cfg = { slot: 4, periodMs: 1000, brightMin: 0, brightMax: 254 };
        assert.strictEqual(E.frame('strobe', 100, cfg).bright, 254, 'on');
        assert.strictEqual(E.frame('strobe', 700, cfg).bright, 0, 'off');
    }],
    ['strobe duty shifts the on-fraction', () => {
        const cfg = { slot: 4, periodMs: 1000, duty: 0.2, brightMin: 0, brightMax: 254 };
        assert.strictEqual(E.frame('strobe', 100, cfg).bright, 254);
        assert.strictEqual(E.frame('strobe', 300, cfg).bright, 0);
    }],
    ['wave spreads zones out of phase and respects the zone count', () => {
        const f3 = E.frame('wave', 0, { periodMs: 3000, zones: 3 });
        assert.strictEqual(f3.zones.length, 3);
        assert(f3.zones.every((h) => h === null || (h >= 0 && h <= E.HUE_MAX)));
        assert.notStrictEqual(f3.zones[0], f3.zones[1], 'zones differ');
        const f2 = E.frame('wave', 0, { periodMs: 3000, zones: 2 });
        assert.strictEqual(f2.zones[2], null, 'third zone unused when zones=2');
    }],
    ['needs/isSafe: cycle & static are slot-only; breathe/rainbow/wave are not', () => {
        assert.ok(E.isSafe('static')); assert.ok(E.isSafe('cycle'));
        assert.ok(!E.isSafe('breathe')); assert.ok(!E.isSafe('rainbow')); assert.ok(!E.isSafe('wave'));
        assert.deepStrictEqual(E.needs('breathe'), ['slot', 'bright']);
    }],
    ['curves stay within 0..1', () => {
        for (let p = 0; p <= 1.001; p += 0.05) {
            assert(E.breatheCurve(p) >= -1e-9 && E.breatheCurve(p) <= 1 + 1e-9);
            assert(E.triangle(p) >= 0 && E.triangle(p) <= 1);
        }
        near(E.breatheCurve(0), 0, 1e-6); near(E.breatheCurve(0.5), 1, 1e-6);
    }],
    ['period 0 does not divide by zero', () => {
        assert.strictEqual(E.phaseOf(1234, 0), 0);
        assert.ok(E.frame('rainbow', 1234, { slot: 1, periodMs: 0 }));
    }],
];
let fail = 0;
for (const [name, fn] of checks) {
    try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
console.log(fail ? fail + ' failed' : 'all ' + checks.length + ' passed');
process.exit(fail ? 1 : 0);
