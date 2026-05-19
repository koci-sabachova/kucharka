const fs = require('fs');

function parseCSV(path) {
  const text = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && inQ && text[i+1] === '"') { cur += '"'; i++; }
    else if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' && !inQ) { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else { cur += c; }
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

function slug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isValidName(name) {
  if (!name || !name.trim()) return false;
  // reject lines that are clearly ingredient fragments
  if (/^\d+[\d,\.]*\s*(cl|ml|dc|dl|dsh|dash|ks)/i.test(name.trim())) return false;
  if (/^(fresh|top|soda|limetov|pomerančov)/i.test(name.trim())) return false;
  return name.trim().length > 1;
}

// Smart ingredient splitter
function cleanItem(s) {
  return s.trim().replace(/[,.]$/, '').trim();
}

function splitOneLine(line) {
  if (!line) return [];
  const n = line.replace(/(\d),(\d)/g, '$1.$2'); // Czech decimal commas → dots
  const parts = n.split(/,\s+/).map(cleanItem).filter(Boolean);
  if (parts.length > 1) return parts;
  const spaceParts = line.split(/\s{5,}/);
  if (spaceParts.length > 1) return spaceParts.map(cleanItem).filter(Boolean);
  return [cleanItem(line)];
}

function cleanGlass(s) {
  if (!s) return s;
  // Truncate at parenthesis or period if too long
  const trimmed = s.split(/\s*[.(]/)[0].trim();
  return trimmed || s;
}

function splitIngredients(raw) {
  if (!raw) return [];
  const cleaned = raw.trim();
  if (cleaned.includes('\n')) {
    return cleaned.split('\n').flatMap(s => splitOneLine(s.trim())).filter(Boolean);
  }
  return splitOneLine(cleaned);
}

// ── 2026 signatures ──
// cols: 0=name, 1=glass(short), 2=type, 3=ingredients, 4=description, 5=glass(full), 6=method, 7=taste, 8=garnish
const sig26 = parseCSV('/Users/katerinakocisabachova/cobra-kucharka/2026signatures.csv');
const signatures = [];
for (let i = 2; i < sig26.length; i++) {
  const row = sig26[i];
  const name = row[0];
  if (!isValidName(name)) continue;
  const glass = cleanGlass((row[5] || row[1] || '').trim());
  const method = (row[6] || row[2] || '').trim();
  const garnish = (row[8] || '').trim();
  const ingredients = splitIngredients(row[3]);
  const desc = [row[4], row[7]].filter(Boolean).map(s => s.trim()).filter(s=>s).join(' · ');
  signatures.push({
    id: slug(name),
    name: name.trim(),
    category: 'signatures',
    glass,
    garnish,
    method,
    ingredients,
    ...(desc ? { description: desc } : {}),
  });
}

// ── old signatures (podzim/zima 25) ──
// cols: 0=section, 1=name, 2=glass, 3=method, 4=ingredients, 5=garnish, 6=author_note
const old = parseCSV('/Users/katerinakocisabachova/cobra-kucharka/COB_DRINKS_Kuchařka - Signatures podzim_zima 25.csv');
const oldSignatures = [];
const seenOld = new Set();

for (let i = 1; i < old.length; i++) {
  const row = old[i];

  // Detect shifted format (GINSTAR block) where name is at col 4
  let name, glass, method, ingredientsRaw, garnish, note;

  if (!row[1] && row[4] && isValidName(row[4])) {
    // shifted format
    name = row[4].trim();
    glass = (row[5] || '').trim();
    method = (row[6] || '').trim();
    ingredientsRaw = (row[7] || '').trim();
    garnish = (row[8] || '').trim();
    note = '';
  } else {
    name = (row[1] || '').trim();
    glass = cleanGlass((row[2] || '').trim());
    method = (row[3] || '').trim();
    ingredientsRaw = (row[4] || '').trim();
    garnish = (row[5] || '').trim();
    note = (row[6] || '').trim();
  }

  if (!isValidName(name)) continue;
  if (name === 'Název') continue;
  if (seenOld.has(name)) continue;
  seenOld.add(name);

  // Skip entries with no ingredients AND no method (probably section headers / junk)
  if (!ingredientsRaw && !method) continue;

  const ingredients = splitIngredients(ingredientsRaw);
  oldSignatures.push({
    id: slug(name),
    name,
    category: 'old_signatures',
    glass,
    garnish,
    method,
    ingredients,
    ...(note ? { description: note } : {}),
  });
}

// ── world classics ──
// cols: 0=status(X=nelze), 1=nazev, 2=ingredients, 3=method, 4=glass, 5=garnish, 6=to_go, 7=empty, 8=note
const wc = parseCSV('/Users/katerinakocisabachova/cobra-kucharka/world-classics.csv');
const classics = [];
const seenClassics = new Set();
for (let i = 2; i < wc.length; i++) {
  const row = wc[i];
  const status = (row[0] || '').trim().toUpperCase();
  if (status === 'X') continue; // nedostupné
  const rawName = (row[1] || '').trim()
    .replace(/^"+|"+$/g, '')   // strip outer quotes
    .replace(/"+/g, '')         // strip remaining quotes
    .replace(/\n/g, ' / ')      // newlines → " / "
    .replace(/\s{2,}/g, ' ')    // collapse whitespace
    .trim();
  const name = rawName;
  if (!isValidName(name)) continue;
  if (seenClassics.has(name)) continue;
  seenClassics.add(name);

  const glass = cleanGlass((row[4] || '').trim());
  const garnish = (row[5] || '').trim();
  const method = (row[3] || '').trim();
  const note = (row[8] || '').trim();
  const ingredients = splitIngredients(row[2]);

  classics.push({
    id: slug(name),
    name,
    category: 'world_classics',
    glass,
    garnish,
    method,
    ingredients,
    ...(note ? { description: note } : {}),
  });
}

// Deduplicate IDs by appending category suffix when needed
const allDraft = [...signatures, ...oldSignatures, ...classics];
const idCount = {};
allDraft.forEach(r => { idCount[r.id] = (idCount[r.id] || 0) + 1; });
const idSeen = {};
const all = allDraft.map(r => {
  if (idCount[r.id] > 1) {
    const suffix = { signatures: '-sig', old_signatures: '-old', world_classics: '-classic' }[r.category] || '-2';
    idSeen[r.id] = (idSeen[r.id] || 0) + 1;
    if (idSeen[r.id] > 1) return { ...r, id: r.id + suffix };
  }
  idSeen[r.id] = 1;
  return r;
});

fs.writeFileSync(
  '/Users/katerinakocisabachova/cobra-kucharka/data/recipes.json',
  JSON.stringify(all, null, 2),
  'utf8'
);
console.log(`signatures: ${signatures.length}, old_signatures: ${oldSignatures.length}, classics: ${classics.length} → total: ${all.length}`);

// Print sample for sanity check
console.log('\n── Sample signatures ──');
signatures.slice(0,2).forEach(r => console.log(r.name, '|', r.glass, '|', r.ingredients.slice(0,2)));
console.log('\n── Sample old signatures ──');
oldSignatures.slice(0,3).forEach(r => console.log(r.name, '|', r.glass, '|', r.ingredients.length, 'ingredients'));
