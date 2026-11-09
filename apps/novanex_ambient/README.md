# Lumini NOVANEX — efecte pentru lumina ambientală (iDrive 7 / MGU)

Efecte pentru lumina ambientală a mașinii, pornind de la aplicația standard „Ambient config”, dar cu animații: statică, ciclu de culori, rainbow, respirație, strobe, wave și „urmează modul de condus”.

Rulează din fundal (pornește odată cu unitatea), deci efectul merge și cu aplicația închisă.

## Întâi, ce poate și ce nu poate hardware-ul

Lumina ambientală de pe G20 **nu e adresabilă pe fiecare LED**, ca o tastatură RGB. Are o paletă fixă de culori (sloturile 1–12 din meniul BMW) și, în modul „Individual”, câteva **zone** (bord și uși). De aici:

- **Nu există un „wave” real** care curge LED cu LED. Cel mai apropiat e alternarea a 2–3 zone defazate (`Wave`), și doar dacă mașina e pe modul Individual.
- Efectele sunt **pe timp**, pentru tot habitaclul: se schimbă culoarea și/sau luminozitatea în timp (respirație, ciclu, rainbow).

## Cele două moduri ale motorului

Singurul lucru garantat pe G20 (dovedit de aplicația standard) e **schimbarea culorii pe sloturi**. Restul câmpurilor (nuanță fină, luminozitate, zone) nu sunt încă verificate pe mașină. De aceea aplicația are două moduri:

| Mod | Ce scrie | Efecte disponibile |
|---|---|---|
| **Sigur** (implicit) | doar sloturile paletei BMW | Statică, Ciclu culori, Rainbow (ca parcurgere a paletei), Urmează modul |
| **Complet** (experimental) | și nuanța, luminozitatea și zonele | toate, inclusiv Respirație, Strobe, Wave, Rainbow lin |

În modul Sigur, efectele care au nevoie de luminozitate/nuanță apar gri, cu „(mod Complet)”. Nimic neverificat nu se scrie la mașină.

**Testează modul Complet cu mașina oprită**, prima dată. Dacă respirația/strobe nu fac nimic sau se comportă ciudat, mașina ta nu acceptă acele câmpuri — rămâi pe Sigur. Nu riști nimic permanent: efectul doar trimite culori, exact ca meniul BMW; se oprește din butonul **Pornit/Oprit** sau ștergând aplicația.

## Efecte

- **Statică** — o culoare fixă din paletă.
- **Ciclu culori** — parcurge culorile alese (ex. `1,4,7`) sau toate 12. Garantat pe orice mașină.
- **Rainbow** — parcurge spectrul. În modul Sigur merge prin paletă; în Complet, nuanță lină.
- **Respirație** — o culoare care crește și scade în intensitate (mod Complet).
- **Strobe** — clipește; `cat sta aprins` reglează raportul (mod Complet).
- **Wave (zone)** — 2–3 zone defazate (mod Complet, mașina pe Individual).
- **Urmează modul de condus** — culoare pe mod (Sport, Comfort, Eco Pro, Adaptive), ca aplicația standard.

**Durata unui ciclu** reglează viteza. **Scrie cel mult o dată la** limitează cât de des se trimite la mașină.

## Important: viteza de scriere

Lumina ambientală e o funcție de confort, nu un ecran. Scrisul prea des **încarcă magistrala de confort** a mașinii. De aceea există o limită fixă (cel puțin 250 ms între scrieri) și una reglabilă peste ea (implicit 400 ms). Lasă valorile mari dacă nu ești sigur. Efectele lin, foarte rapide, solicită magistrala și sunt neverificate.

## Instalare în mașină

1. Store → Settings → **Add source** → `techechanter/idrive7-apps-novanex` → branch `main`.
2. Instalează „Lumini NOVANEX”. Alegi efectul, apeși **Pornit**.

## Teste și previzualizare (pe PC, fără mașină)

```bash
node tools/novanex_ambient/test_effects.js     # motorul de efecte: 16 teste
node tools/novanex_ambient/test_ambient.js      # logica de scriere: 8 teste
# previzualizare aproximativa a ecranului (fonturi diferite de cele din masina):
node tools/novanex_ambient/layout_preview.js 1500 ops.json effect=rainbow engine=full
python3 tools/novanex_ambient/draw_ops.py ops.json ecran.png
```

## Limitări

- **Netestată încă pe o mașină reală.** Partea de sloturi folosește exact mesajul pe care îl scrie aplicația standard „Ambient config”, care merge. Partea de luminozitate/nuanță/zone (modul Complet) e construită după câmpurile aceluiași mesaj, dar **nu e verificată** pe G20.
- Culorile din previzualizare sunt ilustrative — culorile reale ale sloturilor depind de mașină.
- Textele nu au diacritice (fonturile kit-ului sunt ASCII).
