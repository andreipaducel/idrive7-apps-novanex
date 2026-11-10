'use strict';
/**
 * effects.js - the lighting-effect engine for Lumini NOVANEX, with no head-unit dependencies
 * (pure math, so it runs and is tested on any PC: node tools/novanex_ambient/test_effects.js).
 *
 * Each effect is a function of time only: frame(effect, tMs, cfg) -> what to show now. That keeps
 * the engine deterministic and testable, and lets ambient.js decide how often to actually write.
 *
 * WHAT THE CAR'S HARDWARE CAN DO (and what it cannot)
 *   The BMW G20 ambient light is NOT addressable per LED like a keyboard. It has a fixed palette of
 *   colours (slots 1..12, BMW's own menu) and, in the "Individual" ambient mode, up to a few colour
 *   zones (front and doors). So:
 *     - A moving "wave" sweeping across many LEDs is physically impossible. The closest is alternating
 *       2-3 zones out of phase ('wave'/'zones' below), and only when the car is set to Individual.
 *     - Effects are time-based for the whole cabin: the colour and/or brightness change over time.
 *   What each effect needs is in `needs`:
 *     - 'slot'       : switching palette colours. PROVEN to work (the stock ambient_config app does it).
 *     - 'bright'     : the brightness-offset field. Used by breathe/strobe. NOT yet verified on a G20.
 *     - 'hue'        : the 12-bit hue field for smooth colour. NOT yet verified on a G20.
 *     - 'zones'      : the per-layer Individual groups. NOT yet verified on a G20.
 *   ambient.js reads `needs` and, in 'safe' engine mode, runs only slot-based effects so nothing
 *   unproven is written to the car.
 *
 * A frame: { slot, hue, bright, zones }
 *   slot   1..12 or null   - a palette colour to select (null: don't touch the colour by slot)
 *   hue    0..4095 or null - a smooth hue (only used in 'full' engine mode)
 *   bright 0..254 or null  - brightness offset (null: leave the car's brightness as it is)
 *   zones  [h,h,h] or null - per-zone hues 0..4095 for Individual mode
 */

const SLOTS = 12;
const HUE_MAX = 4095;
const BRIGHT_MAX = 254;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const isNum = (x) => typeof x === 'number' && isFinite(x);
const frac = (x) => x - Math.floor(x);

/** Triangle wave 0..1..0 over one period (phase in turns). Smooth enough for breathing. */
function triangle(phase) { const p = frac(phase); return p < 0.5 ? p * 2 : 2 - p * 2; }
/** Raised cosine 0..1..0 - softer than triangle, what "breathe" should feel like. */
function breatheCurve(phase) { return (1 - Math.cos(frac(phase) * 2 * Math.PI)) / 2; }

/** Normalised phase (turns) for a given time and period, with an optional offset. */
function phaseOf(tMs, periodMs, offset) { return periodMs > 0 ? (tMs / periodMs + (offset || 0)) : 0; }

/**
 * The effects. cfg carries the user's choices:
 *   periodMs  one full cycle (breath in-out, one rainbow loop, one blink pair)
 *   slot      the base palette colour (1..12) for static/breathe/strobe
 *   hue       the base hue (0..4095) when the engine runs smooth colour
 *   palette   the slots to walk for 'cycle' (array of 1..12); defaults to all 12
 *   brightMin/brightMax  breathe/strobe brightness range (0..254)
 *   zones     how many zones to spread across for 'wave' (2 or 3)
 */
