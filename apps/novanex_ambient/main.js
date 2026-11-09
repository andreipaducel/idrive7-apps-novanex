'use strict';
/**
 * Lumini NOVANEX - effects for the BMW ambient light.
 *
 * Left: pick an effect and turn it on or off. Right: a live preview of the effect and the state.
 * The effect itself runs in the background (app.json "autostart"), so it keeps going with the app
 * closed; ambient.js has the rules and writes to the car, effects.js is the pure effect engine.
 *
 * The preview animates from the same engine, so it moves on screen even when the car does not accept
 * an effect (brightness/hue are unverified on the G20 - see the README and the banner).
 * Text is Romanian without diacritics: the kit fonts are ASCII + a few symbols.
 */
const mgu = require('./kit/mgu');
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const EFX = require('./effects');
const { Ambient } = require('./ambient');

const W = 1600, H = 520;

// Illustrative colours for the 12 BMW palette slots (the real colours depend on the car - preview only).
const SWATCH = ['#ff7a18', '#ff5a2c', '#ffd27f', '#ffffff', '#b98cff', '#6ea8ff', '#38c6ff', '#2fd27a', '#b6e03a', '#ff4fa3', '#ff2d2d', '#7a86ff'];
const EFFECTS = [
    ['static', 'Statica'], ['cycle', 'Ciclu culori'], ['rainbow', 'Rainbow'],
    ['breathe', 'Respiratie'], ['strobe', 'Strobe'], ['wave', 'Wave (zone)'], ['mode', 'Urmeaza modul'],
];

/** hue 0..4095 -> #rrggbb (full saturation/value), for the rainbow/wave preview. */
function hueColour(h) {
    const x = (h / 4096) * 6, c = 255, i = Math.floor(x) % 6, f = x - Math.floor(x);
    const q = Math.round(255 * (1 - f)), tt = Math.round(255 * f);
    const r = [c, q, 0, 0, tt, c][i], g = [tt, c, c, q, 0, 0][i], b = [0, 0, tt, c, c, q][i];
    const hex = (n) => n.toString(16).padStart(2, '0');
    return '#' + hex(r) + hex(g) + hex(b);
}

async function background(bg) {
    const ambient = new Ambient({ settings: bg.settings, signals: bg.signals, log: bg.log });
    bg.settings.onChange(() => ambient.onSettingChange());
    await ambient.start();
    return ambient;
}

