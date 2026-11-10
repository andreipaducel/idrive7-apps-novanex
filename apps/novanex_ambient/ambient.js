'use strict';
/**
 * ambient.js - drives the BMW ambient light for Lumini NOVANEX: runs an effect from effects.js on a
 * timer, or follows the driving mode, and writes the colour to the car. No UI here.
 *
 * It writes the same ComfortFunctionIuK.ambientLightInteriorColour struct the stock ambient_config app
 * writes, so slot switching is on ground that is proven to work. Two engine modes:
 *   'safe' (default): only effects that need nothing but slot switching (Static, Colour cycle, Rainbow
 *                     as a palette walk, Mode-follow). Nothing unverified is ever written.
 *   'full'          : also writes the brightness, hue and Individual-zone fields, so Breathe, Strobe,
 *                     smooth Rainbow and Wave work IF the car accepts them. Unverified on a G20 -
 *                     label it experimental in the UI and let the driver test it parked.
 *
 * Rate: the ambient light is a comfort-bus function, not a display. Writing it fast spams that bus, so
 * there is a hard floor on how often we write (MIN_GAP_MS) and a configurable gap above it. One write
 * at a time; a colour the car already shows is never re-sent.
 *
 *   const a = new Ambient({ settings, signals, log });
 *   await a.start();  a.on('change', fn);  a.slot();  a.running();  a.setEffect('breathe');  a.stop();
 */
const EventEmitter = require('events');
const EFX = require('./effects');

const LIGHT = 'de.bmw.infotainment.misc.ComfortFunctionIuK';
const FES = 'de.bmw.infotainment.drivingexcitement.FES';
const SLOTS = EFX.SLOTS;
const MIN_GAP_MS = 250;                 // hard floor between writes, whatever the user picks
const UNFILLED = 'SIGNAL_UNBEFUELLT';

// driving modes -> a slot, reused from the stock app so Mode-follow behaves the same
const BY_NAME = {
    SPORT_DYNAMIC: 1, SPORT_EXPERT: 2, SPORT_INDIVIDUAL: 3, COMFORT: 4, COMFORT_PLUS: 5, COMFORT_INDIVIDUAL: 6,
    ECO_PRO_EFFICIENT: 7, ECO_PRO_PLUS: 8, ECO_PRO_INDIVIDUAL: 9, ADAPTIVE: 10, PHEV_SPORT_STANDARD: 15, PHEV_SPORT_INDIVIDUAL: 16,
    PHEV_HYBRID_STANDARD: 17, PHEV_HYBRID_ECO: 18, PHEV_HYBRID_COMFORT: 19, PHEV_ELECTRIC_STANDARD: 20, PHEV_ELECTRIC_INDIVIDUAL: 21, PHEV_SPORT_PLUS: 23,
};
const MODE_SLOT = { sport: 'sportSlot', comfort: 'comfortSlot', eco: 'ecoSlot', adaptive: 'adaptiveSlot' };
const MODE_OF = { 1: 'sport', 2: 'sport', 3: 'sport', 4: 'comfort', 5: 'comfort', 6: 'comfort', 7: 'eco', 8: 'eco', 9: 'eco', 10: 'adaptive',
    15: 'sport', 16: 'sport', 23: 'sport', 17: 'comfort', 19: 'comfort', 18: 'eco', 20: 'adaptive', 21: 'adaptive' };

function slotOf(raw) {
    const m = /^FARBAUSWAHL_(\d+)$/.exec(String(raw));
    const n = m ? Number(m[1]) : Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= SLOTS ? n : null;
}
function modeOf(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = typeof raw === 'number' || /^\d+$/.test(String(raw)) ? Number(raw) : BY_NAME[String(raw).toUpperCase()];
    return n === undefined ? null : (MODE_OF[n] || null);
}

/**
 * Build the struct. A frame from effects.js says what to change; everything else is left as it is with
 * the "leave" sentinels the stock app uses (hue 4095, layers 255, brightness 255, modes unfilled).
 *
 * keep = true: never touch the saved menu colour (controlMenu stays UNFILLED), so the car keeps the
 *              colour the driver chose in BMW's menu; the effect changes only the hue / brightness /
 *              zones that are shown. This is what "keep my setting, just animate the colour" needs -
 *              but driving the hue field is UNVERIFIED on a G20 (the car may ignore it).
 * keep = false: the effect may select a palette slot (controlMenu = FARBAUSWAHL_n). That is the proven
 *               path, but it changes the colour selected in BMW's own menu.
 */
