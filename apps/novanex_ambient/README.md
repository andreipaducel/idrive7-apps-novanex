# Lumini NOVANEX — efecte pentru lumina ambientală (iDrive 7 / MGU)

Efecte pentru lumina ambientală a mașinii, pornind de la aplicația standard „Ambient config”, dar cu animații: statică, ciclu de culori, rainbow, respirație, strobe, wave și „urmează modul de condus”.

Rulează din fundal (pornește odată cu unitatea), deci efectul merge și cu aplicația închisă.

## Întâi, ce poate și ce nu poate hardware-ul

Lumina ambientală de pe G20 **nu e adresabilă pe fiecare LED**, ca o tastatură RGB. Are o paletă fixă de culori (sloturile 1–12 din meniul BMW) și, în modul „Individual”, câteva **zone** (bord și uși). De aici:

- **Nu există un „wave” real** care curge LED cu LED. Cel mai apropiat e alternarea a 2–3 zone defazate (`Wave`), și doar dacă mașina e pe modul Individual.
- Efectele sunt **pe timp**, pentru tot habitaclul: se schimbă culoarea și/sau luminozitatea în timp (respirație, ciclu, rainbow).

## „Păstrează setarea BMW” vs „Schimbă setarea”

Asta e alegerea importantă (butonul mare din dreapta, sau Setări → „Păstrează setarea BMW”):

- **Păstrează setarea BMW** (implicit) — aplicația **nu atinge culoarea salvată în meniul BMW** (ex. portocaliu). Schimbă doar **nuanța afișată** (sau luminozitatea). Când oprești efectul, mașina rămâne pe culoarea ta. Asta e ce vrei dacă nu vrei să ți se mute setarea.
- **Schimbă setarea** — efectul mută chiar **slotul de culoare din meniul BMW** (paleta 1–12). E singura cale **dovedită** că merge pe G20, dar îți schimbă setarea salvată.

**Important, de testat:** „Păstrează setarea” scrie pe câmpul de **nuanță**, pe care ecosistemul MGU **nu l-a verificat încă pe G20** — se poate ca mașina să-l ignore și să nu se vadă nimic. Dacă pe „Păstrează setarea” nu se schimbă nimic, mașina ta nu expune controlul de nuanță live, iar singura variantă care mișcă efectiv culorile e „Schimbă setarea” (care îți mută slotul). Nu e un bug în aplicație — atât lasă mașina.

În modul „Păstrează setarea”, **Ciclu culori** și **Urmează modul** apar gri cu „(schimbă setarea)”, pentru că ele funcționează doar mutând slotul.

**Testează cu mașina oprită.** Nu riști nimic permanent: aplicația doar trimite culori, exact ca meniul BMW; se oprește din **Pornit/Oprit** sau ștergând aplicația. Respirația/Strobe modifică doar luminozitatea și păstrează culoarea.

## Efecte

- **Statică** — o culoare fixă din paletă.
- **Ciclu culori** — parcurge culorile alese (ex. `1,4,7`) sau toate 12. Garantat pe orice mașină.
- **Rainbow** — parcurge spectrul. Pe „Păstrează setarea” schimbă nuanța; pe „Schimbă setarea” parcurge paleta BMW.
- **Respirație** — culoarea crește și scade în intensitate (schimbă doar luminozitatea, păstrează culoarea).
- **Strobe** — clipește; `cat sta aprins` reglează raportul.
- **Wave (zone)** — 2–3 zone defazate (mașina pe Individual).
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
node tools/novanex_ambient/layout_preview.js 1500 ops.json effect=rainbow keepSetting=true
python3 tools/novanex_ambient/draw_ops.py ops.json ecran.png
```

## Limitări

- **Netestată încă pe o mașină reală.** Partea de sloturi folosește exact mesajul pe care îl scrie aplicația standard „Ambient config”, care merge. Partea de luminozitate/nuanță/zone (modul Complet) e construită după câmpurile aceluiași mesaj, dar **nu e verificată** pe G20.
- Culorile din previzualizare sunt ilustrative — culorile reale ale sloturilor depind de mașină.
- Textele nu au diacritice (fonturile kit-ului sunt ASCII).
