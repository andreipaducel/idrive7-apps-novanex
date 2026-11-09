'use strict';
/**
 * Demo data for Presiune Roti (preview on a PC, or a car that sends no TPMS data):
 * a car just parked after a drive on a 9 C day. The tyres cool from ~40 C towards the air;
 * the pressures follow the gas law from their cold values (front left a bit soft, rear right
 * a bit hard), so the advice changes from "warm" to "cold - adjust now" over the replay.
 * Time runs 30x faster so the whole cool-down passes in about 2 minutes.
 */
const A = require('./advisor');

const AMBIENT = 9, SPEED_UP = 30, TAU_MIN = 22;
const COLD = { FL: 2.2, FR: 2.4, RL: 2.7, RR: 2.9 };          // bar, at 9 C
const START = { FL: 41, FR: 40, RL: 37, RR: 38 };              // C, right after parking
const TARGET = { FL: 2.4, FR: 2.4, RL: 2.7, RR: 2.7 };         // the car's own target (cold)

class Demo {
    constructor() { this.t0 = Date.now(); }
    /** Same shape as the live data in main.js. */
    sample() {
        const min = ((Date.now() - this.t0) / 60000 * SPEED_UP) % 90;       // loops every 3 min
        // clock: the simulated time (ms), for the cool-down rate (main.js measures on it)
        const d = { demo: true, speed: 0, ambient: AMBIENT, clock: min * 60000 };
        for (const k of Object.keys(COLD)) {
            const tc = AMBIENT + (START[k] - AMBIENT) * Math.exp(-min / TAU_MIN);
            d['t' + k] = Math.round(tc);
            // the TPMS reports 0.1 bar steps
            d['p' + k] = Math.round(A.atTemperature(COLD[k], AMBIENT, tc) * 10) / 10;
            d['pt' + k] = TARGET[k];
        }
        return d;
    }
}
module.exports = Demo;
