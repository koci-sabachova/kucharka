const fs = require('fs');
const path = require('path');

// ── CSV parser ──
function parseCSV(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && inQ && text[i + 1] === '"') { cur += '"'; i++; }
    else if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' && !inQ) { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else { cur += c; }
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

// ── Helpers ──
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function slug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isValidName(name) {
  if (!name || !name.trim()) return false;
  if (/^\d+[\d,\.]*\s*(cl|ml|dc|dl|dsh|dash|ks)/i.test(name.trim())) return false;
  return name.trim().length > 1;
}

function cleanItem(s) { return s.trim().replace(/[,.]$/, '').trim(); }

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

// ── Header-based column mapping ──
const FIELD_ALIASES = {
  name:         ['nazev', 'name'],
  glass:        ['sklo', 'glass'],
  method:       ['postup', 'method'],
  ingredients:  ['slozeni', 'slozenia', 'ingredients'],
  garnish:      ['garnyz', 'garnish'],
  note:         ['poznamka', 'poznamka autora', 'autor', 'author', 'note'],
  status:       ['old', 'status'],
  categoryOver: ['kategorie', 'category'],
};

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(cell => norm(cell) === 'nazev')) return i;
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const n = norm(cell);
    if (!n) return;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map[field] === undefined && aliases.includes(n)) {
        map[field] = idx;
        return;
      }
    }
  });
  return map;
}

function parseSheet(csvPath, defaultCategory, defaultLabel) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(text);
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) throw new Error(`No header row (with "Název"/"nazev") found in ${csvPath}`);
  const cols = buildColumnMap(rows[headerIdx]);
  if (cols.name === undefined) throw new Error(`No "Název" column found in ${csvPath}`);

  const recipes = [];
  const seen = new Set();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[cols.name] || '').trim();
    if (!isValidName(name)) continue;
    if (seen.has(name)) continue;

    const status = cols.status !== undefined ? (row[cols.status] || '').trim().toUpperCase() : '';
    if (status === 'X') continue; // marked unavailable

    const glass = cleanGlass((row[cols.glass] || '').trim());
    const method = (row[cols.method] || '').trim();
    const ingredientsRaw = (row[cols.ingredients] || '').trim();
    const garnish = (row[cols.garnish] || '').trim();
    const note = cols.note !== undefined ? (row[cols.note] || '').trim() : '';

    if (!ingredientsRaw && !method) continue; // section header / junk

    // Category override from "Kategorie" column; otherwise use tab default
    const overrideRaw = cols.categoryOver !== undefined ? (row[cols.categoryOver] || '').trim() : '';
    const category = overrideRaw ? slug(overrideRaw) : defaultCategory;
    const category_label = overrideRaw || defaultLabel;

    seen.add(name);
    const ingredients = splitIngredients(ingredientsRaw);
    recipes.push({
      id: slug(name),
      name,
      category,
      category_label,
      glass,
      garnish,
      method,
      ingredients,
      ...(note ? { description: note } : {}),
    });
  }

  return recipes;
}

// ── Sources ──
const ROOT = __dirname;
const CSV_DIR = path.join(ROOT, 'csv');
const sources = [
  { file: 'signatures.csv',     category: 'signatures',     label: 'Signatures AKTUAL' },
  { file: 'old_signatures.csv', category: 'old_signatures', label: 'Staré signatures' },
  { file: 'world_classics.csv', category: 'world_classics', label: 'World classics' },
];

const allDraft = sources.flatMap(s => parseSheet(path.join(CSV_DIR, s.file), s.category, s.label));

// Deduplicate IDs by appending category suffix when colliding across categories
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

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'data', 'recipes.json'),
  JSON.stringify(all, null, 2),
  'utf8'
);

const counts = {};
all.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
console.log(`total: ${all.length}`);
Object.entries(counts).sort().forEach(([cat, n]) => console.log(`  ${cat}: ${n}`));
