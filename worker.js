// Minimal API for the "Koncepty" tab — shared draft-recipe storage across
// the team (KV, not per-device localStorage, so everyone sees the same
// years/categories/drinks). Static assets (the kuchařka itself) are
// untouched; only /api/* reaches this Worker (see wrangler.jsonc run_worker_first).
const KV_KEY = 'concepts:v1';
const EMPTY = { years: [] };
const SHEET_ID = '1faFus0esZ82J6PjbzuEcImDIqqxkz6GF8vApY2zNsd4';
// The tab Title gets renamed every season (e.g. "Signatures jaro léto 26"),
// but its gid never changes — that's the actual tab the daily sync job reads
// (.github/workflows/sync-sheets.yml, GID_SIGNATURES), i.e. the one that's
// actually live in the app. Resolve the current title by gid at push time
// instead of hardcoding a title string that goes stale on the next rename.
const LIVE_SHEET_GID = 248177041;
const OLD_SHEET_GID = 1744802255; // "OLD signatures" tab (GID_OLD_SIGNATURES in the sync workflow)
const SHEET_COLS = 11; // A..K, matches csv/signatures.csv column count
const OLD_SHEET_COLS = 7; // A..G: '', Název, Složení, Postup, Sklo, Garnýž, Autor — different order/columns than Signatures