mgu.run({
    background,
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const ambient = ctx.background || await background(ctx);

        ui.onClick('BTN_ONOFF', () => { settings.set('on', settings.get('on') === false); return render(); });

        /** The colour the preview should show for a frame, in the chosen engine mode. */
        function previewColour(f, mode) {
            if (!f) return null;
            if (mode === 'full' && f.hue != null) return hueColour(f.hue);
            if (f.slot != null) return SWATCH[(f.slot - 1) % 12];
            if (f.zones) { const z = f.zones.find((x) => x != null); return z != null ? hueColour(z) : null; }
            return null;
        }

        function drawEffects(cv, t) {
            G.panel(cv, t, 24, 44, 520, 468, 'Efect');
            const cur = settings.get('effect') || 'static', on = settings.get('on') !== false, full = settings.get('engine') === 'full';
            EFFECTS.forEach(([id, name], i) => {
                const y = 96 + i * 50;
                const runnable = full || EFX.isSafe(id) || id === 'mode';
                const label = name + (runnable ? '' : '  (mod Complet)');
                G.button(cv, t, 48, y, 472, 42, label, () => { ambient.setEffect(id); return render(); },
                    { primary: id === cur, busy: !runnable, key: 'fx-' + id });
            });
            const y = 96 + EFFECTS.length * 50 + 6;
            G.button(cv, t, 48, y, 472, 48, on ? 'PORNIT' : 'OPRIT', () => { settings.set('on', !on); return render(); },
                { primary: on, color: on ? '#2fd27a' : t.crit, key: 'onoff' });
        }

        function drawPreview(cv, t) {
            G.panel(cv, t, 564, 44, 1012, 468, null);
            const name = settings.get('effect') || 'static', on = settings.get('on') !== false;
            const mode = settings.get('engine') === 'full' ? 'full' : 'safe';
            const nm = (EFFECTS.find((e) => e[0] === name) || [, name])[1];
            cv.text('PREVIEW', 596, 92, 22, t.dim, { font: 'bold', spacing: 2 });
            cv.text(nm, 596, 140, 40, on ? t.text : t.dim, { font: 'bold' });

            // the cabin strip: a rounded bar lit by the current frame (two zones for 'wave')
            const bx = 596, by = 180, bw = 952, bh = 120;
            const tnow = Date.now();
            let f = null;
            if (name === 'mode') f = { slot: ambient.slot() || 4 };
            else { f = EFX.frame(name, tnow, cfg()); if (mode === 'safe') { f.hue = null; f.bright = null; f.zones = null; } }
            const lit = on && (mode === 'full' || EFX.isSafe(name) || name === 'mode');
            if (f && f.zones && mode === 'full') {
                const n = f.zones.filter((x) => x != null).length || 3;
                for (let z = 0; z < n; z++) {
                    const col = hueColour(f.zones[z]); const seg = bw / n;
                    cv.roundRect(bx + z * seg + 4, by, seg - 8, bh, 16, withAlpha(col, lit ? 0.9 : 0.15));
                }
            } else {
                const col = previewColour(f, mode) || '#444a56';
                const k = (mode === 'full' && f && f.bright != null) ? Math.max(0.12, f.bright / 254) : 0.9;
                cv.roundRect(bx, by, bw, bh, 18, withAlpha(col, lit ? k : 0.12));
            }
            cv.strokeRoundRect(bx, by, bw, bh, 18, 2, withAlpha('#ffffff', 0.12));

            // state line
            let state;
            if (!on) state = 'Oprit';
            else if (!lit) state = 'Acest efect are nevoie de modul Complet';
            else if (!ambient.available) state = 'Masina nu raspunde la lumina ambientala';
            else if (ambient.error) state = 'Eroare la scriere: ' + ambient.error;
            else state = 'Activ · scrie la masina';
            const col = (!on || !lit) ? t.dim : (!ambient.available || ambient.error) ? t.warn : '#2fd27a';
            cv.roundRect(bx, 328, bw, 44, 10, withAlpha(col, 0.16));
            cv.text(state, bx + 16, 356, 24, col, { font: 'bold' });

            // swatches
            cv.text('PALETA BMW (ilustrativ)', bx, 410, 20, t.dim, { font: 'bold', spacing: 1.5 });
            for (let i = 0; i < 12; i++) {
                const x = bx + i * 54;
                cv.roundRect(x, 426, 44, 40, 8, SWATCH[i]);
                cv.text(String(i + 1), x + 22, 494, 20, t.dim, { align: 'center' });
            }
        }

        function cfg() {
            const pal = String(settings.get('palette') || '').split(',').map(Number).filter((n) => n >= 1 && n <= 12);
            return {
                periodMs: Math.max(400, (Number(settings.get('speed')) || 4) * 1000),
                slot: Number(settings.get('colour')) || 1,
                palette: pal.length ? pal : null,
                brightMin: Number(settings.get('brightMin')) || 0,
                brightMax: Number(settings.get('brightMax')) != null ? Number(settings.get('brightMax')) : 254,
                duty: (Number(settings.get('duty')) || 50) / 100,
                zones: Number(settings.get('zones')) || 3,
            };
        }

        function render() {
            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
            drawEffects(cv, t);
            drawPreview(cv, t);
            const warn = settings.get('engine') === 'full' ? { text: 'MOD COMPLET', color: t.warn } : null;
            G.frame(cv, t, ['Lumini NOVANEX'], 0, [warn]);
            return ui.image('MAIN_GFX', cv);
        }

        ambient.on('change', () => render().catch((e) => log.warn('render: ' + e)));
        settings.onChange(() => render().catch(() => {}));
        // animate the preview a few times a second (the car writes at its own, slower rate)
        ctx.loop('MAIN', 6, render);
        render().then(() => log.info('first frame done')).catch((e) => log.warn('first render: ' + e));
    },
});
