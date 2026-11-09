#!/usr/bin/env python3
"""
fetch_pressures.py - take the recommended tyre pressures for your car from a tyre-pressure site
(or from your own CSV, e.g. the values on your door pillar) and write them into the app:

  apps/novanex_tyres/pressures.js   the table the app reads
  apps/novanex_tyres/app.json       the size choices in Settings (summerSize / winterSize)

Usage:
  python3 tools/novanex_tyres/fetch_pressures.py https://tirepressure.com/2021-bmw-330i-tire-pressure
  python3 tools/novanex_tyres/fetch_pressures.py --csv my_car.csv --car "BMW 330i G20 (eticheta usa)"

CSV columns (header line required), pressures in bar, cold:
  label,front,rear,front_bar,rear_bar
  225/45 R18,225/45R18,225/45R18,2.4,2.6

The site is read once, at build time (no internet needed in the car). robots.txt is honoured.
Values on US sites are for the US market; for an EU car the car's own tyre list in iDrive (the
app's default source) or the door pillar label is the authority - use --csv for those.
"""
import argparse, csv, datetime, html, json, os, re, sys, urllib.request, urllib.robotparser
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..', '..', 'apps', 'novanex_tyres')
UA = 'PresiuneRoti-build/1.0 (+https://github.com/robertnisipeanu/mgu-store)'
PSI = 14.5038
SIZE = r'(\d{3}/\d{2}\s*Z?R\s*\d{2})'


def fetch(url):
    p = urlparse(url)
    rp = urllib.robotparser.RobotFileParser(f'{p.scheme}://{p.netloc}/robots.txt')
    try:
        rp.read()
        if not rp.can_fetch(UA, url):
            sys.exit(f'robots.txt of {p.netloc} does not allow this page; use --csv instead')
    except OSError as e:
        print(f'  (robots.txt not readable: {e}; continuing)')
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', 'replace')
    except OSError as e:
        sys.exit(f'could not read {url}: {e}')


def norm(size):
    return re.sub(r'\s+', '', size.upper()).replace('ZR', 'R')


def nice(size):
    return re.sub(r'R(\d{2})$', r' R\1', norm(size))


def parse_tirepressure(page):
    """Rows of the inflation table: size(s), front psi, rear psi. Staggered rows carry 'F:' and 'R:'."""
    sets = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', page, flags=re.S | re.I):
        text = html.unescape(re.sub(r'<[^>]+>', ' ', row))
        text = re.sub(r'\s+', ' ', text)
        sizes = re.findall(SIZE, text, flags=re.I)
        psi = re.findall(r'(\d{2}(?:\.\d)?)\s*psi', text, flags=re.I)
        if not sizes or len(psi) < 2:
            continue
        front, rear = norm(sizes[0]), norm(sizes[1] if len(sizes) > 1 else sizes[0])
        sets.append({'front': front, 'rear': rear, 'frontBar': round(float(psi[0]) / PSI, 2), 'rearBar': round(float(psi[1]) / PSI, 2)})
    return sets


def from_csv(path):
    sets = []
    with open(path, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            sets.append({'label': r['label'].strip(), 'front': norm(r['front']), 'rear': norm(r['rear']),
                         'frontBar': round(float(r['front_bar']), 2), 'rearBar': round(float(r['rear_bar']), 2)})
    return sets


def key_of(s):
    k = 's' + norm(s['front']).replace('/', '_').lower()
    return k if s['front'] == s['rear'] else k + '_' + norm(s['rear']).replace('/', '_').lower()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('url', nargs='?', help='page with the pressure table (tirepressure.com layout)')
    ap.add_argument('--csv', help='your own values instead of a site')
    ap.add_argument('--car', help='car name shown in the data (default: from the URL)')
    a = ap.parse_args()
    if not a.url and not a.csv:
        ap.error('give a URL or --csv')

    if a.csv:
        sets, source = from_csv(a.csv), 'csv:' + os.path.basename(a.csv)
    else:
        sets, source = parse_tirepressure(fetch(a.url)), a.url
    if not sets:
        sys.exit('no tyre sizes with pressures found - the page layout may have changed; use --csv')

    table = {}
    for s in sets:
        s.setdefault('label', nice(s['front']) if s['front'] == s['rear'] else nice(s['front']) + ' + ' + nice(s['rear']))
        k = key_of(s)
        if k not in table:                 # first row of a size wins (the site lists the base trim first)
            table[k] = {'label': s['label'], 'front': s['front'], 'rear': s['rear'], 'frontBar': s['frontBar'], 'rearBar': s['rearBar']}
    car = a.car or (re.sub(r'-tire-pressure$', '', urlparse(a.url).path.strip('/')).replace('-', ' ').upper() if a.url else 'my car')
    us = 'tirepressure.com' in (a.url or '')
    data = {
        'car': car, 'source': source, 'fetched': datetime.date.today().isoformat(),
        'note': ("US market placard values; the car's own tyre list (iDrive > Tyre pressure) is the authority for an EU car"
                 if us else 'cold pressures as entered'),
        'sets': table,
    }
    js = ("'use strict';\n// Generated by tools/novanex_tyres/fetch_pressures.py - do not edit by hand; run the script again instead.\n"
          "// Values are what the source lists for COLD tyres. Keys are the setting values in app.json.\n"
          'module.exports = ' + json.dumps(data, indent=2) + ';\n')
    open(os.path.join(APP, 'pressures.js'), 'w', encoding='utf-8', newline='\n').write(js)

    # the size choices in Settings follow the table
    spec_path = os.path.join(APP, 'app.json')
    spec = json.load(open(spec_path, encoding='utf-8'))
    options = [[k, v['label']] for k, v in table.items()]
    for s in spec['settings']:
        if s['key'] in ('summerSize', 'winterSize'):
            s['options'] = options
            if s.get('default') not in table:
                s['default'] = options[0][0]
    json.dump(spec, open(spec_path, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)

    print(f'{len(table)} sizes from {source}:')
    for k, v in table.items():
        print(f"  {v['label']:<28} fata {v['frontBar']:.2f}  spate {v['rearBar']:.2f} bar")
    print('wrote pressures.js and the size choices in app.json - bump "version" in app.json before publishing')


if __name__ == '__main__':
    main()