// One-off 1.11.2026 swap: retire the current "SIGNATURES AKTUAL" rows and
// replace them with the 10YO podzim/zima menu. Kept as a single dedicated
// endpoint (not a generic "delete rows matching X" API) so the scheduled
// cloud agent's job on the day is one plain POST, nothing it has to compose
// itself — see memory project_10yo_signature_switch.md for the backstory.
const OLD_SIGNATURE_TAGS = ['SIGNATURES AKTUAL', 'nealko, SIGNATURES AKTUAL'];
const NEW_SIGNATURE_ROWS = [["", "The Pho?!", "Vysoká Nick'n'Nora + miska na pho", "Stir", "5 cl Seven Vodka, 1 cl Bitter Truth Pimento, 3 kapky umami bitters, 80 ml pho vývar (podává se vedle)", "Smažené rýžové nudle, chilli-lime gel, koriandrový olej", "Autor: Honza (2016)", "", "SIGNATURES AKTUAL", "", ""], ["", "More fashion than passion", "Velká cupeta", "Shake and strain on ice", "2 cl Pisco Demonio, 2 cl Amaro Montenegro, 2 cl MUYU Chinotto Nero, 3 cl džus z marakuji, 2 cl citronová šťáva, 2 cl Vegg white", "Marakujová laskonka (meringue) s proseccem, marakujový gel, sušená růže", "Autor: Veronika (2017). Alergeny: vejce (laskonka)", "", "SIGNATURES AKTUAL", "", ""], ["", "Bloody řepa", "Úzký long", "Rolling", "3 cl Mezcal San Cosme, 1 cl Apollo Nova, 2 dash celery bitters, 8 cl rajčatová voda, chilli sůl na okraj", "Chilli sůl", "Autor: Miki (2018). Příprava s vermuty: 100 ml Cinzano 1757, 100 ml Noilly Prat Original Dry, 15 g sušených meruněk. Zavakuovat na 24 h v teplé místnosti, poté přefiltrovat.", "", "SIGNATURES AKTUAL", "", ""], ["", "Roman Holiday", "Broušený long", "Shake, double strain, dolít proseccem, top espuma", "2 cl Kafka Pink Gin, 2 cl Artspritz, 8 cl Prosecco Riondo, 1 cl sirup z kustovnice čínské (goji), 1 cl limeta super juice, 4 cl Stará Dáma brusinkový mošt, top bazalková espuma", "Bazalka", "Autor: Tom (2019)", "", "SIGNATURES AKTUAL", "", ""], ["", "Hot Figs", "Čajový šálek", "Build", "3 cl Johnnie Walker Black Label, 100 ml fíkový čaj s galangalem a sečuánským pepřem, melasa bitters (v tabulce s otazníkem)", "—", "Autor: Honza (2020)", "", "SIGNATURES AKTUAL", "", ""], ["", "Bubbles of Chamomile", "Highball", "Build", "3 cl Laird's Applejack 86, 2 cl kořeněný jablečný cordial, 100 ml heřmánková soda", "Kandovaný zázvor", "Autor: Honza (2021)", "", "SIGNATURES AKTUAL", "", ""], ["", "Blackquiri", "Claret glass", "Shake, double strain", "5 cl Flor de Caña 4 y.o., 4 cl kořeněný ostružinový cordial, 2 dash orange bitters", "Prach na skle z uzené soli a lyofilizovaných ostružin", "Autor: Ondra (2022). Ostružinový cordial: ostružiny (Ponthier pyré), tymián, fenykl, bílý pepř, semínka koriandru, hřebíček, limetové kůry. Alergeny: sójové boby (sója) a výrobky z nich", "", "SIGNATURES AKTUAL", "", ""], ["", "Green? Deal!", "Broušená whiskovka", "Hard shake, double strain, navrstvit pěnu", "4 cl Garage 22 Kiwi Gin (kiwi řapík), 2 cl kiwi-estragonový cordial, 1,5 cl Landcraft #Circular Orange, matcha pěna", "Matcha pěna", "Autor: Honza (2023)", "", "SIGNATURES AKTUAL", "", ""], ["", "Graveyard of Domino's", "Čtyřhranná whiskovka", "Hard shake, double strain, nastrouhat tonku", "4 cl Tres Alegres Compadres Blanco, 3 cl kořeněný mrkvový cordial, 2 cl Vegg white, agáve", "Nastrouhaná tonka", "Autor: Ondra (2024). Mrkvový cordial: mrkev, galangal, kafrový list, skořice, kurkuma.", "", "SIGNATURES AKTUAL", "", ""], ["", "Blind Cobra", "Hliněný hrnek, podšálek, doily s razítkem Blind Cobra", "Shake and pour on ice block", "3 cl Bulleit Bourbon, 2 cl broskvový likér Juliette, 1 cl Fernet Branca Menta, 1 cl lemon acid (citrónová kyselina), 2 dash peach bitters", "Pralinka z hořké čokolády s broskvovo-mátovou náplní", "Autor: Veronika (2025)", "", "SIGNATURES AKTUAL", "", ""], ["", "Bubbles of Chamomile N/A", "Highball", "Build", "2 cl Sober Spirit W, 3 cl kořeněný jablečný cordial, 100 ml heřmánková soda", "Kandovaný zázvor", "Nealko verze – Autor: Honza (2021)", "", "nealko, SIGNATURES AKTUAL", "", ""], ["", "Green? Deal! N/A", "Broušená whiskovka", "Hard shake, double strain, navrstvit pěnu", "3 cl Tanqueray 0%, 3 cl kiwi-estragonový cordial, 1 cl Roots Divino Rosso, matcha pěna", "Matcha pěna", "Nealko verze – Autor: Honza (2023)", "", "nealko, SIGNATURES AKTUAL", "", ""], ["", "Roman Holiday N/A", "Broušený long", "Shake, double strain", "2 cl Jenny in the Bottle, 1 cl Redbitter, 8 cl Kolonne Null Cuvée Blanc, 1 cl goji sirup, 1 cl limeta super juice, 4 cl Stará Dáma brusinkový mošt, top bazalková espuma", "Bazalka", "Nealko verze – Autor: Tom (2019)", "", "nealko, SIGNATURES AKTUAL", "", ""], ["", "Blind Cobra N/A", "Hliněný hrnek, podšálek, doily", "Shake and strain on ice block", "4 cl Sober Spirit W, 5 cl cordial z mátového čaje a broskve", "Pralinka z hořké čokolády s broskvovo-mátovou náplní", "Nealko verze – Autor: Veronika (2025)", "", "nealko, SIGNATURES AKTUAL", "", ""]];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function base64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  bytes.forEach(b => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Service-account OAuth2 (JWT bearer flow) — no npm deps, just Web Crypto.
// Avoids Apps Script Web App deployment-access restrictions entirely.
async function getGoogleAccessToken(env) {
  let sa;
  try {
    sa = JSON.parse(env.GOOGLE_SA_KEY_JSON);
  } catch {
    throw new Error('GOOGLE_SA_KEY_JSON není platné JSON.');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Nepodařilo se získat token od Googlu.');
  return data.access_token;
}

async function resolveSheetTitle(authHeader, gid) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(title,sheetId)`, {
    headers: authHeader,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Nepodařilo se zjistit název listu.');
  const sheet = data.sheets.find(s => s.properties.sheetId === gid);
  if (!sheet) throw new Error(`List s gid ${gid} nenalezen.`);
  return sheet.properties.title;
}

// values.append's "find the table, then append below it" heuristic turned
// out to pick the wrong column start on a sheet whose real table is
// narrower than the given range (data landed 8 columns too far right).
// Instead: read column B to find the first truly empty row ourselves, then
// values.update an explicit A{row}:K{row+n} range — no ambiguity left.
// gid/numCols let this target either Signatures (11 cols) or OLD signatures
// (7 cols, different column order) — whichever tab the rows are already
// shaped for.
async function appendToSheet(env, rows, gid = LIVE_SHEET_GID, numCols = SHEET_COLS) {
  const token = await getGoogleAccessToken(env);
  const authHeader = { authorization: `Bearer ${token}` };
  const sheetName = await resolveSheetTitle(authHeader, gid);

  const colBRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${sheetName}'!B:B`)}`,
    { headers: authHeader },
  );
  const colBData = await colBRes.json();
  if (!colBRes.ok) throw new Error(colBData.error?.message || 'Nepodařilo se přečíst list.');
  const nextRow = (colBData.values?.length || 0) + 1;

  const range = `'${sheetName}'!A${nextRow}:${String.fromCharCode(64 + numCols)}${nextRow + rows.length - 1}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { ...authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ range, values: rows }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Sheets API zápis selhal.');
  return { updates: { updatedRows: data.updatedRows } };
}

