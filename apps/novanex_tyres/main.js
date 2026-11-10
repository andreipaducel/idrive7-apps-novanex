'use strict';
/**
 * Presiune Roti - tyre pressures and temperatures from the car's TPMS (RDC), and what to do
 * about them: how much air to add or let out at each wheel, corrected for how warm the tyres
 * are right now, for the summer or the winter set.
 *
 *   - the recommended COLD pressure comes from the car (the tyre list chosen in iDrive),
 *     from a table taken from a tyre-pressure site (tools/novanex_tyres/fetch_pressures.py), or is set by hand
 *   - warm tyres read more with the same air (gas law, advisor.js): the screen shows the value
 *     each tyre should read NOW, so adjusting at the fuel station right after driving works
 *   - "cold" / "warm" state against the outside temperature, and minutes until cold
 *     (measured cooling rate while parked, a typical one until enough is measured)
 *   - 7 C rule hint for summer tyres
 *
 * Text is Romanian without diacritics: the kit's baked fonts are ASCII + a few symbols.
 */
const mgu = require('./kit/mgu');
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const A = require('./advisor');
const Demo = require('./demo');
const TABLE = require('./pressures');

const W = 1600, H = 520;
const GO = '#2fd27a';
const WHEELS = ['FL', 'FR', 'RL', 'RR'];
const TYRE_T = [-40, 150], TYRE_P = [0.5, 6];
const PRESS_UNITS = { 1: 'BAR', 2: 'KPA', 3: 'PSI' }, TEMP_UNITS = { 1: 'C', 2: 'F' };
const PRESS_TO_BAR = { BAR: 1, KPA: 0.01, PSI: 1 / 14.5038 };

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;

        /* ---------- live data from the car ---------- */
        const live = {};
        let lastCar = 0;
        const put = (k, v) => { live[k] = v; lastCar = Date.now(); };
        const carUnits = { press: null, temp: null, psiSeen: false };
        const unitName = (map, v) => (map[v] || (Object.keys(map).map((k) => map[k]).indexOf(v) >= 0 ? v : null));
        /** 0.1 x raw in the car's pressure unit, 65532 and up = no value -> bar. */
        const tyreP = (raw) => {
            if (!A.isNum(raw) || raw >= 65532) return null;
            const v = raw * 0.1, k = PRESS_TO_BAR[carUnits.press];
            if (k) return v * k;
            if (v >= TYRE_P[0] && v <= TYRE_P[1]) return v;                  // unit unknown yet: only one fits
            if (v >= 7 && v < 60) { carUnits.psiSeen = true; return v / 14.5038; }
            if (v >= 60 && v <= 600) return v / 100;
            return null;
        };
        /** degrees + 40 in the car's temperature unit, 65535 = no value -> deg C. */
        const tyreT = (raw) => {
            if (!A.isNum(raw) || raw === 65535) return null;
            let v = raw - 40;
            if (carUnits.temp ? carUnits.temp === 'F' : carUnits.psiSeen) v = (v - 32) * 5 / 9;
            return v >= TYRE_T[0] && v <= TYRE_T[1] ? v : null;
        };
        const watches = [
            ['de.bmw.infotainment.vehicle.TPMS', {
                statusTyreTemperature: (v) => {
                    put('tFL', tyreT(v.actualValueTemperatureTyreFLH)); put('tFR', tyreT(v.actualValueTemperatureTyreFRH));
                    put('tRL', tyreT(v.actualValueTemperatureTyreRLH)); put('tRR', tyreT(v.actualValueTemperatureTyreRRH));
                },
                statusTyrePressure: (v) => {
                    if (v && v.actualValuePressureTyreFLH === undefined) log.info('tyre pressure fields: ' + Object.keys(v || {}).join(','));
                    put('pFL', tyreP(v.actualValuePressureTyreFLH)); put('pFR', tyreP(v.actualValuePressureTyreFRH));
                    put('pRL', tyreP(v.actualValuePressureTyreRLH)); put('pRR', tyreP(v.actualValuePressureTyreRRH));
                },
                statusTargetTyrePressure: (v) => {
                    put('ptFL', tyreP(v.targetPressureTyreFLH)); put('ptFR', tyreP(v.targetPressureTyreFRH));
                    put('ptRL', tyreP(v.targetPressureTyreRLH)); put('ptRR', tyreP(v.targetPressureTyreRRH));
                },
            }],
            ['de.bmw.infotainment.vehicle.Vehicle', {
                statusNewCurrentUnitsStatusExt: (v) => {
                    const press = unitName(PRESS_UNITS, v && v.unitOfMeasurementAirPressure), temp = unitName(TEMP_UNITS, v && v.unitOfMeasurementTemperature);
                    if (press === carUnits.press && temp === carUnits.temp) return;
                    carUnits.press = press; carUnits.temp = temp;
                    log.info('car units: pressure ' + (press || '?') + ', temperature ' + (temp || '?'));
                },
            }],
            ['de.bmw.infotainment.vehicle.Vehicle2', {
                statusCarSpeed2: (v) => {
                    const r = v && v.speedVehicleCentreOfGravity;
                    put('speed', A.isNum(r) && r !== 65535 ? r * 0.015625 : null);
                },
            }],
            ['de.bmw.infrastructure.EnvironmentalInformation', {
                ExteriorTemperature: (v) => {
                    const r = v && v.temperatureExterior;
                    put('ambient', A.isNum(r) && r !== 255 ? r * 0.5 - 40 : null);
                },
            }],
        ];
        // TPMS also read every 10 s: BMW's own app only ever reads these fields, so a car may not notify them
        const subs = [], startT = Date.now();
        Promise.all(watches.map(([iface, h]) => ctx.signals.watch(iface, '1', h, log, /\.TPMS$/.test(iface) ? { pollMs: 10000 } : undefined)
            .then((s) => { subs.push(s); return s; })))
            .then((all) => log.info('signals: ' + all.map((s) => s.iface.split('.').pop() + (s.error ? '(err)' : '')).join(' ')))
            .catch((e) => log.warn('signals: ' + e));

        const demo = new Demo();
        const carPresent = () => lastCar > 0 || subs.some((s) => s.available);
        const usingDemo = () => settings.get('demo') === 'on' || (settings.get('demo') === 'auto' && !carPresent() && Date.now() - startT > 5000);
        const data = () => (usingDemo() ? demo.sample() : Object.assign({}, live));

        ui.onClick('BTN_SET', () => settings.set('tyreSet', settings.get('tyreSet') === 'winter' ? 'summer' : 'winter'));

        /* ---------- recommended cold pressures ---------- */
        const isWinter = () => settings.get('tyreSet') === 'winter';
        const isLoad = () => settings.get('loadMode') === 'load';
        function tableTarget() {
            const set = TABLE.sets[settings.get(isWinter() ? 'winterSize' : 'summerSize')];
            if (!set) return null;
            // prefer the chosen load case; fall back to comfort if that size has no full-load value on the placard
            const pick = (isLoad() && set.load) ? set.load : set.comfort;
            if (!pick) return null;
            const add = isWinter() ? Number(settings.get('winterAdd')) || 0 : 0;
            const loadMissing = isLoad() && !set.load;
            return { F: pick.F + add, R: pick.R + add, label: set.label + (isLoad() ? (loadMissing ? ' · confort (fara plin in tabel)' : ' · plin') : ''), from: 'eticheta masinii' };
        }
        function carTarget(d) {
            if (!A.isNum(d.ptFL) && !A.isNum(d.ptRL)) return null;
            const avg = (a, b) => (A.isNum(a) && A.isNum(b) ? (a + b) / 2 : A.isNum(a) ? a : b);
            return { F: avg(d.ptFL, d.ptFR), R: avg(d.ptRL, d.ptRR), per: { FL: d.ptFL, FR: d.ptFR, RL: d.ptRL, RR: d.ptRR }, label: null, from: 'masina (lista iDrive)' };
        }
        /** { F, R, per?, label, from } or null. */
        function target(d) {
            const src = settings.get('source');
            if (src === 'manual') {
                const w = isWinter();
                return { F: settings.get(w ? 'manWinF' : 'manSumF'), R: settings.get(w ? 'manWinR' : 'manSumR'), label: null, from: 'valori manuale' };
            }
            if (src === 'table') return tableTarget();
            const c = carTarget(d);
            return c || (src === 'auto' ? tableTarget() : null);
        }
        const wheelTarget = (tg, k) => (tg ? (tg.per && A.isNum(tg.per[k]) ? tg.per[k] : k[0] === 'F' ? tg.F : tg.R) : null);

        /* ---------- cooling while parked ---------- */
        const mono = () => { const h = process.hrtime(); return h[0] * 1000 + h[1] / 1e6; };
        let cool = [], lastCool = 0;
        function trackCooling(d, h) {
            const now = A.isNum(d.clock) ? d.clock : mono();
            const parked = !A.isNum(d.speed) || d.speed < 3;
            // driving warms the tyres again; a clock that went back (demo loop) starts over
            if (!parked || !h.known || now < lastCool) { cool = []; lastCool = 0; return; }
            if (!cool.length || now - lastCool >= 30000) { cool.push([now, h.over]); lastCool = now; }
            while (cool.length > 60) cool.shift();                                   // last 30 min
        }

        /* ---------- drawing ---------- */
        const unit = () => settings.get('unit') || 'bar';
        const dec = () => (unit() === 'bar' ? 1 : 0);
        const P = (bar) => { const v = A.inUnit(bar, unit()); return A.isNum(v) ? v.toFixed(dec()) : '--'; };
        const signed = (bar) => { const v = A.inUnit(bar, unit()); return (v > 0 ? '+' : '') + v.toFixed(dec()); };
        const C = (c) => (A.isNum(c) ? Math.round(c) + '°C' : '--°C');

        function stateColor(t, s) {
            return s === 'ok' ? GO : s === 'add' || s === 'release' ? t.warn : s === 'low' ? t.crit : t.track;
        }

        /** One wheel: tyre on the car + its numbers beside it (outside). */
        function wheel(cv, t, k, a, d, x, y, side) {
            const tw = 58, th = 104;
            cv.roundRect(x, y, tw, th, 12, stateColor(t, a.state));
            cv.strokeRoundRect(x, y, tw, th, 12, 2, withAlpha('#000000', 0.35));
            for (let i = 1; i < 5; i++) cv.fillRect(x + 8, y + i * th / 5, tw - 16, 2, withAlpha('#000000', 0.18));
            const al = side < 0 ? 'right' : 'left', lx = side < 0 ? x - 22 : x + tw + 22;
            const p = d['p' + k];
            const pw = cv.text(P(p), lx, y + 34, 64, A.isNum(p) ? t.text : t.dim, { align: al, font: 'num' });
            const ux = side < 0 ? lx - pw - 8 : lx + pw + 8;
            cv.text(unit(), ux, y + 34, 24, t.dim, { align: al });
            cv.text(C(d['t' + k]), lx, y + 66, 26, t.dim, { align: al, font: 'bold' });
            let act = '--', ac = t.dim;
            if (a.state === 'ok') { act = 'OK'; ac = GO; }
            else if (a.state === 'add') { act = 'UMFLA ' + signed(a.delta); ac = t.warn; }
            else if (a.state === 'release') { act = 'SCOATE ' + signed(a.delta); ac = t.warn; }
            else if (a.state === 'low') { act = 'PREA MICA ' + signed(a.delta); ac = t.crit; }
            cv.text(act, lx, y + 100, 30, ac, { align: al, font: 'bold' });
            if (A.isNum(a.now)) cv.text('tinta acum ' + P(a.now), lx, y + 128, 22, t.dim, { align: al });
        }

        function render() {
            const t = ctx.theme(), d = data();
            const cv = ctx.canvas(W, H).clear(t.bg);
            const margin = Number(settings.get('margin')) || 5;
            const h = A.heat(WHEELS.map((k) => d['t' + k]), d.ambient, margin);
            const ref = settings.get('refTemp') === '20' ? 20 : h.ref;
            const tg = target(d);
            const advice = {};
            WHEELS.forEach((k) => { advice[k] = A.tyreAdvice(d['p' + k], d['t' + k], wheelTarget(tg, k), ref); });
            trackCooling(d, h);

            // ---- left: the car from above with each wheel
            const lp = G.panel(cv, t, 24, G.TOP, 876, G.BOTTOM - G.TOP, 'Roti');
            const cx = 462, top = G.TOP + 70, bodyH = Math.min(380, lp.h - 90), bodyW = 210;
            cv.strokeRoundRect(cx - bodyW / 2, top, bodyW, bodyH, 70, 3, t.tick);
            cv.fillRect(cx - bodyW / 2 + 24, top + bodyH * 0.28, bodyW - 48, 3, withAlpha(t.tick, 0.6));      // windscreen
            cv.fillRect(cx - bodyW / 2 + 30, top + bodyH * 0.78, bodyW - 60, 3, withAlpha(t.tick, 0.6));      // rear window
            cv.text('FATA', cx, top + 40, 22, t.dim, { align: 'center', font: 'bold', spacing: 2 });
            const fy = top + 14, ry = Math.min(top + bodyH - 118, G.BOTTOM - 152);
            wheel(cv, t, 'FL', advice.FL, d, cx - bodyW / 2 - 64, fy, -1);
            wheel(cv, t, 'FR', advice.FR, d, cx + bodyW / 2 + 6, fy, 1);
            wheel(cv, t, 'RL', advice.RL, d, cx - bodyW / 2 - 64, ry, -1);
            wheel(cv, t, 'RR', advice.RR, d, cx + bodyW / 2 + 6, ry, 1);

            // ---- right: what to do
            const rx = 924, rw = 652, tx = rx + 24, tr = rx + rw - 24;
            G.panel(cv, t, rx, G.TOP, rw, G.BOTTOM - G.TOP, null);
            const any = WHEELS.some((k) => A.isNum(d['p' + k]));
            const moving = A.isNum(d.speed) && d.speed >= 8;
            let st, col;
            if (!any) { st = 'FARA DATE DE LA SENZORI'; col = t.dim; }
            else if (!tg) { st = 'LIPSESTE PRESIUNEA RECOMANDATA'; col = t.warn; }
            else if (moving) { st = 'IN MERS - AJUSTEAZA LA OPRIRE'; col = t.dim; }
            else if (h.warm) { st = 'ANVELOPE CALDE +' + Math.round(h.over) + '°C'; col = t.warn; }
            else if (WHEELS.some((k) => advice[k].state === 'low')) { st = 'O ROATA E PREA MOALE'; col = t.crit; }
            else if (WHEELS.every((k) => advice[k].state === 'ok' || advice[k].state === 'nodata')) { st = 'PRESIUNI CORECTE'; col = GO; }
            else { st = 'ANVELOPE RECI - AJUSTEAZA ACUM'; col = GO; }
            cv.roundRect(tx, 70, rw - 48, 60, 10, withAlpha(col, 0.22));
            cv.text(st, tx + (rw - 48) / 2, 112, st.length > 22 ? 28 : 34, col, { align: 'center', font: 'bold', spacing: 2 });

            let y = 178;
            if (any && tg && h.warm && !moving) {
                const tau = A.coolingTau(cool), mins = A.minutesToCool(h.over, margin, tau);
                cv.text('RECI IN', tx, y, 22, t.dim, { font: 'bold', spacing: 1.5 });
                const bw = cv.text('~' + mins, tx, y + 52, 64, t.text, { font: 'num' });
                cv.text('min' + (A.isNum(tau) ? '' : ' (estimat)'), tx + bw + 10, y + 52, 26, t.dim);
                cv.text('sau umfla ACUM', tr, y + 18, 26, t.text, { align: 'right', font: 'bold' });
                cv.text('la "tinta acum" de la fiecare roata', tr, y + 46, 20, t.dim, { align: 'right' });
                cv.text('(corectata pt. caldura: iese corect la rece)', tr, y + 70, 20, t.dim, { align: 'right' });
                y += 96;
            } else if (any && tg && !moving) {
                cv.text('Ajusteaza la valorile de langa fiecare roata.', tx, y + 4, 24, t.text, { font: 'bold' });
                cv.text('Presiunea e masurata acum, cu anvelopele reci.', tx, y + 36, 22, t.dim);
                y += 70;
            } else if (moving) {
                cv.text('Valorile se corecteaza dupa temperatura,', tx, y + 4, 24, t.text, { font: 'bold' });
                cv.text('dar ajustarea se face cu masina oprita.', tx, y + 36, 22, t.dim);
                y += 70;
            } else if (!any) {
                cv.text('Senzorii RDC trimit dupa cateva minute de mers.', tx, y + 4, 22, t.dim);
                y += 40;
            }

            // recommended cold values
            y += 14;
            cv.fillRect(tx, y - 22, rw - 48, 1, withAlpha(t.tick, 0.5));
            cv.text('RECOMANDAT LA RECE', tx, y + 10, 22, t.dim, { font: 'bold', spacing: 1.5 });
            if (tg) cv.text('FATA ' + P(tg.F) + '   SPATE ' + P(tg.R) + ' ' + unit(), tr, y + 12, 28, t.text, { align: 'right', font: 'bold' });
            else cv.text(settings.get('source') === 'car' ? 'masina nu trimite: alege tabel / manual' : '--', tr, y + 12, 22, t.warn, { align: 'right' });
            y += 44;
            const setName = isWinter() ? 'IARNA' : 'VARA';
            cv.text('SET', tx, y + 10, 22, t.dim, { font: 'bold', spacing: 1.5 });
            cv.text(setName + ' · ' + (isLoad() ? 'PLIN' : 'CONFORT') + (tg && tg.label ? ' · ' + tg.label : ''), tr, y + 12, 24, isWinter() ? t.cold : t.text, { align: 'right', font: 'bold' });
            y += 38;
            cv.text('SURSA', tx, y + 10, 22, t.dim, { font: 'bold', spacing: 1.5 });
            cv.text(tg ? tg.from : '--', tr, y + 12, 22, t.dim, { align: 'right' });
            y += 38;
            cv.text('AFARA', tx, y + 10, 22, t.dim, { font: 'bold', spacing: 1.5 });
            cv.text(A.isNum(d.ambient) ? C(d.ambient) : 'necunoscut (ref.: cea mai rece roata)', tr, y + 12, A.isNum(d.ambient) ? 26 : 20, t.text, { align: 'right', font: A.isNum(d.ambient) ? 'bold' : 'label' });
            y += 40;

            // hints
            const hint = A.seasonHint(isWinter() ? 'winter' : 'summer', d.ambient);
            if (hint === 'summer-cold') cv.text('Sub 7°C anvelopele de vara se intaresc: monteaza setul de iarna.', tx, y + 6, 21, t.warn, { font: 'bold' });
            else if (hint === 'winter-warm') cv.text('Peste 20°C anvelopele de iarna se uzeaza repede.', tx, y + 6, 21, t.warn, { font: 'bold' });
            else if (settings.get('source') === 'auto' && tg && tg.per && tableTarget()) {
                const tb = tableTarget();
                if (Math.abs(tb.F - tg.F) > 0.15 || Math.abs(tb.R - tg.R) > 0.15) {
                    cv.text('Masina are alta tinta decat tabelul: verifica anvelopele alese in iDrive.', tx, y + 6, 20, t.dim);
                }
            }

            G.frame(cv, t, ['Presiune roti'], 0, [d.demo && { text: 'DEMO' }]);
            return ui.image('MAIN_GFX', cv);
        }

        // tyre values change slowly: 2 frames a second in software, every refresh with the GPU renderer
        ctx.loop('MAIN', 2, render);
        render().then(() => log.info('first frame done')).catch((e) => log.warn('first render: ' + e));
    },
});
