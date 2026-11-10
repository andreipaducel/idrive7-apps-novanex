# Presiune Roti — aplicație iDrive 7 (MGU) pentru presiunea și temperatura în roți (BMW G20)

Citește presiunea și temperatura fiecărei roți din senzorii mașinii (RDC/TPMS). Îți spune, la fiecare roată, cât să umfli sau cât să scoți. Valoarea e **corectată după cât de calde sunt anvelopele în acel moment**.

> Aplicația e pentru **BMW Seria 3 G20**. Dimensiunile și valorile din tabel sunt luate de pe eticheta de pe stâlpul ușii (placard BMW), la rece.

## Ce face

- **Patru roți pe ecran**, fiecare cu presiunea, temperatura și acțiunea: `OK`, `UMFLA +0.2`, `SCOATE -0.1` sau `PREA MICA` (peste 0,3 bar sub țintă la rece, posibil o pană lentă).
- **Anvelope reci sau calde.** Dacă cea mai caldă roată are peste 5 °C (reglabil) mai mult decât temperatura de afară, anvelopele sunt calde. Aplicația arată în câte minute se răcesc. Cât timp mașina stă, viteza de răcire se măsoară; până atunci folosește o estimare.
- **„Țintă acum".** Aerul cald are presiune mai mare. O roată umflată corect, după 20 de minute de mers, arată cu ~0,25 bar mai mult. Dacă la benzinărie umfli la valoarea „la rece", rămâi cu roțile moi după ce se răcesc. Aplicația calculează (legea gazelor) cât trebuie să arate fiecare roată **acum**, ca să ajungă exact la valoarea recomandată când se răcește.
- **Set de vară sau de iarnă.** Butonul „Schimbă vară / iarnă" comută setul, iar la Setări alegi dimensiunea pentru fiecare set.
- **Confort / Sarcină plină.** La Setări → „Încărcare" alegi între presiunea de confort (normal, până la ~3 persoane) și cea de sarcină plină (5 persoane + bagaje), ca pe etichetă.
- **Regula de 7 °C.** Sub 7 °C, cu setul de vară montat, îți amintește de anvelopele de iarnă.

## De unde vine presiunea recomandată (Setări → „Presiunea recomandată din")

1. **Mașina, altfel eticheta (implicit, recomandat).** Folosește ținta pe care o trimite mașina, adică anvelopele selectate în iDrive la monitorizarea presiunii (Mașina mea → Starea vehiculului → Presiune anvelope → Anvelope). E valoarea oficială BMW pentru mașina ta. Dacă mașina nu trimite ținta, se folosește tabelul de pe etichetă.
2. **Eticheta mașinii (tabel).** Valorile de pe placardul G20 (`pressures.js`), pe dimensiune, confort/plin, vară/iarnă. Dimensiunile incluse: 20" `225/35 R20 + 255/30 R20`, 19"/18" vară, și 17"/18" M+S iarnă.
3. **Valori introduse de mine.** Le setezi la Setări, separat pentru vară și iarnă, față și spate — pentru orice dimensiune, fără listă.

## Ce NU poate aplicația (sincer)

- **Nu poate face reset la TPMS/RDC** și **nu poate scrie presiunea-țintă în mașină.** Pe MGU, interfața TPMS e doar-citire; nu există o metodă de reset sau de setare a țintei expusă aplicațiilor. Resetul RDC se face din meniul iDrive (Starea vehiculului → Presiune anvelope → Reset), după ce ai umflat la valorile de aici. Singura cale posibilă dintr-o aplicație ar fi o rutină de diagnostic (ca „Engine Config" pentru clapeta de evacuare), neverificată încă — de confirmat pe banc înainte de a o folosi pe mașină.

### Tabelul

Tabelul (`apps/novanex_tyres/pressures.js`) e scris de mână după eticheta G20. Fiecare dimensiune are `comfort` și `load` (plin), față/spate, și `season` (vară/iarnă). Ca să adaugi o dimensiune, adaugi o intrare în `pressures.js` și o opțiune în `summerSize`/`winterSize` din `app.json`, apoi urci `version`. (Scriptul vechi `fetch_pressures.py` era pentru tabele de pe site, format diferit — nu-l folosi peste `pressures.js` actual.)

## Cum o pui în Store

1. În mașină: Store → Settings → **Add source** → `andreipaducel/idrive7-apps-novanex` → branch `main`.
2. „Presiune Roti" apare în Store. Apeși Install, iar unitatea o compilează singură.

Aplicația e făcută pe kit-ul din [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps). Ca să apară la toată lumea, poți trimite un Pull Request cu `apps/novanex_tyres/` și `tools/novanex_tyres/` către repo-ul acela, care e sursă implicită în Store.

## Teste și previzualizare (pe PC, fără mașină)

```bash
node tools/novanex_tyres/test_advisor.js          # logica de presiuni: 16 teste
# previzualizare aproximativă a ecranului (fonturi diferite de cele din mașină):
node tools/novanex_tyres/layout_preview.js 0 ops.json && python3 tools/novanex_tyres/draw_ops.py ops.json ecran.png
# previzualizare exactă, cu kit-ul (în fork):
python3 kit/tools/build.py --preview-only novanex_tyres && node kit/tools/preview.js dist/novanex_tyres preview wait=8
```

Pe PC sau într-o mașină fără date, aplicația rulează o demonstrație: o mașină abia parcată, cu roțile care se răcesc de la ~40 °C la 9 °C.

## Limitări

- **Netestată încă pe o mașină reală.** Semnalele TPMS și scalarea lor sunt cele pe care le folosește deja aplicația M Vitals din același kit, care e testată pe mașini. Prima rulare la tine e testul real. Dacă ceva arată ciudat, logul e în `data/novanex_tyres.log` al aplicației.
- Senzorii raportează în pași de 0,1 bar, deci aplicația nu poate fi mai precisă de atât.
- Cifrele de pe ecran sunt ajutătoare. Valoarea oficială rămâne cea din manual / de pe eticheta ușii.
- Textele nu au diacritice, fiindcă fonturile kit-ului au doar caractere ASCII.
