'use strict';
/**
 * advisor.js - the tyre pressure logic of Presiune Roti, with no head-unit dependencies
 * (so it runs and is tested on any PC: node tools/novanex_tyres/test_advisor.js).
 *
 * Physics: the air in a tyre is a closed volume, so its ABSOLUTE pressure follows its absolute
 * temperature (Gay-Lussac): p_abs / T = const. Gauge pressure = absolute - atmosphere.
 * Pressures on the door placard / in the car's tyre list are for COLD tyres, i.e. tyres at the
 * outside temperature (BMW owner's manual). A tyre 20 C over that reads ~0.25 bar more with
 * exactly the same amount of air - letting that air out makes the tyre too soft once it cools.
 */

const ATM = 1.01325;          // bar, standard atmosphere (the gauge reads relative to it)
const K = 273.15;
const isNum = (x) => typeof x === 'number' && isFinite(x);
const round = (x, d) => (isNum(x) ? Math.round(x * Math.pow(10, d)) / Math.pow(10, d) : null);

/** Gauge pressure (bar) that `coldBar` set at `fromC` reads at `toC`, same air in the tyre. */
function atTemperature(coldBar, fromC, toC) {
    if (!isNum(coldBar) || !isNum(fromC) || !isNum(toC)) return null;
    return (coldBar + ATM) * (toC + K) / (fromC + K) - ATM;
}

/**
 * What a tyre should read NOW so that it has the recommended cold pressure once it cools to
 * the reference temperature: the recommended value moved to the tyre's own temperature.
 * Below the reference (a tyre colder than the air, e.g. in the morning sun) nothing is
 * subtracted - the placard value applies as it is.
 */
function targetNow(coldTarget, tyreC, refC) {
    if (!isNum(coldTarget)) return null;
    if (!isNum(tyreC) || !isNum(refC) || tyreC <= refC) return coldTarget;
    return atTemperature(coldTarget, refC, tyreC);
}

/**
 * Advice for one tyre: { state, delta, now, cold }.
 *   state: 'nodata' | 'ok' | 'add' | 'release' | 'low' (more than 0.3 bar under: a leak?)
 *   delta: bar to add (+) or let out (-) now, at the tyre's current temperature
 *   now:   the pressure it should read now (hot-corrected target)
 *   cold:  what the tyre will read once cooled to the reference
 * tol: tolerance in bar (the TPMS reports in 0.1 bar steps, so 0.1 by default).
 */
function tyreAdvice(p, tyreC, coldTarget, refC, tol) {
    tol = isNum(tol) ? tol : 0.1;
    if (!isNum(p) || !isNum(coldTarget)) return { state: 'nodata', delta: null, now: targetNow(coldTarget, tyreC, refC), cold: null };
    const now = targetNow(coldTarget, tyreC, refC);
    const cold = isNum(tyreC) && isNum(refC) && tyreC > refC ? atTemperature(p, tyreC, refC) : p;
    const delta = now - p;
    let state = 'ok';
    // within tolerance, rounded first: 0.1 bar steps make 2.4 vs 2.5 exactly one step apart
    if (Math.abs(round(delta, 2)) >= tol) state = delta > 0 ? 'add' : 'release';
    if (cold < coldTarget - 0.3) state = 'low';
    return { state, delta: round(delta, 2), now: round(now, 2), cold: round(cold, 2) };
}

/**
 * Tyre state for the whole car: are they cold enough to adjust?
 *   warm = hottest tyre more than `margin` C over the outside air.
 * Without an outside temperature the coldest tyre stands in for it (all four warm equally
 * from driving, a parked car's tyres approach the air together).
 */
function heat(temps, ambientC, margin) {
    margin = isNum(margin) ? margin : 5;
    const ts = (temps || []).filter(isNum);
    if (!ts.length) return { known: false, warm: false, over: null, ref: isNum(ambientC) ? ambientC : null };
    const hot = Math.max.apply(null, ts), cold = Math.min.apply(null, ts);
    const ref = isNum(ambientC) ? ambientC : cold;
    const over = hot - ref;
    return { known: true, warm: over > margin, over: round(over, 1), ref, hottest: hot, guessedRef: !isNum(ambientC) };
}

/**
 * Minutes until the tyres are within `margin` of the air: Newton cooling, dT(t) = dT0 * e^(-t/tau).
 * tau comes from the measured cooling (samples [[ms, overC], ...] taken while parked) once there
 * are a few minutes of it, else a typical value (a parked car's tyres: ~25-35 min).
 */
const TYPICAL_TAU_MIN = 30;
function coolingTau(samples) {
    const pts = (samples || []).filter((s) => isNum(s[0]) && isNum(s[1]) && s[1] > 1);
    if (pts.length < 4) return null;
    const span = pts[pts.length - 1][0] - pts[0][0];
    if (span < 4 * 60000) return null;
    // least squares on ln(dT) against minutes
    const xs = pts.map((p) => (p[0] - pts[0][0]) / 60000), ys = pts.map((p) => Math.log(p[1]));
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    const slope = den ? num / den : 0;
    if (slope >= -0.004) return null;                     // not cooling (still driving, sun, measuring noise)
    return Math.min(120, Math.max(8, -1 / slope));
}
function minutesToCool(overC, margin, tau) {
    margin = isNum(margin) ? margin : 5;
    if (!isNum(overC)) return null;
    if (overC <= margin) return 0;
    return Math.ceil((isNum(tau) ? tau : TYPICAL_TAU_MIN) * Math.log(overC / margin));
}

/**
 * Season hint. Tyre makers and the 7 C rule: summer compound hardens under ~7 C;
 * Romanian law requires winter tyres on snow / ice / frost-covered roads.
 */
function seasonHint(set, ambientC) {
    if (!isNum(ambientC)) return null;
    if (set === 'summer' && ambientC < 7) return 'summer-cold';
    if (set === 'winter' && ambientC > 20) return 'winter-warm';
    return null;
}

/** bar -> unit for display ('bar' | 'psi' | 'kpa'). */
function inUnit(bar, unit) {
    if (!isNum(bar)) return null;
    return unit === 'psi' ? bar * 14.5038 : unit === 'kpa' ? bar * 100 : bar;
}

module.exports = { ATM, atTemperature, targetNow, tyreAdvice, heat, coolingTau, minutesToCool, seasonHint, inUnit, TYPICAL_TAU_MIN, isNum, round };