const EFFECTS = {
    // one fixed colour; brightness left alone
    static: {
        needs: ['slot'],
        frame(t, cfg) { return { slot: baseSlot(cfg), hue: baseHue(cfg), bright: null, zones: null }; },
    },
    // one colour, brightness breathing in and out
    breathe: {
        needs: ['slot', 'bright'],
        frame(t, cfg) {
            const k = breatheCurve(phaseOf(t, cfg.periodMs));
            return { slot: baseSlot(cfg), hue: baseHue(cfg), bright: lerpBright(cfg, k), zones: null };
        },
    },
    // walks the palette one colour at a time (stepMs per colour), fading brightness down at each colour
    // change so the colours cross-fade (when the car honours brightness). Also carries a hue for keep mode.
    rainbow: {
        needs: ['slot'],
        frame(t, cfg) {
            const pal = palette(cfg), n = pal.length;
            const step = isNum(cfg.stepMs) && cfg.stepMs > 0 ? cfg.stepMs : 2000;
            const idx = Math.floor(t / step) % n;
            const within = (t % step) / step;                      // 0..1 across one colour
            const env = cfg.fade ? breatheCurve(within) : 1;        // 0 at each switch -> dark exactly when the colour changes
            const bMax = isNum(cfg.brightMax) ? cfg.brightMax : BRIGHT_MAX;
            const bMin = isNum(cfg.brightMin) ? cfg.brightMin : 0;
            const bright = cfg.fade ? Math.round(bMin + (bMax - bMin) * env) : null;
            const hue = Math.round(frac(t / (step * n)) * HUE_MAX) % (HUE_MAX + 1);
            return { slot: pal[idx], hue, bright, zones: null };
        },
    },
    // step through chosen palette colours, one per step (period = time for the whole set)
    cycle: {
        needs: ['slot'],
        frame(t, cfg) {
            const pal = palette(cfg), n = pal.length;
            const step = isNum(cfg.stepMs) && cfg.stepMs > 0 ? cfg.stepMs : 2000;
            return { slot: pal[Math.floor(t / step) % n], hue: null, bright: null, zones: null };
        },
    },
    // blink: brightness (or colour) on/off; 'duty' is the on-fraction (default 0.5)
    strobe: {
        needs: ['slot', 'bright'],
        frame(t, cfg) {
            const on = frac(phaseOf(t, cfg.periodMs)) < clamp(isNum(cfg.duty) ? cfg.duty : 0.5, 0.05, 0.95);
            return { slot: baseSlot(cfg), hue: baseHue(cfg), bright: on ? brightHi(cfg) : brightLo(cfg), zones: null };
        },
    },
    // crude moving colour across 2-3 Individual zones (NOT a real keyboard wave)
    wave: {
        needs: ['zones', 'hue'],
        frame(t, cfg) {
            const n = clamp(Math.round(cfg.zones) || 3, 2, 3);
            const base = phaseOf(t, cfg.periodMs);
            const zones = [];
            for (let i = 0; i < 3; i++) zones.push(i < n ? Math.round(frac(base + i / n) * HUE_MAX) : null);
            return { slot: null, hue: null, bright: null, zones };
        },
    },
};

function baseSlot(cfg) { const n = Math.round(cfg.slot); return n >= 1 && n <= SLOTS ? n : 1; }
function baseHue(cfg) { return isNum(cfg.hue) ? clamp(Math.round(cfg.hue), 0, HUE_MAX) : null; }
function brightHi(cfg) { return clamp(Math.round(isNum(cfg.brightMax) ? cfg.brightMax : BRIGHT_MAX), 0, BRIGHT_MAX); }
function brightLo(cfg) { return clamp(Math.round(isNum(cfg.brightMin) ? cfg.brightMin : 0), 0, BRIGHT_MAX); }
function lerpBright(cfg, k) { return Math.round(brightLo(cfg) + (brightHi(cfg) - brightLo(cfg)) * clamp(k, 0, 1)); }

/** The palette to walk; defaults to all 12 slots in order. */
function palette(cfg) {
    const p = Array.isArray(cfg.palette) ? cfg.palette.filter((n) => n >= 1 && n <= SLOTS) : [];
    if (p.length) return p;
    const all = []; for (let i = 1; i <= SLOTS; i++) all.push(i); return all;
}
/** Which palette slot is active at this phase (0..1 across the whole set). */
function paletteStep(cfg, phase) { const p = palette(cfg); return p[Math.floor(frac(phase) * p.length) % p.length]; }

/** frame(effectName, tMs, cfg) -> a frame, or null for an unknown effect. */
function frame(effect, tMs, cfg) {
    const e = EFFECTS[effect];
    if (!e) return null;
    return e.frame(isNum(tMs) ? tMs : 0, cfg || {});
}
/** What an effect needs from the hardware (see the file header). */
function needs(effect) { return (EFFECTS[effect] && EFFECTS[effect].needs) || []; }
/** Can this effect run using only proven slot switching? */
function isSafe(effect) { return needs(effect).every((n) => n === 'slot'); }

module.exports = {
    frame, needs, isSafe, EFFECTS, palette, paletteStep,
    triangle, breatheCurve, phaseOf, clamp, frac,
    SLOTS, HUE_MAX, BRIGHT_MAX,
    NAMES: Object.keys(EFFECTS),
};
