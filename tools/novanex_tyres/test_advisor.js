'use strict';
// Tests for apps/novanex_tyres/advisor.js (pure logic, no head unit needed):
//   node tools/novanex_tyres/test_advisor.js
const assert = require('assert');
const path = require('path');
const A = require(path.join(__dirname, '..', '..', 'apps', 'novanex_tyres', 'advisor.js'));

const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 0.01), (msg || '') + ' expected ~' + b + ', got ' + a);
const checks = [
    ['gas law: 2.4 bar at 10 C reads ~2.65 bar at 30 C', () => {
        near(A.atTemperature(2.4, 10, 30), (2.4 + 1.01325) * 303.15 / 283.15 - 1.01325);
        near(A.atTemperature(2.4, 10, 30), 2.65, 0.02);
    }],
    ['roughly 0.1 bar per 8-10 C at normal pressures', () => {
        const d = A.atTemperature(2.5, 20, 30) - 2.5;
        assert(d > 0.1 && d < 0.13, 'per 10 C: ' + d);
    }],
    ['cold tyres: target is the placard value', () => {
        assert.strictEqual(A.targetNow(2.4, 8, 8), 2.4);
        assert.strictEqual(A.targetNow(2.4, 6, 8), 2.4, 'colder than the air: no subtraction');
    }],
    ['warm tyre at the right cold pressure is OK, not "release"', () => {
        const hotP = A.atTemperature(2.4, 10, 35);        // correctly inflated tyre after driving
        const a = A.tyreAdvice(A.round(hotP, 1), 35, 2.4, 10);
        assert.strictEqual(a.state, 'ok', JSON.stringify(a));
        near(a.cold, 2.4, 0.05);
    }],
    ['warm tyre: add to the hot-corrected value, not the placard', () => {
        const a = A.tyreAdvice(2.4, 35, 2.4, 10);         // reads placard value while hot = under-inflated
        assert.strictEqual(a.state, 'add');
        assert(a.delta >= 0.25 && a.delta <= 0.35, 'delta ' + a.delta);
        assert(a.cold < 2.2, 'will cool to ' + a.cold);
    }],
    ['over-inflated cold tyre: release', () => {
        const a = A.tyreAdvice(2.8, 12, 2.4, 12);
        assert.strictEqual(a.state, 'release'); near(a.delta, -0.4);
    }],
    ['one TPMS step (0.1 bar) off counts as off; under it is OK', () => {
        assert.strictEqual(A.tyreAdvice(2.3, 15, 2.4, 15).state, 'add');
        assert.strictEqual(A.tyreAdvice(2.45, 15, 2.4, 15).state, 'ok');
    }],
    ['more than 0.3 bar under when cold: possible leak', () => {
        assert.strictEqual(A.tyreAdvice(1.9, 10, 2.4, 10).state, 'low');
    }],
    ['no data stays no data', () => {
        assert.strictEqual(A.tyreAdvice(null, 20, 2.4, 10).state, 'nodata');
        assert.strictEqual(A.tyreAdvice(2.4, 20, null, 10).state, 'nodata');
    }],
    ['heat: warm when hottest tyre is over the margin', () => {
        const h = A.heat([22, 24, 31, 30], 12, 5);
        assert.strictEqual(h.warm, true); near(h.over, 19);
        assert.strictEqual(A.heat([13, 14, 14, 15], 12, 5).warm, false);
    }],
    ['heat: no outside temperature -> coldest tyre is the reference', () => {
        const h = A.heat([20, 21, 28, 29], null, 5);
        assert.strictEqual(h.guessedRef, true); near(h.over, 9); assert.strictEqual(h.warm, true);
    }],
    ['heat: no tyre temperatures', () => {
        assert.strictEqual(A.heat([null, undefined], 10).known, false);
    }],
    ['cooling time: typical tau', () => {
        assert.strictEqual(A.minutesToCool(4, 5), 0);
        assert.strictEqual(A.minutesToCool(20, 5), Math.ceil(30 * Math.log(4)));   // ~42 min
    }],
    ['cooling tau measured from an exponential cool-down', () => {
        const tau = 20, s = [];
        for (let m = 0; m <= 10; m++) s.push([m * 60000, 25 * Math.exp(-m / tau)]);
        near(A.coolingTau(s), tau, 0.5);
        assert.strictEqual(A.coolingTau(s.slice(0, 3)), null, 'too few samples');
        assert.strictEqual(A.coolingTau([[0, 20], [60000, 20], [120000, 20], [300000, 20]]), null, 'not cooling');
    }],
    ['season hints', () => {
        assert.strictEqual(A.seasonHint('summer', 3), 'summer-cold');
        assert.strictEqual(A.seasonHint('summer', 15), null);
        assert.strictEqual(A.seasonHint('winter', 25), 'winter-warm');
        assert.strictEqual(A.seasonHint('winter', null), null);
    }],
    ['units', () => {
        near(A.inUnit(2.4, 'psi'), 34.8, 0.05); near(A.inUnit(2.4, 'kpa'), 240); near(A.inUnit(2.4, 'bar'), 2.4);
    }],
];
let fail = 0;
for (const [name, fn] of checks) {
    try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
console.log(fail ? fail + ' failed' : 'all ' + checks.length + ' passed');
process.exit(fail ? 1 : 0);
