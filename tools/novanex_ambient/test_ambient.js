'use strict';
// Tests for apps/novanex_ambient/ambient.js (writer logic with a fake car):
//   node tools/novanex_ambient/test_ambient.js
const assert = require('assert');
const path = require('path');
const { Ambient, request, MODE_SLOT } = require(path.join(__dirname, '..', '..', 'apps', 'novanex_ambient', 'ambient.js'));

function harness(initial) {
    const store = Object.assign({ on: true, keepSetting: false, effect: 'static', colour: 3, speed: 4, gapMs: 400 }, initial);
    const writes = [];
    let now = 1000;
    const settings = { get: (k) => store[k], set: (k, v) => { store[k] = v; } };
    const proxy = {};
    const signals = {
        watch: async (iface, inst, handlers) => { handlers._h = handlers; return { proxy, error: null, _handlers: handlers }; },
        set: async (p, field, val) => { writes.push(val); },
    };
    const log = { info() {}, warn() {}, error() {} };
    const a = new Ambient({ settings, signals, log, now: () => now });
    return { a, writes, store, clock: { set: (t) => { now = t; }, adv: (d) => { now += d; } } };
}
const flush = () => new Promise((r) => setImmediate(r));

const tests = [
    ['set mode writes the chosen slot and leaves hue/brightness alone', async () => {
        const h = harness({ keepSetting: false, effect: 'static', colour: 5 });
        await h.a.start(); await flush(); await flush();
        assert(h.writes.length >= 1, 'no write');
        const w = h.writes[h.writes.length - 1];
        assert.strictEqual(w.controlMenuAmbientePanoramicRoofInteriorLighting, 'FARBAUSWAHL_5');
        assert.strictEqual(w.controlHueInteriorLighting, 4095, 'hue left alone');
        assert.strictEqual(w.controlBrightnessValueBrightnessOffsetAmbientePanoramicRoofInteriorLighting, 255, 'brightness left alone');
    }],
    ['keep mode never SELECTS a different slot: it holds the car\'s current one', async () => {
        for (const fx of ['static', 'rainbow', 'breathe', 'strobe', 'wave']) {
            const h = harness({ keepSetting: true, effect: fx, colour: 1, speed: 4, brightMin: 10, brightMax: 200 });
            await h.a.start();
            h.a._slot = 3;                       // the car is on slot 3 (e.g. Orange)
            h.clock.adv(2000); h.a._writeNow(); await flush();
            for (const w of h.writes) {
                const m = w.controlMenuAmbientePanoramicRoofInteriorLighting;
                assert.ok(m === 'SIGNAL_UNBEFUELLT' || m === 'FARBAUSWAHL_3', fx + ' selected a different slot: ' + m);
            }
        }
    }],
    ['keep mode blocks cycle and mode-follow (they change the setting)', async () => {
        const h = harness({ keepSetting: true, effect: 'cycle', palette: '1,2,3' });
        await h.a.start(); await flush();
        assert.strictEqual(h.writes.length, 0, 'cycle wrote in keep mode');
        assert.strictEqual(h.a.effectRunnable('cycle'), false);
        assert.strictEqual(h.a.effectRunnable('mode'), false);
        assert.strictEqual(h.a.effectRunnable('rainbow'), true);
    }],
    ['keep-mode rainbow writes a hue, not a slot', async () => {
        const h = harness({ keepSetting: true, effect: 'rainbow', speed: 4 });
        h.clock.set(1000); await h.a.start(); h.clock.adv(1000); h.a._writeNow(); await flush();
        const w = h.writes[h.writes.length - 1];
        assert.strictEqual(w.controlMenuAmbientePanoramicRoofInteriorLighting, 'SIGNAL_UNBEFUELLT');
        assert.notStrictEqual(w.controlHueInteriorLighting, 4095, 'no hue written');
    }],
    ['keep-mode breathe keeps the colour (no hue) and pulses brightness', async () => {
        const h = harness({ keepSetting: true, effect: 'breathe', colour: 2, speed: 4, brightMin: 10, brightMax: 200 });
        h.clock.set(1000); await h.a.start(); h.clock.adv(2000); h.a._writeNow(); await flush();
        const w = h.writes[h.writes.length - 1];
        assert.strictEqual(w.controlHueInteriorLighting, 4095, 'breathe must not change the hue');
        assert(w.controlBrightnessValueBrightnessOffsetAmbientePanoramicRoofInteriorLighting <= 254, 'no brightness written');
    }],
    ['identical frame is not re-sent', async () => {
        const h = harness({ effect: 'static', colour: 4 });
        await h.a.start(); await flush();
        const n = h.writes.length;
        h.clock.adv(5000); h.a._writeNow(); await flush();
        assert.strictEqual(h.writes.length, n, 'static re-sent an identical colour');
    }],
    ['mode-follow maps the driving mode to its slot', async () => {
        const h = harness({ effect: 'mode', sportSlot: 1, comfortSlot: 7 });
        await h.a.start(); await flush();
        const handlers = (await h.a.signals) || null;
        // feed a Comfort driving mode
        h.a._drive({ actualValueModeDrivingExperience: 'COMFORT' }); await flush();
        const w = h.writes[h.writes.length - 1];
        assert.strictEqual(w.controlMenuAmbientePanoramicRoofInteriorLighting, 'FARBAUSWAHL_7', 'comfort did not map to slot 7');
        assert.strictEqual(MODE_SLOT.comfort, 'comfortSlot');
    }],
    ['the rate floor stops back-to-back writes', async () => {
        const h = harness({ keepSetting: false, effect: 'cycle', palette: '1,2,3', speed: 3, gapMs: 250 });
        await h.a.start(); await flush();
        const n0 = h.writes.length;
        // hammer many writes within the same instant: the floor should allow at most one
        for (let i = 0; i < 10; i++) { h.a._writeNow(); }
        await flush();
        assert(h.writes.length - n0 <= 1, 'rate floor breached: ' + (h.writes.length - n0) + ' writes at one instant');
    }],
    ['request() in set mode names the slot and leaves the rest at sentinels', () => {
        const r = request({ slot: 9, hue: null, bright: null, zones: null }, false);
        assert.strictEqual(r.controlMenuAmbientePanoramicRoofInteriorLighting, 'FARBAUSWAHL_9');
        assert.strictEqual(r.controlModeAmbientePanoramicRoofInteriorLighting, 'SIGNAL_UNBEFUELLT');
        assert.strictEqual(r.controlHueValueLayer1IndividualGroup, 255);
    }],
    ['request() writes the slot the frame carries, plus the hue', () => {
        const r = request({ slot: 3, hue: 2000, bright: null, zones: null });
        assert.strictEqual(r.controlMenuAmbientePanoramicRoofInteriorLighting, "FARBAUSWAHL_3");
        assert.strictEqual(r.controlHueInteriorLighting, 2000);
    }],
    ['wave writes zone hues', () => {
        const r = request({ slot: null, hue: null, bright: null, zones: [10, 120, 230] }, true);
        assert.strictEqual(r.controlHueValueLayer1IndividualGroup, 10);
        assert.strictEqual(r.controlHueValueLayer2IndividualGroup, 120);
        assert.strictEqual(r.controlHueValueLayer3IndividualGroup, 230);
    }],
];

(async () => {
    let fail = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('ok   ' + name); a_stop(); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
    }
    function a_stop() {}
    console.log(fail ? fail + ' failed' : 'all ' + tests.length + ' passed');
    process.exit(fail ? 1 : 0);
})();