// Signatures row → OLD signatures row. Different column sets: OLD has no
// Trvanlivost/Kategorie, and uses "Autor" where Signatures has the freer
// "Poznámka autora" (carried over as-is — good enough, these were short).
function toOldSignatureRow(row) {
  const [, nazev, sklo, postup, slozeni, garnyz, poznamkaAutora] = row;
  return ['', nazev, slozeni, postup, sklo, garnyz, poznamkaAutora];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/concepts') {
      if (request.method === 'GET') {
        const stored = await env.CONCEPTS.get(KV_KEY, 'json');
        return json(stored || EMPTY);
      }

      if (request.method === 'PUT') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'Neplatné JSON tělo požadavku.' }, 400);
        }
        if (!body || !Array.isArray(body.years)) {
          return json({ error: 'Očekávám objekt s polem "years".' }, 400);
        }
        await env.CONCEPTS.put(KV_KEY, JSON.stringify(body));
        return json({ ok: true });
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    // Appends Ready drink rows straight into the Signatures tab via the
    // Sheets API, authenticated as a service account (GOOGLE_SA_KEY_JSON
    // secret — the sheet must share Editor access with its client_email).
    // Sheet/range is fixed server-side so a crafted request can't target
    // e.g. "Old Signatures".
    if (url.pathname === '/api/push-to-sheet' && request.method === 'POST') {
      if (!env.GOOGLE_SA_KEY_JSON) {
        return json({ error: 'Push do Sheetu není nastavený (chybí secret GOOGLE_SA_KEY_JSON).' }, 501);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Neplatné JSON tělo požadavku.' }, 400);
      }
      if (!Array.isArray(body.rows) || !body.rows.length) {
        return json({ error: 'Žádné řádky k zápisu.' }, 400);
      }

      try {
        const data = await appendToSheet(env, body.rows);
        const appended = data.updates?.updatedRows ?? body.rows.length;
        return json({ ok: true, appended });
      } catch (err) {
        return json({ error: err.message || 'Zápis do Sheetu selhal.' }, 502);
      }
    }

    // 1.11.2026 signature swap — see comment at OLD_SIGNATURE_TAGS above.
    // GET previews what would change; POST actually does it. Idempotent:
    // re-running after it already ran is a no-op (checked by presence of
    // "The Pho?!" with the new category tag), so an accidental double-fire
    // of the scheduled job can't duplicate rows.
    if (url.pathname === '/api/signatures-swap-1101') {
      if (!env.GOOGLE_SA_KEY_JSON) return json({ error: 'GOOGLE_SA_KEY_JSON není nastavený.' }, 501);
      try {
        const token = await getGoogleAccessToken(env);
        const authHeader = { authorization: `Bearer ${token}` };
        const sheetName = await resolveSheetTitle(authHeader, LIVE_SHEET_GID);

        const allValsRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${sheetName}'!A:K`)}`,
          { headers: authHeader },
        );
        const allVals = await allValsRes.json();
        if (!allValsRes.ok) throw new Error(allVals.error?.message || 'Nepodařilo se přečíst list.');
        const values = allVals.values || [];
        const oldRowNumbers = [];
        const oldRowsData = [];
        let alreadyDone = false;
        values.forEach((row, idx) => {
          const cat = (row[8] || '').trim();
          const name = (row[1] || '').trim();
          if (OLD_SIGNATURE_TAGS.includes(cat)) { oldRowNumbers.push(idx + 1); oldRowsData.push(row); }
          if (name === 'The Pho?!' && cat === 'SIGNATURES AKTUAL') alreadyDone = true;
        });

        if (request.method === 'GET') {
          return json({ sheetName, oldRowsToDelete: oldRowNumbers, alreadyDone });
        }
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

        if (alreadyDone) {
          return json({ ok: true, note: 'Nové signatures už tam jsou, nic jsem neměnila.', oldRowsStillPresent: oldRowNumbers.length });
        }

        // Archive first (non-destructive) — if this fails, nothing's lost yet.
        if (oldRowsData.length) {
          await appendToSheet(env, oldRowsData.map(toOldSignatureRow), OLD_SHEET_GID, OLD_SHEET_COLS);
        }

        if (oldRowNumbers.length) {
          const requests = oldRowNumbers.sort((a, b) => b - a).map(rowNum => ({
            deleteDimension: { range: { sheetId: LIVE_SHEET_GID, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum } },
          }));
          const delRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: { ...authHeader, 'content-type': 'application/json' },
            body: JSON.stringify({ requests }),
          });
          const delData = await delRes.json();
          if (!delRes.ok) throw new Error(delData.error?.message || 'Mazání starých řádků selhalo.');
        }

        const appendResult = await appendToSheet(env, NEW_SIGNATURE_ROWS);
        return json({
          ok: true,
          archivedOldRows: oldRowsData.length,
          deletedOldRows: oldRowNumbers.length,
          insertedNewRows: appendResult.updates.updatedRows ?? NEW_SIGNATURE_ROWS.length,
        });
      } catch (err) {
        return json({ error: err.message || 'Výměna signatures selhala.' }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
