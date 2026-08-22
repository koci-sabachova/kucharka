# Cobra Kuchařka

Receptář koktejlů pro barmanský tým Cobra Bar. Statický web na Cloudflare
Workers, data tažená denně z Google Sheets.

Live: https://cobra-kucharka.koci-sabachova.workers.dev

## Jak to celé drží pohromadě

```
Google Sheet (GID_SIGNATURES / GID_OLD_SIGNATURES / GID_WORLD_CLASSICS)
     │  denně 5:00 UTC, GitHub Action stahuje CSV export po gid
     ▼
csv/*.csv
     │  node parse_csv.js
     ▼
data/recipes.json  ← appka čte přímo, žádný backend
     │
     ▼
index.html + app.js + style.css  (vanilla JS, žádný build krok)
```

`data/lahve_db.json` (databáze lahví) se do tohohle syncu nepočítá —
udržuje se zvlášť/ručně.

## Lokální vývoj

Bez `npm install`, bez buildu:

```sh
npx wrangler dev
```

Testuje se úplně lokálně, žádné Cloudflare kredity se neutrácí.

## Nasazení

```sh
npx wrangler deploy
```

## Bezpečnostní poznámka k `.assetsignore`

`wrangler` bez `.assetsignore` nahraje jako veřejná statická aktiva úplně
všechno ve zdrojovém adresáři — včetně `.git` (celá historie repa) a
`.wrangler` (lokální cache). Tenhle web na to doplatil (`/.git/config`
bylo veřejně čitelné, opraveno commitem, který přidal `.assetsignore`).
Soubor v rootu teď vylučuje `.git`, `.wrangler` a `.claude` — nemazat.

## Příbuzný projekt

[Drinkový sborník](https://github.com/koci-sabachova/drinkovy-sbornik) —
stejná architektura, fork pro bar Přítomnost.