function request(frame) {
    const slot = frame.slot;   // _frame decides: the car's CURRENT slot in keep mode (no change), the effect's slot in set mode
    const hue = frame.hue != null ? frame.hue : null;
    const bright = frame.bright != null ? frame.bright : null;
    const zones = frame.zones ? frame.zones : null;
    return {
        controlMenuAmbientePanoramicRoofInteriorLighting: slot != null ? 'FARBAUSWAHL_' + slot : UNFILLED,
        controlModeAmbientePanoramicRoofInteriorLighting: UNFILLED,
        controlDynamicInteriorLighting: UNFILLED,
        controlDynamicAmbienteInteriorLighting: UNFILLED,
        controlHueInteriorLighting: hue != null ? hue : 4095,
        controlHueValueLayer1IndividualGroup: zones && zones[0] != null ? zones[0] & 0xff : 255,
        controlHueValueLayer2IndividualGroup: zones && zones[1] != null ? zones[1] & 0xff : 255,
        controlHueValueLayer3IndividualGroup: zones && zones[2] != null ? zones[2] & 0xff : 255,
        controlBrightnessValueBrightnessOffsetAmbientePanoramicRoofInteriorLighting: bright != null ? bright : 255,
    };
}

/** A short signature so we never re-send an identical frame. */
function sig(frame, keep) {
    const r = request(frame, keep);
    return [r.controlMenuAmbientePanoramicRoofInteriorLighting, r.controlHueInteriorLighting, r.controlBrightnessValueBrightnessOffsetAmbientePanoramicRoofInteriorLighting,
        r.controlHueValueLayer1IndividualGroup, r.controlHueValueLayer2IndividualGroup, r.controlHueValueLayer3IndividualGroup].join('|');
}

class Ambient extends EventEmitter {
    constructor(o) {
        super();
        this.settings = o.settings;
        this.signals = o.signals;
        this.log = o.log;
        this.now = o.now || Date.now;
        this._slot = null;         // the slot the car currently shows (from its status)
        this._own = null;          // the driver's own colour (last one not set by us)
        this._mode = null;         // driving mode
        this._proxy = null;
        this._busy = false;
        this._lastSig = null;
        this._last = -Infinity;
        this._tick = null;
        this._t0 = this.now();
        this.available = false;
        this.error = null;
    }

    slot() { return this._slot; }
    own() { return this._own; }
    mode() { return this._mode; }
    effect() { return this.settings.get('effect') || 'static'; }
    /** keep = don't change the saved BMW colour; animate the hue/brightness instead (default). */
    keepSetting() { return this.settings.get('keepSetting') !== false; }
    running() { return this.settings.get('on') !== false && this.effect() !== 'off'; }
    /**
     * Can this effect run in the current mode?
     *   keep mode : effects that change colour by SLOT only (cycle, mode-follow) can't run - they would
     *               have to change the saved setting. Everything that drives hue/brightness/zones can.
     *   set mode  : everything runs (colour by slot is allowed).
     */
    effectRunnable(name) {
        if (!this.keepSetting()) return true;
        return ['cycle', 'mode'].indexOf(name) < 0;
    }

    async start() {
        const light = await this.signals.watch(LIGHT, '1', { statusAmbientLightInteriorColour: (v) => this._status(v) }, this.log);
        this._proxy = light.proxy;
        this.available = !!light.proxy;
        if (light.error) { this.error = light.error; this.log.warn('ambient light: ' + light.error); }
        const fes = await this.signals.watch(FES, '1', { statusFESVehicleDynamicSwitchHMI: (v) => this._drive(v) }, this.log);
        if (fes.error) this.log.warn('driving mode: ' + fes.error);
        this._schedule();
        this.emit('change');
    }

    _status(v) {
        const n = slotOf(v && v.statusMenuAmbientePanoramicRoofInteriorLighting);
        if (n === null || n === this._slot) return;
        const wasOurs = this._busy || (this.now() - this._last < 1500);
        this._slot = n;
        if (!this.running() || !wasOurs) this._own = n;     // a colour we didn't set is the driver's own
        this.emit('change');
    }
    _drive(v) {
        const m = modeOf(v && v.actualValueModeDrivingExperience);
        if (!m || m === this._mode) return;
        this._mode = m;
        if (this.effect() === 'mode') this._writeNow();
        this.emit('change');
    }

