# Cobra Kuchařka

Receptář koktejlů pro barmanský tým Cobra Bar. Statický web, žádný framework,
žádný build krok pro appku samotnou (jen `parse_csv.js` pro data-sync).
**`README.md` v repu je aktuální a podrobný pro data pipeline / lokální vývoj / deploy — čti ho, tohle je jen doplněk.**

Obecné preference k mému stylu práce jsou v `~/.claude/CLAUDE.md` — platí i tady.

## Hosting — POZOR, oprava proti staré paměti

Běží na **Cloudflare Workers** (ne Pages) přes `assets` binding v `wrangler.jsonc`
(`assets.directory = "."`). Live: https://cobra-kucharka.koci-sabachova.workers.dev
- Lokálně: `npx wrangler dev` — bez `npm install`, bez buildu, netratí Cloudflare kredity.
- Deploy: `npx wrangler deploy`.

## Data pipeline

```
Google Sheet (gidy pro Signatures / Old Signatures / World Classics)
  → denně 5:00 UTC GitHub Action (.github/workflows/sync-sheets.yml) stáhne CSV
  → csv/*.csv → node parse_csv.js → data/recipes.json
  → index.html + app.js + style.css čtou recipes.json přímo, bez backendu
```
Sloupec "Kategorie" v Sheets přebíjí default kategorii tabu → umožňuje ad-hoc
kategorie (např. "Akce vánoce") bez zásahu do kódu. Detail Sheet ID/gids: viz
paměť `[[reference-cobra-kucharka-sheets]]`.

`data/lahve_db.json` (databáze lahví) je mimo tenhle sync — udržuje se ručně/zvlášť.

## ⚠️ Bezpečnostní gotcha — `.assetsignore`

Wrangler bez `.assetsignore` nahraje jako veřejná statická aktiva **všechno** ve
zdrojovém adresáři včetně `.git` (celá historie repa byla dřív veřejně čitelná
přes `/.git/config`) a `.wrangler` (lokální cache). Opraveno, `.assetsignore`
v rootu teď vylučuje `.git`, `.wrangler`, `.claude` — **nemazat ani nezužovat**
bez rozmyslu; je to jediná bariéra.

## Pravidla pro práci

- Nepřidávat build framework — zero-build je záměrná featura, ne dluh.
- Nová kategorie receptů = nikdy hardcoded v kódu. Appka generuje taby z dat,
  `parse_csv.js` čte kategorii ze sloupce v Sheets.
- Push přes SSH — HTTPS PAT bez `workflow` scope nepushne `.github/workflows/*`.
- Hostingový limit/kredity: pokud padne hlášení o vyčerpání (i po přechodu na
  Workers), přepnout do local-only módu — viz globální CLAUDE.md, `wrangler dev`
  nic neúčtuje, `wrangler deploy` ano.

## Příbuzný projekt

[Drinkový sborník](https://github.com/koci-sabachova/drinkovy-sbornik) — stejná
architektura, fork pro bar Přítomnost. Když měníš něco obecného (parser, gate
logika, sync workflow), zvaž, jestli se stejná oprava nehodí i tam.
