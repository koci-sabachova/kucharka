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
const SHEET_COLS = 11; // A..K, matches csv/signatures.csv column count

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
async function appendToSheet(env, rows) {
  const token = await getGoogleAccessToken(env);
  const authHeader = { authorization: `Bearer ${token}` };
  const sheetName = await resolveSheetTitle(authHeader, LIVE_SHEET_GID);

  const colBRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${sheetName}'!B:B`)}`,
    { headers: authHeader },
  );
  const colBData = await colBRes.json();
  if (!colBRes.ok) throw new Error(colBData.error?.message || 'Nepodařilo se přečíst list.');
  const nextRow = (colBData.values?.length || 0) + 1;

  const range = `'${sheetName}'!A${nextRow}:${String.fromCharCode(64 + SHEET_COLS)}${nextRow + rows.length - 1}`;
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

    return env.ASSETS.fetch(request);
  },
};
