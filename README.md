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

## Koncepty (tab pro rozpracované drinky)

Tab „Koncepty" slouží k zadávání nových drinků (roky → kategorie → koncept/ready
drink) přímo v appce, sdíleně pro celý tým — ne jen na jednom zařízení. Na
rozdíl od receptáře samotného to **není** statická appka: běží přes malý
Worker (`worker.js`), který obsluhuje `/api/concepts` (GET/PUT) a ukládá
jedno JSON „blob" do Cloudflare KV (binding `CONCEPTS` ve `wrangler.jsonc`).
Zbytek cesty jde dál přímo na statická aktiva (`env.ASSETS.fetch`) —
`assets.run_worker_first` je omezené jen na `/api/*`, takže appka samotná
zůstává stejně rychlá jako dřív.

Data v Koncepty se do Google Sheetu dostanou dvěma způsoby:
- tlačítko „Export CSV (Ready)" vyexportuje hotové (Ready) drinky ve stejném
  sloupcovém formátu jako `csv/signatures.csv`, pro ruční vložení;
- tlačítko „Nahrát do Sheetu" je zapíše rovnou, bez kopírování.

Přímý zápis jde přes Google Sheets API v4, autentizovaný jako service
account (`worker.js`, funkce `getGoogleAccessToken`/`appendToSheet` — JWT
bearer flow přes Web Crypto, žádná knihovna navíc). Zkoušeli jsme nejdřív
Apps Script Web App (jednodušší na papíře), ale nový/osobní Google účet už
nenabízí plně anonymní „Kdokoli" přístup k Web Apps — jen „Jen já" nebo
„Kdokoli s účtem Google", což bez interaktivního přihlášení Worker nezvládne.
Service account tohle obchází úplně.

Nastavení (jednorázově):
1. V [Google Cloud Console](https://console.cloud.google.com/) založ/vyber
   projekt, zapni **Google Sheets API** (APIs & Services → Library).
2. IAM & Admin → Service Accounts → **Create service account** → bez rolí
   (sheet se nasdílí zvlášť) → Keys → **Add key → JSON** → stáhne se soubor.
3. V Google Sheetu (Signatures) klikni **Share** a nasdílej **Editor**
   přístup na `client_email` z toho JSON souboru (vypadá jako
   `neco@projekt.iam.gserviceaccount.com`).
4. `cat cesta/ke/klici.json | npx wrangler secret put GOOGLE_SA_KEY_JSON`
   — nahraje se celý soubor jako jeden secret, appka si z něj sama vezme
   `client_email` a `private_key`. Klíč nikam jinam needit.

Sheet ID a rozsah (`Signatures!A:K`) jsou napevno v `worker.js`, takže appka
nemůže zapisovat jinam. Dokud `GOOGLE_SA_KEY_JSON` není nastavený, tlačítko
vrátí srozumitelnou chybu místo pádu.

`npx wrangler dev` běží i s KV binding v lokálním (simulovaném) režimu —
nešahá na ostrou KV namespace, takže testování nic neutrácí ani neovlivňuje
produkční data.

## Lokální vývoj

Bez `npm install`, bez buildu:

```sh
npx wrangler dev
```

Testuje se úplně lokálně, žádné Cloudflare kredity se neutrácí.

## Nasazení

Denní sync (`.github/workflows/sync-sheets.yml`) appku i sám nasazuje po
každém běhu (`cloudflare/wrangler-action`, secrets `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID` v repu) — commitne i bez toho se nic nestane.

**Cloudflare Workers Builds (git-integrace, auto-deploy přímo z Cloudflare
dashboardu) je záměrně vypnutá** — při pushi nepřenáší secrets nastavené přes
`wrangler secret put` a jednou nám smazala `GOOGLE_SA_KEY_JSON`. Nezapínat
zpátky bez vyřešení týhle věci.

Pro okamžité nasazení (bez čekání na denní cron, nebo pro změny mimo data,
jako `worker.js`/`app.js`):

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