    /** Effect config from settings. In keep mode the chosen colour 1..12 becomes a hue. */
    cfg() {
        const s = this.settings;
        const pal = String(s.get('palette') || '').split(',').map((x) => Number(x)).filter((n) => n >= 1 && n <= SLOTS);
        const colour = Number(s.get('colour')) || 1;
        const sec = Number(s.get('speed')) || 3;
        return {
            periodMs: Math.max(400, sec * 1000),       // breathe/strobe: one cycle
            stepMs: Math.max(250, sec * 1000),         // rainbow/cycle: time on each colour
            fade: s.get('fade') !== false,
            slot: colour,
            hue: Math.round(((colour - 1) / SLOTS) * EFX.HUE_MAX),   // the base colour as a hue, for keep mode
            palette: pal.length ? pal : null,
            brightMin: Number(s.get('brightMin')) || 0,
            brightMax: Number(s.get('brightMax')) != null ? Number(s.get('brightMax')) : 254,
            duty: (Number(s.get('duty')) || 50) / 100,
            zones: Number(s.get('zones')) || 3,
        };
    }

    /** The frame to show right now. */
    _frame() {
        const name = this.effect();
        const keep = this.keepSetting();
        if (name === 'mode') {                               // follow the driving mode (changes the slot)
            if (keep) return null;
            const key = this._mode && MODE_SLOT[this._mode];
            const n = key ? Number(this.settings.get(key)) || 0 : 0;
            if (n >= 1 && n <= SLOTS) return { slot: n, hue: null, bright: null, zones: null };
            if (this._own) return { slot: this._own, hue: null, bright: null, zones: null };
            return null;
        }
        if (!this.effectRunnable(name)) return null;
        const f = EFX.frame(name, this.now() - this._t0, this.cfg());
        if (!f) return null;
        if (keep) {
            // keep the driver's saved colour SELECTION: re-assert the slot the car is already on (same
            // value = no change), and drive the hue over it. If the car honours the hue field we get the
            // effect without moving the selection; if not, the light just stays on the chosen colour.
            f.slot = (this._slot != null ? this._slot : (this._own != null ? this._own : null));
            if (['breathe', 'strobe'].indexOf(name) >= 0) f.hue = null;   // brightness effects keep the colour
        } else {
            // change the setting by slot: colour comes from the slot, not the hue/zones
            f.hue = null; f.zones = null;
        }
        return f;
    }

    setEffect(name) { this.settings.set('effect', name); this._t0 = this.now(); this._writeNow(); }
    stop() { clearInterval(this._tick); this._tick = null; }

    _schedule() {
        clearInterval(this._tick);
        // dynamic effects re-write on a timer; static/mode only write on change
        const dynamic = ['rainbow', 'cycle', 'breathe', 'strobe', 'wave'].indexOf(this.effect()) >= 0;
        const gap = Math.max(MIN_GAP_MS, (Number(this.settings.get('gapMs')) || 400));
        if (this.running() && dynamic) this._tick = setInterval(() => this._writeNow(), gap);
        this._writeNow();
    }

    _writeNow() {
        if (!this.running()) return;
        const f = this._frame();
        if (!f) return;
        const keep = this.keepSetting();
        const s = sig(f, keep);
        // nothing new to send, unless the car drifted to a different slot (someone changed it by hand)
        const drifted = f.slot != null && this._slot != null && this._slot !== f.slot;
        if (s === this._lastSig && !drifted) return;
        this._want = { f, keep, s };
        this._drain();
    }

    _drain() {
        if (this._busy || !this._want) return;
        const wait = this._last + MIN_GAP_MS - this.now();
        if (wait > 0) { if (!this._gap) this._gap = setTimeout(() => { this._gap = null; this._drain(); }, wait); return; }
        const { f, keep, s } = this._want;
        this._want = null;
        if (!this._proxy) { this.log.warn('ambient: the car\'s ambient light does not answer'); return; }
        this._busy = true;
        this._last = this.now();
        this._lastSig = s;
        Promise.resolve().then(() => this.signals.set(this._proxy, 'ambientLightInteriorColour', request(f, keep)))
            .then(() => { this.error = null; }, (e) => { this.error = String(e && e.message || e); this.log.warn('ambient set: ' + this.error); })
            .then(() => { this._busy = false; this.emit('change'); this._drain(); });
    }

    // the UI changed a setting
    onSettingChange() { this._t0 = this._t0 || this.now(); this._schedule(); this.emit('change'); }
}

module.exports = { Ambient, request, sig, slotOf, modeOf, MODE_SLOT, MIN_GAP_MS, SLOTS };
