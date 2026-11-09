# Presiune Roti — aplicație iDrive 7 (MGU) pentru presiunea și temperatura în roți

Citește presiunea și temperatura fiecărei roți din senzorii mașinii (RDC/TPMS). Îți spune, la fiecare roată, cât să umfli sau cât să scoți. Valoarea e **corectată după cât de calde sunt anvelopele în acel moment**.

## Ce face

- **Patru roți pe ecran**, fiecare cu presiunea, temperatura și acțiunea: `OK`, `UMFLA +0.2`, `SCOATE -0.1` sau `PREA MICA` (peste 0,3 bar sub țintă la rece, posibil o pană lentă).
- **Anvelope reci sau calde.** Dacă cea mai caldă roată are peste 5 °C (reglabil) mai mult decât temperatura de afară, anvelopele sunt calde. Aplicația arată în câte minute se răcesc. Cât timp mașina stă, viteza de răcire se măsoară; până atunci folosește o estimare.
- **„Țintă acum".** Aerul cald are presiune mai mare. O roată umflată corect, după 20 de minute de mers, arată cu ~0,25 bar mai mult. Dacă la benzinărie umfli la valoarea „la rece", rămâi cu roțile moi după ce se răcesc. Aplicația calculează (legea gazelor) cât trebuie să arate fiecare roată **acum**, ca să ajungă exact la valoarea recomandată când se răcește.
- **Set de vară sau de iarnă.** Butonul „Schimbă vară / iarnă" comută setul, iar la Setări alegi dimensiunea pentru fiecare set.
- **Regula de 7 °C.** Sub 7 °C, cu setul de vară montat, îți amintește de anvelopele de iarnă.

## De unde vine presiunea recomandată (Setări → „Presiunea recomandată din")

1. **Mașina, altfel tabel (implicit, recomandat).** Folosește ținta pe care o trimite mașina, adică anvelopele selectate în iDrive la monitorizarea presiunii (Mașina mea → Starea vehiculului → Presiune anvelope → Anvelope). E valoarea oficială BMW pentru mașina ta, inclusiv pentru iarnă. Dacă mașina nu trimite ținta, se folosește tabelul.
2. **Tabel (site presiuni).** Valori luate de pe un site de presiuni cu `tools/novanex_tyres/fetch_pressures.py`.
3. **Valori introduse de mine.** Le setezi la Setări, separat pentru vară și iarnă, față și spate.

> Tabelul inclus vine de pe tirepressure.com (BMW 330i 2021) și are **valori pentru piața SUA**. La o mașină europeană pot diferi de eticheta de pe stâlpul ușii. Dacă ținta mașinii diferă de tabel, aplicația afișează un avertisment.

### Actualizezi tabelul pentru mașina ta

```bash
# de pe site (pagina modelului/anului tău)
python3 tools/novanex_tyres/fetch_pressures.py https://tirepressure.com/2021-bmw-330i-tire-pressure

# sau valorile de pe eticheta ușii (recomandat pentru mașini EU)
python3 tools/novanex_tyres/fetch_pressures.py --csv eticheta.csv --car "BMW 330i G20"
```

`eticheta.csv` (presiuni la rece, în bar):

```
label,front,rear,front_bar,rear_bar
225/45 R18,225/45R18,225/45R18,2.4,2.6
225/40 R19 + 255/35 R19,225/40R19,255/35R19,2.5,2.8
```

Scriptul scrie `pressures.js` și actualizează lista de dimensiuni din Setări. Site-ul se citește o singură dată, la build, deci mașina nu are nevoie de internet. Scriptul respectă `robots.txt` al site-ului. După rulare, mărește `version` în `app.json`.

## Cum o pui în Store

1. În mașină: Store → Settings → **Add source** → `techechanter/idrive7-apps-novanex` → branch `main`.
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
