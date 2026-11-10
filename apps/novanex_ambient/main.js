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

// The G20 iDrive palette, slots 1..12 (1=White..8=Red as in BimmerCode; 9..12 usually unused/white).
const SWATCH = ['#ffffff', '#c07a28', '#8a1e0c', '#1530ff', '#19e23a', '#7a3ff0', '#00b060', '#ff2424', '#d8d8d8', '#d8d8d8', '#d8d8d8', '#d8d8d8'];
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

        /** The colour the preview should show for a frame. */
        function previewColour(f) {
            if (!f) return null;
            if (f.hue != null) return hueColour(f.hue);
            if (f.slot != null) return SWATCH[(f.slot - 1) % 12];
            if (f.zones) { const z = f.zones.find((x) => x != null); return z != null ? hueColour(z) : null; }
            return SWATCH[(Number(settings.get('colour')) || 1) - 1];   // breathe/strobe keep the base colour
        }

        const keepOn = () => settings.get('keepSetting') !== false;
        const runnable = (id) => (keepOn() ? ['cycle', 'mode'].indexOf(id) < 0 : true);

        function drawEffects(cv, t) {
            G.panel(cv, t, 24, 44, 520, 468, 'Efect');
            const cur = settings.get('effect') || 'static', on = settings.get('on') !== false;
            EFFECTS.forEach(([id, name], i) => {
                const y = 96 + i * 50;
                const ok = runnable(id);
                const label = name + (ok ? '' : '  (schimba setarea)');
                G.button(cv, t, 48, y, 472, 42, label, () => { ambient.setEffect(id); return render(); },
                    { primary: id === cur, busy: !ok, key: 'fx-' + id });
            });
            const y = 96 + EFFECTS.length * 50 + 6;
            G.button(cv, t, 48, y, 472, 48, on ? 'PORNIT' : 'OPRIT', () => { settings.set('on', !on); return render(); },
                { primary: on, color: on ? '#2fd27a' : t.crit, key: 'onoff' });
        }

        function drawPreview(cv, t) {
            G.panel(cv, t, 564, 44, 1012, 468, null);
            const name = settings.get('effect') || 'static', on = settings.get('on') !== false, keep = keepOn();
            const nm = (EFFECTS.find((e) => e[0] === name) || [, name])[1];
            cv.text('PREVIEW', 596, 92, 22, t.dim, { font: 'bold', spacing: 2 });
            cv.text(nm + (keep ? '  ·  pastreaza setarea' : '  ·  schimba setarea'), 596, 140, 36, on ? t.text : t.dim, { font: 'bold' });

            // the cabin strip: a rounded bar lit by the current frame (zones for 'wave')
            const bx = 596, by = 176, bw = 952, bh = 118;
            const tnow = Date.now();
            let f = null;
            if (name === 'mode') f = keep ? null : { slot: ambient.slot() || 4, hue: null, bright: null, zones: null };
            else {
                f = EFX.frame(name, tnow, cfg());
                if (f) {
                    if (keep) { f.slot = null; if (name === 'breathe' || name === 'strobe') f.hue = null; }
                    else { f.hue = null; f.zones = null; }
                }
            }
            const ok = runnable(name), lit = on && ok && f;
            if (f && f.zones) {
                const n = f.zones.filter((x) => x != null).length || 3;
                for (let z = 0; z < n; z++) { const seg = bw / n; cv.roundRect(bx + z * seg + 4, by, seg - 8, bh, 16, withAlpha(hueColour(f.zones[z]), lit ? 0.9 : 0.15)); }
            } else {
                const col = previewColour(f) || '#444a56';
                const k = (f && f.bright != null) ? Math.max(0.12, f.bright / 254) : 0.9;
                cv.roundRect(bx, by, bw, bh, 18, withAlpha(col, lit ? k : 0.12));
            }
            cv.strokeRoundRect(bx, by, bw, bh, 18, 2, withAlpha('#ffffff', 0.12));

            // state line
            let state, col;
            if (!on) { state = 'Oprit'; col = t.dim; }
            else if (!ok) { state = 'Acest efect schimba setarea: opreste "Pastreaza setarea BMW"'; col = t.warn; }
            else if (!ambient.available) { state = 'Masina nu raspunde la lumina ambientala'; col = t.warn; }
            else if (ambient.error) { state = 'Eroare la scriere: ' + ambient.error; col = t.warn; }
            else { state = keep ? 'Activ · pastreaza setarea, schimba nuanta (experimental)' : 'Activ · schimba culoarea din setari'; col = '#2fd27a'; }
            cv.roundRect(bx, 316, bw, 44, 10, withAlpha(col, 0.16));
            cv.text(state, bx + 16, 344, 22, col, { font: 'bold' });

            // the keep/set toggle
            G.button(cv, t, bx, 378, 0, 44, keep ? 'PASTREAZA SETAREA BMW' : 'SCHIMBA SETAREA BMW',
                () => { settings.set('keepSetting', !keep); return render(); }, { primary: keep, key: 'keep' });

            // swatches
            cv.text('PALETA BMW (ilustrativ)', bx, 450, 18, t.dim, { font: 'bold', spacing: 1.5 });
            for (let i = 0; i < 12; i++) { const x = bx + i * 54; cv.roundRect(x, 462, 44, 34, 8, SWATCH[i]); cv.text(String(i + 1), x + 22, 510, 18, t.dim, { align: 'center' }); }
        }

        function cfg() {
            const pal = String(settings.get('palette') || '').split(',').map(Number).filter((n) => n >= 1 && n <= 12);
            const colour = Number(settings.get('colour')) || 1;
            const sec = Number(settings.get('speed')) || 3;
            return {
                periodMs: Math.max(400, sec * 1000),
                stepMs: Math.max(250, sec * 1000),
                fade: settings.get('fade') !== false,
                slot: colour,
                hue: Math.round(((colour - 1) / 12) * 4095),
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
            const badge = keepOn() ? { text: 'PASTREAZA SETAREA', color: t.accent } : { text: 'SCHIMBA SETAREA', color: t.warn };
            G.frame(cv, t, ['Lumini NOVANEX'], 0, [badge]);
            return ui.image('MAIN_GFX', cv);
        }

        ambient.on('change', () => render().catch((e) => log.warn('render: ' + e)));
        settings.onChange(() => render().catch(() => {}));
        // animate the preview a few times a second (the car writes at its own, slower rate)
        ctx.loop('MAIN', 6, render);
        render().then(() => log.info('first frame done')).catch((e) => log.warn('first render: ' + e));
    },
});
