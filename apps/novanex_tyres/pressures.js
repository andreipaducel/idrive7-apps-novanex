'use strict';
// Tyre pressures for a BMW 330i (G20), read from the car's own door-pillar placard (label 6 896 168).
// Cold pressures, bar. Two load cases: comfort (normal, up to ~3 people) and load (full, up to 5 + luggage).
// 'season' groups sizes into the app's summer / winter picker. load:null = not read from the placard for
// that size (use the car's value or Manual for full load there).
module.exports = {
  "car": "BMW 330i (G20)",
  "source": "eticheta usa (placard 6 896 168)",
  "fetched": "2026-11-10",
  "note": "valori de pe eticheta masinii, la rece",
  "sets": {
    "s225_35r20_255_30r20": {"label": "225/35 R20 + 255/30 R20", "front": "225/35R20", "rear": "255/30R20", "season": "summer", "comfort": {"F": 2.9, "R": 2.9}, "load": {"F": 3.2, "R": 3.5}},
    "s225_40r19_255_35r19": {"label": "225/40 R19 + 255/35 R19", "front": "225/40R19", "rear": "255/35R19", "season": "summer", "comfort": {"F": 2.7, "R": 2.7}, "load": {"F": 3.0, "R": 3.4}},
    "s225_40r19": {"label": "225/40 R19", "front": "225/40R19", "rear": "225/40R19", "season": "summer", "comfort": {"F": 2.7, "R": 2.7}, "load": {"F": 3.0, "R": 3.4}},
    "s225_45r18": {"label": "225/45 R18", "front": "225/45R18", "rear": "225/45R18", "season": "summer", "comfort": {"F": 2.7, "R": 2.7}, "load": {"F": 3.0, "R": 3.4}},
    "s225_45r18_255_40r18": {"label": "225/45 R18 + 255/40 R18", "front": "225/45R18", "rear": "255/40R18", "season": "summer", "comfort": {"F": 2.7, "R": 2.7}, "load": {"F": 3.0, "R": 3.4}},
    "s225_45r18_ms": {"label": "225/45 R18 M+S (iarna)", "front": "225/45R18", "rear": "225/45R18", "season": "winter", "comfort": {"F": 2.5, "R": 2.5}, "load": null},
    "s225_50r17": {"label": "225/50 R17 (iarna)", "front": "225/50R17", "rear": "225/50R17", "season": "winter", "comfort": {"F": 2.3, "R": 2.3}, "load": null}
  }
};
