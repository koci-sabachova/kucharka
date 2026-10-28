let recipes = [], bottles = [], currentTab = 'all', currentView = 'recipes';
const CAT_LABELS = {};

// Preferred display order; unknown categories go to the end, alphabetical by label.
const CAT_ORDER = ['svatek-mrtvych', 'signatures', 'negroni', 'nealko', 'world_classics', 'old_signatures'];

// Setup view state: which categories are included in the ingredient overview.
const setupSelectedCats = new Set(['signatures']);

// Persisted checkbox state for the prep list (survives reload).
const SETUP_CHECKED_KEY = 'cobra-setup-checked';
function loadSetupChecked() {
  try { return new Set(JSON.parse(localStorage.getItem(SETUP_CHECKED_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveSetupChecked(set) {
  localStorage.setItem(SETUP_CHECKED_KEY, JSON.stringify(Array.from(set)));
}
let setupChecked = loadSetupChecked();

// ── DATA ──
async function loadData() {
  [recipes, bottles] = await Promise.all([
    fetch('data/recipes.json').then(r => r.json()),
    fetch('data/lahve_db.json').then(r => r.json()),
  ]);
  recipes.forEach(r => {
    if (!CAT_LABELS[r.category]) CAT_LABELS[r.category] = r.category_label || r.category;
    (r.tags || []).forEach(t => {
      if (!CAT_LABELS[t]) CAT_LABELS[t] = t === 'nealko' ? 'Nealko' : t;
    });
  });
  renderTabs();
  renderList();
}

// "Staré signatures" always sorts last, even after ad-hoc categories that
// aren't in CAT_ORDER at all (e.g. one-off tags typed straight into the sheet).
function sortCats(keys) {
  return keys.sort((a, b) => {
    if (a === 'old_signatures') return 1;
    if (b === 'old_signatures') return -1;
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return CAT_LABELS[a].localeCompare(CAT_LABELS[b], 'cs');
  });
}

function renderTabs() {
  const cats = sortCats(Object.keys(CAT_LABELS));
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = `<button class="tab active" data-cat="all">Vše</button>` +
    cats.map(c => `<button class="tab" data-cat="${c}">${CAT_LABELS[c]}</button>`).join('');
  tabs.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.cat;
      tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderList();
    });
  });
}

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── RENDER LIST ──
function renderList() {
  const q = normalize(document.getElementById('search').value.trim());
  const container = document.getElementById('list-view');

  let filtered = recipes.filter(r => {
    const matchCat = q || currentTab === 'all' || r.category === currentTab || (r.tags || []).includes(currentTab);
    const matchQ = !q || [r.name, r.garnish, r.glass, ...r.ingredients, ...(r.tags||[])]
      .some(s => normalize(String(s)).includes(q));
    return matchCat && matchQ;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
      <div>Žádný recept nenalezen</div>
    </div>`;
    return;
  }

  // Skupinování — vždy abecedně
  const sorted = filtered.slice().sort((a,b) => a.name.localeCompare(b.name,'cs'));
  const groups = {};
  sorted.forEach(r => {
    const letter = r.name[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(r);
  });
  container.innerHTML = Object.keys(groups).sort((a,b) => a.localeCompare(b,'cs')).map(letter =>
    `<div class="alpha-group">
      <div class="alpha-label">${letter}</div>
      ${groups[letter].map(recipeCard).join('')}
    </div>`
  ).join('');

  container.querySelectorAll('.recipe-card').forEach(el => {
    el.addEventListener('click', () => openRecipe(el.dataset.id));
  });
}

// Nealko badge shown alongside the primary category badge, so a recipe stays
// in its home tab (Signatures AKTUAL, World classics, ...) but is still
// visibly flagged as non-alcoholic.
function nealkoBadge(r) {
  if (!(r.tags || []).includes('nealko') || r.category === 'nealko') return '';
  return `<span class="cat-badge cat-nealko">${CAT_LABELS.nealko || 'Nealko'}</span>`;
}

function recipeCard(r) {
  return `<div class="recipe-card" data-id="${r.id}">
    <div class="recipe-card-body">
      <div class="recipe-card-name">${r.name}<span class="cat-badge cat-${r.category}">${CAT_LABELS[r.category]}</span>${nealkoBadge(r)}</div>
      <div class="recipe-card-meta">${r.glass} · ${r.method}</div>
      <div class="recipe-card-ingredients">${(r.ingredients || []).join(', ')}</div>
    </div>
    <svg class="recipe-card-arrow" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
  </div>`;
}

// ── RECIPE DETAIL ──
function openRecipe(id) {
  const r = recipes.find(x => x.id === id);
  if (!r) return;

  const view = document.getElementById('detail-view');
  const hasUcebnice = r.description || r.history;

  view.innerHTML = `
    <button class="back-btn" onclick="closeDetail()">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      Zpět
    </button>

    <div class="detail-name">${r.name}</div>
    <div class="detail-cat"><span class="cat-badge cat-${r.category}">${CAT_LABELS[r.category]}</span>${nealkoBadge(r)}</div>

    <div class="detail-meta-row">
      <div class="detail-meta-item"><span>Sklenice</span>${r.glass}</div>
      <div class="detail-meta-item"><span>Metoda</span>${r.method}</div>
      <div class="detail-meta-item"><span>Garnish</span>${r.garnish}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Složení</div>
      <ul class="ingredient-list">
        ${r.ingredients.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Příprava</div>
      <div class="method-text">${r.method}</div>
    </div>

    ${hasUcebnice ? `
    <div class="detail-section">
      <div class="detail-section-title">Učebnice</div>
      <button class="ucebnice-toggle" onclick="toggleUcebnice(this)">
        Popis & Historie
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div class="ucebnice-body">
        ${r.description ? `<div class="ucebnice-subtitle">Popis</div><p>${r.description}</p>` : ''}
        ${r.history ? `<div class="ucebnice-subtitle">Historie</div><p>${r.history}</p>` : ''}
      </div>
    </div>` : ''}
  `;

  document.getElementById('list-view').style.display = 'none';
  document.getElementById('bottles-view').style.display = 'none';
  document.querySelector('.tabs').style.display = 'none';
  view.style.display = 'block';
  window.scrollTo(0, 0);
  currentView = 'detail';
}

function closeDetail() {
  document.getElementById('detail-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  document.querySelector('.tabs').style.display = 'flex';
  currentView = 'recipes';
}

function toggleUcebnice(btn) {
  btn.classList.toggle('open');
  btn.nextElementSibling.classList.toggle('open');
}

// ── BOTTLES ──
function renderBottles() {
  const q = normalize(document.getElementById('search').value.trim());
  const container = document.getElementById('bottles-view');

  const CAT_BOTTLE_LABELS = {
    gin: 'Gin', rum: 'Rum', whisky: 'Whisky', tequila: 'Tequila',
    mezcal: 'Mezcal', vodka: 'Vodka', vermut: 'Vermut', cognac: 'Cognac',
    calvados: 'Calvados', armagnac: 'Armagnac', grappa: 'Grappa',
    pisco: 'Pisco', cachaca: 'Cachaça', absint: 'Absint',
    ovocny_destilat: 'Ovocný destilát', slivovice: 'Slivovice',
    borovicka: 'Borovička', likér: 'Likér', aperitiv: 'Aperitiv',
    port: 'Port', sherry: 'Sherry', brandy: 'Brandy',
    raicilla: 'Raicilla', tsipouro: 'Tsipouro',
    bezalkoholovy_destilat: 'Bezalkoholový destilát', other: 'Ostatní',
  };

  let filtered = bottles.filter(b => {
    if (!q) return true;
    return [b.nazev, b.kategorie, b.zeme_puvodu, b.region, b.chutovy_profil, b.pribeh]
      .some(s => normalize(String(s||'')).includes(q));
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
      <div>Žádná lahev nenalezena</div>
    </div>`;
    return;
  }

  // Skupiny podle kategorie
  const groups = {};
  filtered.sort((a,b)=>a.nazev.localeCompare(b.nazev,'cs')).forEach(b => {
    const cat = b.kategorie || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(b);
  });

  container.innerHTML = Object.keys(groups).sort((a,b) => {
    const order = ['gin','rum','whisky','tequila','mezcal','vodka','vermut','cognac','calvados','armagnac'];
    const ai = order.indexOf(a), bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, 'cs');
  }).map(cat => `
    <div class="alpha-group">
      <div class="alpha-label">${CAT_BOTTLE_LABELS[cat] || cat}</div>
      ${groups[cat].map(b => `
        <div class="bottle-card" onclick="toggleBottle(this)">
          <div class="bottle-card-header">
            <div>
              <div class="bottle-card-name">${b.nazev}</div>
              <div class="bottle-card-cat">${[b.zeme_puvodu, b.region].filter(Boolean).join(' · ')}</div>
            </div>
            <div class="bottle-card-abv">${b.alkohol_procent}%</div>
          </div>
          <div class="bottle-body">
            <div class="bottle-field">
              <div class="bottle-field-label">Chuťový profil</div>
              <div class="bottle-field-value">${b.chutovy_profil || ''}</div>
            </div>
            <div class="bottle-field">
              <div class="bottle-field-label">O lahvi</div>
              <div class="bottle-field-value">${b.pribeh || ''}</div>
            </div>
            ${b.serve_tip ? `<div class="bottle-tip">🍹 ${b.serve_tip}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function toggleBottle(card) {
  const body = card.querySelector('.bottle-body');
  body.classList.toggle('open');
  card.style.borderColor = body.classList.contains('open') ? 'var(--accent)' : '';
}

// ── SETUP (ingredient overview) ──
function normalizeIngredient(s) {
  let r = String(s || '');
  // leading numeric amount + standard unit
  r = r.replace(/^\d+[\d,\.]*\s*(cl|ml|dc|dl|dsh|dash|ks|d)\b\s*/i, '');
  // leading numeric amount + Czech/EN quantity word
  r = r.replace(/^\d+[\d,\.]*\s*(kapky|kapek|kapka|st[rř]iky|st[rř]ik|drops?)\b\s*(of\s+)?/i, '');
  // leading slovní množství / akce (i samostatně bez následujícího slova)
  r = r.replace(/^(top(\s+up)?|z[áa]st[rř]iky?|couple\s+drops?\s+of|p[áa]r\s+kapek|n[ěe]kolik\s+kapek|dol[íi]t|dolejt|spousta|trochu|trochou)\b\s*/i, '');
  // trailing "na dolití / na dolit / na dolejt"
  r = r.replace(/\s+na\s+(dol[íi]t|dolejt)[íi]?\s*$/i, '');
  // cleanup
  return r.replace(/[.,;:]+$/, '').replace(/\s+/g, ' ').trim();
}

function ingredientKey(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function aggregateIngredients(list) {
  const map = new Map();
  list.forEach(r => {
    (r.ingredients || []).forEach(raw => {
      const display = normalizeIngredient(raw);
      if (!display || display.length < 2) return;
      const key = ingredientKey(display);
      if (!map.has(key)) map.set(key, { display, drinks: new Set() });
      map.get(key).drinks.add(r.name);
    });
  });
  return Array.from(map.values())
    .map(e => ({ display: e.display, count: e.drinks.size, drinks: Array.from(e.drinks).sort((a,b)=>a.localeCompare(b,'cs')) }))
    .sort((a, b) => a.display.localeCompare(b.display, 'cs'));
}

function renderSetup() {
  const container = document.getElementById('setup-view');
  const q = normalize(document.getElementById('search').value.trim());

  const cats = sortCats(Object.keys(CAT_LABELS));

  const chips = cats.map(c => `
    <button class="setup-chip${setupSelectedCats.has(c) ? ' active' : ''}" data-cat="${c}">
      ${CAT_LABELS[c]}
    </button>`).join('');

  const filtered = recipes.filter(r => setupSelectedCats.has(r.category));
  let ingredients = aggregateIngredients(filtered);
  if (q) ingredients = ingredients.filter(i => normalize(i.display).includes(q));

  const itemsHtml = ingredients.map(ing => {
    const key = ingredientKey(ing.display);
    const checked = setupChecked.has(key);
    const drinksHtml = ing.drinks.map(d => `<div class="setup-drink">${d}</div>`).join('');
    return `
      <div class="setup-item${checked ? ' checked' : ''}" data-key="${key}">
        <div class="setup-item-row">
          <div class="setup-half-check">
            <span class="setup-check${checked ? ' on' : ''}"></span>
            <span class="setup-name">${ing.display}</span>
          </div>
          <div class="setup-half-expand">
            <span class="setup-count">${ing.count}</span>
            <svg class="setup-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        <div class="setup-drinks">${drinksHtml}</div>
      </div>`;
  }).join('');

  const doneCount = ingredients.filter(i => setupChecked.has(ingredientKey(i.display))).length;

  const body = filtered.length === 0
    ? '<div class="empty"><div>Žádná vybraná kategorie</div></div>'
    : ingredients.length === 0
      ? '<div class="empty"><div>Žádná ingredience nenalezena</div></div>'
      : `
        <div class="setup-summary">
          <span>${doneCount}/${ingredients.length} ingrediencí · ${filtered.length} drinků</span>
          <button class="setup-reset" type="button">Reset</button>
        </div>
        <div class="setup-grid">${itemsHtml}</div>`;

  container.innerHTML = `
    <div class="setup-filter">${chips}</div>
    ${body}
  `;

  container.querySelectorAll('.setup-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      if (setupSelectedCats.has(cat)) setupSelectedCats.delete(cat);
      else setupSelectedCats.add(cat);
      renderSetup();
    });
  });

  const updateSummary = () => {
    const summarySpan = container.querySelector('.setup-summary span');
    if (summarySpan) {
      const done = container.querySelectorAll('.setup-item.checked').length;
      summarySpan.textContent = `${done}/${ingredients.length} ingrediencí · ${filtered.length} drinků`;
    }
  };

  container.querySelectorAll('.setup-half-check').forEach(half => {
    half.addEventListener('click', () => {
      const item = half.closest('.setup-item');
      const key = item.dataset.key;
      const isOn = setupChecked.has(key);
      if (isOn) setupChecked.delete(key);
      else setupChecked.add(key);
      item.classList.toggle('checked', !isOn);
      half.querySelector('.setup-check').classList.toggle('on', !isOn);
      saveSetupChecked(setupChecked);
      updateSummary();
    });
  });

  container.querySelectorAll('.setup-half-expand').forEach(half => {
    half.addEventListener('click', () => {
      half.closest('.setup-item').classList.toggle('open');
    });
  });

  const resetBtn = container.querySelector('.setup-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    setupChecked = new Set();
    saveSetupChecked(setupChecked);
    renderSetup();
  });
}

// ── KONCEPTY (shared drink-concept drafting, backed by /api/concepts + KV) ──
let concepts = null;
let conceptsStage = 'years'; // years | categories | drinks | drink-form
let currentYearId = null, currentCategoryId = null, editingDrinkId = null;
let conceptDraft = null;
let conceptCategoryDraft = null, editingCategoryId = null, conceptsCategoryFormOpen = false;
let conceptsCsvOpen = false;
let conceptsPushMsg = '';
let conceptsDefaultApplied = false;

const PREP_TAGS = ['Shake', 'Hard shake', 'Stir', 'Build', 'Double strain', 'Rolling', 'Ice block'];
const RECOMMENDED_GROUPS = ['Spirity', 'Pivo', 'Vína', 'Cidery', 'Mošty', 'Nealko z nápojáku'];
const COMP_UNITS = ['cl', 'ml', 'ks', 'dash', 'kapky', 'lžíce', 'g'];

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function loadConcepts() {
  try {
    const res = await fetch('/api/concepts');
    concepts = await res.json();
  } catch {
    concepts = { years: [] };
  }
}

async function saveConcepts() {
  try {
    await fetch('/api/concepts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(concepts),
    });
  } catch {
    alert('Nepodařilo se uložit na server – zkontroluj připojení a zkus to znovu.');
  }
}

function findYear(id) { return concepts.years.find(y => y.id === id); }
function findCategory(yearId, catId) {
  const y = findYear(yearId);
  return y && y.categories.find(c => c.id === catId);
}
function findDrink(yearId, catId, drinkId) {
  const c = findCategory(yearId, catId);
  return c && c.drinks.find(d => d.id === drinkId);
}

function collectGlasses() { return Array.from(new Set(recipes.map(r => r.glass).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'cs')); }
function collectGarnishes() { return Array.from(new Set(recipes.map(r => r.garnish).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'cs')); }
function collectIngredientSuggestions() {
  const fromRecipes = recipes.flatMap(r => (r.ingredients || []).map(normalizeIngredient));
  const fromBottles = bottles.map(b => b.nazev);
  return Array.from(new Set([...fromRecipes, ...fromBottles].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'cs'));
}
function collectAuthors() {
  const set = new Set();
  (concepts?.years || []).forEach(y => (y.categories || []).forEach(c => (c.drinks || []).forEach(d => { if (d.author) set.add(d.author); })));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
}

function formatDeadline(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - now) / 86400000);
  const label = d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  let rel = ' (po termínu)';
  if (diffDays === 0) rel = ' (dnes)';
  else if (diffDays === 1) rel = ' (zítra)';
  else if (diffDays > 1) rel = ` (za ${diffDays} dní)`;
  return `${label}${rel}`;
}

function emptyCategory() {
  return { id: genId(), name: '', targetCount: 4, deadline: '', briefing: '', recommendedIngredients: [], drinks: [] };
}
function emptyCompRow() { return { ingredient: '', amount: '', unit: 'cl' }; }
function emptyDrink() {
  return { id: genId(), name: '', author: '', status: 'koncept', composition: [emptyCompRow()], glass: '', method: '', garnish: '', preps: '', allergens: '', pushedToSheet: false, createdAt: Date.now() };
}
function compRowFilled(row) { return row && row.ingredient && row.ingredient.trim(); }
function compRowText(row) {
  if (!compRowFilled(row)) return '';
  const amount = (row.amount || '').trim();
  return [amount, amount ? row.unit : '', row.ingredient.trim()].filter(Boolean).join(' ');
}

function csvField(v) {
  v = String(v ?? '');
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function csvFieldsRow(fields) { return fields.map(csvField).join(','); }

// Shared row shape for both the "copy as CSV" export and the direct push
// into the Google Sheet — same column order as csv/signatures.csv.
function drinkRow(d, category) {
  const composition = d.composition.map(compRowText).filter(Boolean).join(', ');
  const note = [d.author ? `Autor: ${d.author}` : '', d.preps, d.allergens ? `Alergeny: ${d.allergens}` : ''].filter(Boolean).join('. ');
  return ['', d.name, d.glass, d.method, composition, d.garnish, note, '', category.name, '', ''];
}
function categoryRows(category, drinks) {
  return drinks.map(d => drinkRow(d, category));
}
function categoryCsv(category, drinks) {
  const header = ',Název,Sklo,Postup,Složení,Garnýž,Poznámka autora,Trvanlivost,Kategorie,,';
  return [header, ...categoryRows(category, drinks).map(csvFieldsRow)].join('\n');
}

// Finds the single soonest deadline across every year/category so it can be
// surfaced everywhere in Koncepty — urgency shouldn't depend on having
// drilled into the right year first.
function nearestDeadline() {
  let best = null;
  concepts.years.forEach(y => (y.categories || []).forEach(c => {
    if (!c.deadline) return;
    const d = new Date(c.deadline + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d - now) / 86400000);
    if (!best || diffDays < best.diffDays) best = { year: y, category: c, diffDays };
  }));
  return best;
}

function deadlineBannerHtml() {
  const info = nearestDeadline();
  if (!info) return '';
  const { diffDays, category } = info;
  const urgent = diffDays <= 1;
  const label = diffDays < 0 ? `Po termínu (${Math.abs(diffDays)} dní)`
    : diffDays === 0 ? 'Deadline dnes'
    : diffDays === 1 ? 'Deadline zítra'
    : `${diffDays} dní do deadline`;
  return `<div class="concept-deadline-banner${urgent ? ' urgent' : ''}" data-year="${escAttr(info.year.id)}" data-cat="${escAttr(category.id)}">
    <span class="concept-deadline-count">${label}</span>
    <span class="concept-deadline-name">${esc(category.name)}</span>
  </div>`;
}

function renderConcepts() {
  const container = document.getElementById('concepts-view');
  if (!concepts) {
    container.innerHTML = '<div class="empty"><div>Načítám…</div></div>';
    loadConcepts().then(renderConcepts);
    return;
  }
  if (!conceptsDefaultApplied) {
    conceptsDefaultApplied = true;
    const thisYear = String(new Date().getFullYear());
    if (findYear(thisYear)) {
      currentYearId = thisYear;
      conceptsStage = 'categories';
    }
  }
  if (conceptsStage === 'years') renderConceptYears(container);
  else if (conceptsStage === 'categories') renderConceptCategories(container);
  else if (conceptsStage === 'drinks') renderConceptDrinks(container);
  else if (conceptsStage === 'drink-form') renderConceptDrinkForm(container);

  const banner = deadlineBannerHtml();
  if (banner) {
    container.insertAdjacentHTML('afterbegin', banner);
    container.querySelector('.concept-deadline-banner').addEventListener('click', function () {
      currentYearId = this.dataset.year;
      currentCategoryId = this.dataset.cat;
      conceptsStage = 'drinks';
      renderConcepts();
    });
  }
}

function renderConceptYears(container) {
  const years = concepts.years.slice().sort((a, b) => b.id.localeCompare(a.id, 'cs', { numeric: true }));
  container.innerHTML = `
    <div class="concept-heading"><h2>Koncepty drinků</h2></div>
    <div class="concept-grid" id="concept-years-grid">
      ${years.map(y => {
        const catCount = y.categories.length;
        const drinkCount = y.categories.reduce((n, c) => n + c.drinks.length, 0);
        return `<div class="concept-card" data-year="${escAttr(y.id)}">
          <div class="concept-card-title">${esc(y.id)}</div>
          <div class="concept-card-sub">${catCount} kategorií · ${drinkCount} drinků</div>
        </div>`;
      }).join('') || '<div class="empty"><div>Zatím žádný rok. Přidej ho dole.</div></div>'}
    </div>
    <div class="concept-add-row">
      <input id="new-year-input" type="text" placeholder="Nový rok, např. 2027">
      <button class="concept-btn" id="add-year-btn">+ Přidat rok</button>
    </div>
    <div class="concept-form-error" id="year-error" hidden></div>
  `;
  container.querySelectorAll('[data-year]').forEach(el => {
    el.addEventListener('click', () => {
      currentYearId = el.dataset.year;
      conceptsStage = 'categories';
      renderConcepts();
    });
  });
  container.querySelector('#add-year-btn').addEventListener('click', () => {
    const input = container.querySelector('#new-year-input');
    const errorEl = container.querySelector('#year-error');
    errorEl.hidden = true;
    const val = input.value.trim();
    if (!val) return;
    if (concepts.years.some(y => y.id === val)) { errorEl.textContent = 'Tenhle rok už existuje.'; errorEl.hidden = false; return; }
    concepts.years.push({ id: val, categories: [] });
    saveConcepts();
    renderConcepts();
  });
}

function categoryFormHtml(draft) {
  return `
    <div class="concept-form">
      <label>Název kategorie<input id="ccf-name" type="text" value="${escAttr(draft.name)}" placeholder="např. Silvestr 26/27"></label>
      <label>Počet drinků (cíl)<input id="ccf-target" type="number" min="1" value="${draft.targetCount}"></label>
      <label>Deadline<input id="ccf-deadline" type="date" value="${escAttr(draft.deadline)}"></label>
      <div class="concept-field-label">Zadání pro barmany</div>
      <textarea id="ccf-briefing" rows="3" placeholder="Popiš brief kategorie…">${esc(draft.briefing)}</textarea>
      <div class="concept-field-label">Doporučené suroviny</div>
      <div class="concept-tag-row">${RECOMMENDED_GROUPS.map(g => `<button type="button" class="concept-tag" data-add-group="${escAttr(g)}">${g}</button>`).join('')}</div>
      <input id="ccf-ingredient-input" type="text" placeholder="Přidej surovinu a stiskni Enter">
      <div class="concept-chips" id="ccf-chips">${draft.recommendedIngredients.map((ing, i) => `<span class="concept-chip">${esc(ing)}<button type="button" class="concept-chip-remove" data-i="${i}">×</button></span>`).join('')}</div>
      <div class="concept-form-error" id="ccf-error" hidden></div>
      <div class="concept-form-actions">
        <button type="button" class="concept-btn concept-save" id="ccf-save">Uložit kategorii</button>
        <button type="button" class="concept-btn concept-cancel" id="ccf-cancel">Zrušit</button>
        ${editingCategoryId && draft.drinks.length === 0 ? '<button type="button" class="concept-btn concept-delete" id="ccf-delete">Smazat kategorii</button>' : ''}
      </div>
    </div>`;
}

function bindCategoryForm(container, onSaved) {
  const draft = conceptCategoryDraft;
  container.querySelectorAll('[data-add-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.addGroup;
      if (!draft.recommendedIngredients.includes(g)) draft.recommendedIngredients.push(g);
      renderConcepts();
    });
  });
  container.querySelector('#ccf-ingredient-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) return;
    draft.recommendedIngredients.push(val);
    renderConcepts();
  });
  container.querySelectorAll('.concept-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      draft.recommendedIngredients.splice(Number(btn.dataset.i), 1);
      renderConcepts();
    });
  });
  container.querySelector('#ccf-cancel').addEventListener('click', () => {
    conceptsCategoryFormOpen = false;
    conceptCategoryDraft = null;
    editingCategoryId = null;
    renderConcepts();
  });
  const delBtn = container.querySelector('#ccf-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (!confirm('Smazat tuhle kategorii?')) return;
    const y = findYear(currentYearId);
    y.categories = y.categories.filter(c => c.id !== editingCategoryId);
    conceptsCategoryFormOpen = false;
    conceptCategoryDraft = null;
    editingCategoryId = null;
    saveConcepts();
    onSaved();
  });
  container.querySelector('#ccf-save').addEventListener('click', () => {
    draft.name = container.querySelector('#ccf-name').value.trim();
    draft.targetCount = Math.max(1, Number(container.querySelector('#ccf-target').value) || 1);
    draft.deadline = container.querySelector('#ccf-deadline').value;
    draft.briefing = container.querySelector('#ccf-briefing').value;
    if (!draft.name) {
      const errorEl = container.querySelector('#ccf-error');
      errorEl.textContent = 'Vyplň název kategorie.';
      errorEl.hidden = false;
      return;
    }
    const y = findYear(currentYearId);
    if (editingCategoryId) {
      const idx = y.categories.findIndex(c => c.id === editingCategoryId);
      y.categories[idx] = { ...y.categories[idx], ...draft };
    } else {
      y.categories.push(draft);
    }
    conceptsCategoryFormOpen = false;
    conceptCategoryDraft = null;
    editingCategoryId = null;
    saveConcepts();
    onSaved();
  });
}

function renderConceptCategories(container) {
  const year = findYear(currentYearId);
  if (!year) { conceptsStage = 'years'; return renderConcepts(); }
  const cats = year.categories;
  container.innerHTML = `
    <button class="back-btn" id="cc-back">← Zpět</button>
    <div class="concept-heading"><h2>Kategorie ${esc(year.id)}</h2>
      <button class="concept-btn concept-btn-primary" id="cc-new">+ Nová kategorie</button>
    </div>
    ${conceptsCategoryFormOpen ? categoryFormHtml(conceptCategoryDraft) : ''}
    <div class="concept-grid">
      ${cats.map(c => {
        const ready = c.drinks.filter(d => d.status === 'ready').length;
        const konceptCount = c.drinks.length - ready;
        const pct = c.targetCount > 0 ? Math.min(100, Math.round(ready / c.targetCount * 100)) : 0;
        return `<div class="concept-card" data-cat="${escAttr(c.id)}">
          <button type="button" class="concept-card-delete" data-del="${escAttr(c.id)}" ${c.drinks.length ? 'disabled title="Smazat jde jen prázdná kategorie"' : ''}>×</button>
          <div class="concept-card-title">${esc(c.name)}</div>
          <div class="concept-card-sub">${ready} z ${c.targetCount} drinky</div>
          <div class="concept-progress-bar"><div class="concept-progress-fill" style="width:${pct}%"></div></div>
          <div class="concept-card-sub">${ready} Ready · ${konceptCount} konceptů</div>
          ${c.deadline ? `<div class="concept-card-deadline">Deadline: ${formatDeadline(c.deadline)}</div>` : ''}
        </div>`;
      }).join('') || '<div class="empty"><div>Zatím žádná kategorie.</div></div>'}
    </div>
  `;
  container.querySelector('#cc-back').addEventListener('click', () => {
    conceptsStage = 'years';
    conceptsCategoryFormOpen = false;
    renderConcepts();
  });
  container.querySelector('#cc-new').addEventListener('click', () => {
    conceptCategoryDraft = emptyCategory();
    editingCategoryId = null;
    conceptsCategoryFormOpen = true;
    renderConcepts();
  });
  if (conceptsCategoryFormOpen) bindCategoryForm(container, renderConcepts);
  container.querySelectorAll('[data-cat]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-del]')) return;
      currentCategoryId = el.dataset.cat;
      conceptsStage = 'drinks';
      renderConcepts();
    });
  });
  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.disabled) return;
      if (!confirm('Smazat tuhle kategorii?')) return;
      year.categories = year.categories.filter(c => c.id !== btn.dataset.del);
      saveConcepts();
      renderConcepts();
    });
  });
}

function renderConceptDrinks(container) {
  const category = findCategory(currentYearId, currentCategoryId);
  if (!category) { conceptsStage = 'categories'; return renderConcepts(); }
  const readyDrinks = category.drinks.filter(d => d.status === 'ready');
  const unpushed = readyDrinks.filter(d => !d.pushedToSheet);
  container.innerHTML = `
    <button class="back-btn" id="cd-back">← Zpět</button>
    <div class="concept-heading"><h2>${esc(category.name)}</h2>
      <button class="concept-btn concept-btn-primary" id="cd-new-drink">+ Nový drink</button>
    </div>
    <div class="concept-card-sub">${readyDrinks.length} z ${category.targetCount} drinky${category.deadline ? ' · Deadline: ' + formatDeadline(category.deadline) : ''}</div>
    ${category.briefing ? `<div class="concept-briefing">${esc(category.briefing)}</div>` : ''}
    ${category.recommendedIngredients.length ? `<div class="concept-chips">${category.recommendedIngredients.map(i => `<span class="concept-chip">${esc(i)}</span>`).join('')}</div>` : ''}
    <div class="concept-form-actions" style="margin:12px 0">
      <button type="button" class="concept-btn" id="cd-edit-cat">Upravit kategorii</button>
      <button type="button" class="concept-btn" id="cd-export">Export CSV (Ready)</button>
      <button type="button" class="concept-btn concept-btn-primary" id="cd-push" ${unpushed.length ? '' : 'disabled'}>Nahrát do Sheetu${unpushed.length ? ` (${unpushed.length})` : ''}</button>
    </div>
    <p class="concept-card-sub" id="cd-push-msg">${esc(conceptsPushMsg)}</p>
    ${conceptsCsvOpen ? `<textarea class="concept-csv-out" readonly>${esc(categoryCsv(category, readyDrinks))}</textarea>
      <div class="concept-form-actions" style="margin-top:8px"><button type="button" class="concept-btn" id="cd-csv-copy">Zkopírovat</button></div>` : ''}
    ${category.drinks.map(d => `
      <div class="concept-drink-card" data-drink="${escAttr(d.id)}">
        <button type="button" class="concept-drink-remove" data-del-drink="${escAttr(d.id)}">×</button>
        <div class="concept-drink-name">${esc(d.name) || '(bez názvu)'}<span class="concept-badge concept-badge-${d.status}">${d.status === 'ready' ? 'Ready' : 'Koncept'}</span>${d.pushedToSheet ? '<span class="concept-badge concept-badge-pushed">✓ v Sheetu</span>' : ''}</div>
        <div class="concept-drink-meta">${[d.author, d.glass, d.method].filter(Boolean).join(' · ')}</div>
        <div class="concept-drink-comp">${esc(d.composition.map(compRowText).filter(Boolean).join(', '))}</div>
      </div>`).join('') || '<div class="empty"><div>Zatím žádný drink v téhle kategorii.</div></div>'}
  `;
  container.querySelector('#cd-back').addEventListener('click', () => {
    conceptsStage = 'categories';
    conceptsCsvOpen = false;
    conceptsPushMsg = '';
    renderConcepts();
  });
  container.querySelector('#cd-new-drink').addEventListener('click', () => {
    editingDrinkId = null;
    conceptDraft = emptyDrink();
    conceptsStage = 'drink-form';
    renderConcepts();
  });
  container.querySelector('#cd-edit-cat').addEventListener('click', () => {
    conceptCategoryDraft = JSON.parse(JSON.stringify(category));
    editingCategoryId = category.id;
    conceptsCategoryFormOpen = true;
    conceptsStage = 'categories';
    renderConcepts();
  });
  container.querySelector('#cd-export').addEventListener('click', () => {
    conceptsCsvOpen = !conceptsCsvOpen;
    renderConcepts();
  });
  const copyBtn = container.querySelector('#cd-csv-copy');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(categoryCsv(category, readyDrinks)); copyBtn.textContent = 'Zkopírováno ✓'; }
    catch { alert('Nepodařilo se zkopírovat, označ text ručně.'); }
  });
  const pushBtn = container.querySelector('#cd-push');
  const pushMsg = container.querySelector('#cd-push-msg');
  pushBtn.addEventListener('click', async () => {
    if (!unpushed.length) return;
    pushBtn.disabled = true;
    pushMsg.textContent = 'Nahrávám…';
    try {
      const res = await fetch('/api/push-to-sheet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: categoryRows(category, unpushed) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Zápis do Sheetu selhal.');
      unpushed.forEach(d => { d.pushedToSheet = true; d.pushedAt = Date.now(); });
      await saveConcepts();
      conceptsPushMsg = `Nahráno ${data.appended} drinků do Sheetu.`;
      renderConcepts();
    } catch (err) {
      pushBtn.disabled = false;
      conceptsPushMsg = `Chyba: ${err.message}`;
      pushMsg.textContent = conceptsPushMsg;
    }
  });
  container.querySelectorAll('[data-drink]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-del-drink]')) return;
      editingDrinkId = el.dataset.drink;
      conceptDraft = JSON.parse(JSON.stringify(findDrink(currentYearId, currentCategoryId, editingDrinkId)));
      conceptsStage = 'drink-form';
      renderConcepts();
    });
  });
  container.querySelectorAll('[data-del-drink]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Smazat tenhle drink?')) return;
      category.drinks = category.drinks.filter(d => d.id !== btn.dataset.delDrink);
      saveConcepts();
      renderConcepts();
    });
  });
}

// Custom suggestion dropdown (not <datalist> — unreliable on mobile Safari
// especially) shared by author/ingredient/glass/garnish fields. Up to 8
// matches, category-recommended ones first with a badge.
function acMatches(list, query, recommended) {
  const q = normalize(query || '');
  const rec = recommended.filter(i => !q || normalize(i).includes(q)).map(v => ({ value: v, recommended: true }));
  const rest = list.filter(i => !recommended.includes(i) && (!q || normalize(i).includes(q))).map(v => ({ value: v, recommended: false }));
  return [...rec, ...rest].slice(0, 8);
}
function acListHtml(matches) {
  return matches.map(m => `<div class="ac-item" data-value="${escAttr(m.value)}">${esc(m.value)}${m.recommended ? '<span class="ac-badge">Doporučené</span>' : ''}</div>`).join('');
}

function renderConceptDrinkForm(container) {
  const draft = conceptDraft;
  const category = findCategory(currentYearId, currentCategoryId);
  const suggestions = {
    author: { list: collectAuthors(), recommended: [] },
    ingredient: { list: collectIngredientSuggestions(), recommended: (category && category.recommendedIngredients) || [] },
    glass: { list: collectGlasses(), recommended: [] },
    garnish: { list: collectGarnishes(), recommended: [] },
  };
  const acField = (ac, id, value, placeholder) => `
    <div class="ac-wrap">
      <input id="${id}" class="ac-input" data-ac="${ac}" type="text" autocomplete="off" value="${escAttr(value)}" placeholder="${escAttr(placeholder)}">
      <div class="ac-list" hidden></div>
    </div>`;

  container.innerHTML = `
    <button class="back-btn" id="cf-back">← Zpět</button>
    <div class="concept-heading"><h2>${editingDrinkId ? 'Upravit drink' : 'Nový drink'}</h2></div>
    <div class="concept-form">
      <label>Název<input id="cf-name" type="text" value="${escAttr(draft.name)}" placeholder="Název drinku"></label>
      <label>Autor${acField('author', 'cf-author', draft.author, 'Kdo zapisuje')}</label>

      <div class="concept-status-toggle">
        <button type="button" class="status-btn${draft.status === 'koncept' ? ' active' : ''}" data-status="koncept">Koncept</button>
        <button type="button" class="status-btn${draft.status === 'ready' ? ' active' : ''}" data-status="ready">Ready</button>
      </div>
      <div class="concept-status-hint">Koncept se ještě ladí. Ready vyžaduje vyplněné složení, sklo, postup a dekoraci.</div>

      <div class="concept-field-label">Složení</div>
      <div id="cf-composition">
        ${draft.composition.map((row, i) => `
          <div class="cf-comp-row">
            <div class="ac-wrap">
              <input class="ac-input cf-comp-ingredient" data-ac="ingredient" data-i="${i}" type="text" autocomplete="off" value="${escAttr(row.ingredient)}" placeholder="Surovina">
              <div class="ac-list" hidden></div>
            </div>
            <div class="cf-comp-qty-row">
              <input class="cf-comp-amount" data-i="${i}" type="text" inputmode="decimal" value="${escAttr(row.amount)}" placeholder="množství">
              <select class="cf-comp-unit" data-i="${i}">${COMP_UNITS.map(u => `<option value="${u}"${u === row.unit ? ' selected' : ''}>${u}</option>`).join('')}</select>
              <button type="button" class="cf-comp-remove" data-i="${i}" aria-label="Smazat surovinu">×</button>
            </div>
          </div>`).join('')}
      </div>
      <button type="button" id="cf-comp-add" class="concept-add-line">+ Přidat surovinu</button>

      <label>Sklo${acField('glass', 'cf-glass', draft.glass, 'např. Broušená whiskovka')}</label>

      <div class="concept-field-label">Postup</div>
      <div class="concept-tag-row">${PREP_TAGS.map(t => `<button type="button" class="concept-tag" data-tag="${escAttr(t)}">${t}</button>`).join('')}</div>
      <textarea id="cf-method" rows="2" placeholder="Shake, double strain…">${esc(draft.method)}</textarea>

      <label>Dekorace${acField('garnish', 'cf-garnish', draft.garnish, 'Garnish')}</label>

      <div class="concept-field-label">Preps (nepovinné)</div>
      <textarea id="cf-preps" rows="2" placeholder="Recept na cordial/sirup/espuma…">${esc(draft.preps)}</textarea>

      <label>Alergeny (nepovinné)<input id="cf-allergens" type="text" value="${escAttr(draft.allergens)}" placeholder="např. vejce, sója"></label>

      <div class="concept-form-actions-sticky">
        <div class="concept-form-error" id="cf-error" hidden></div>
        <div class="concept-form-actions">
          <button type="button" class="concept-btn concept-save" id="cf-save">Uložit</button>
          ${editingDrinkId ? '<button type="button" class="concept-btn concept-delete" id="cf-delete">Smazat drink</button>' : ''}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#cf-back').addEventListener('click', () => {
    conceptsStage = 'drinks';
    conceptDraft = null;
    renderConcepts();
  });
  container.querySelector('#cf-name').addEventListener('input', e => draft.name = e.target.value);
  container.querySelector('#cf-allergens').addEventListener('input', e => draft.allergens = e.target.value);
  container.querySelector('#cf-method').addEventListener('input', e => draft.method = e.target.value);
  container.querySelector('#cf-preps').addEventListener('input', e => draft.preps = e.target.value);

  container.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      draft.status = btn.dataset.status;
      container.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  container.querySelectorAll('.concept-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      draft.method = draft.method ? `${draft.method}, ${tag}` : tag;
      container.querySelector('#cf-method').value = draft.method;
    });
  });

  // Autocomplete fields (author, ingredient×n, glass, garnish) share one binding.
  function setAcValue(input, value) {
    input.value = value;
    if (input.id === 'cf-author') draft.author = value;
    else if (input.id === 'cf-glass') draft.glass = value;
    else if (input.id === 'cf-garnish') draft.garnish = value;
    else if (input.dataset.ac === 'ingredient') draft.composition[Number(input.dataset.i)].ingredient = value;
  }
  container.querySelectorAll('.ac-input').forEach(input => {
    const list = input.nextElementSibling;
    const { list: items, recommended } = suggestions[input.dataset.ac];
    const refresh = () => {
      const matches = acMatches(items, input.value, recommended);
      list.innerHTML = acListHtml(matches);
      list.hidden = !matches.length;
    };
    input.addEventListener('focus', refresh);
    input.addEventListener('input', () => { setAcValue(input, input.value); refresh(); });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
    list.addEventListener('mousedown', e => {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      e.preventDefault();
      setAcValue(input, item.dataset.value);
      list.hidden = true;
      if (input.dataset.ac === 'ingredient') {
        const amountInput = container.querySelector(`.cf-comp-amount[data-i="${input.dataset.i}"]`);
        if (amountInput) amountInput.focus();
      }
    });
  });

  function focusCompIngredient(i) {
    const input = container.querySelector(`.cf-comp-ingredient[data-i="${i}"]`);
    if (input) input.focus();
  }
  function addCompRowAfter(i) {
    draft.composition.splice(i + 1, 0, emptyCompRow());
    renderConceptDrinkForm(container);
    focusCompIngredient(i + 1);
  }

  container.querySelectorAll('.cf-comp-ingredient, .cf-comp-amount').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addCompRowAfter(Number(input.dataset.i));
    });
  });
  container.querySelectorAll('.cf-comp-amount').forEach(input => {
    input.addEventListener('input', () => { draft.composition[Number(input.dataset.i)].amount = input.value; });
  });
  container.querySelectorAll('.cf-comp-unit').forEach(sel => {
    sel.addEventListener('change', () => { draft.composition[Number(sel.dataset.i)].unit = sel.value; });
  });
  container.querySelectorAll('.cf-comp-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      if (draft.composition.length > 1) draft.composition.splice(i, 1);
      else draft.composition[0] = emptyCompRow();
      renderConceptDrinkForm(container);
    });
  });
  container.querySelector('#cf-comp-add').addEventListener('click', () => {
    draft.composition.push(emptyCompRow());
    renderConceptDrinkForm(container);
    focusCompIngredient(draft.composition.length - 1);
  });

  container.querySelector('#cf-save').addEventListener('click', () => {
    const errorEl = container.querySelector('#cf-error');
    const showError = msg => { errorEl.textContent = msg; errorEl.hidden = false; errorEl.scrollIntoView({ block: 'nearest' }); };
    draft.name = draft.name.trim();
    if (!draft.name) { showError('Vyplň název drinku.'); return; }
    draft.composition = draft.composition.filter(compRowFilled);
    if (!draft.composition.length) draft.composition = [emptyCompRow()];
    if (draft.status === 'ready') {
      const missing = [];
      if (!draft.composition.some(compRowFilled)) missing.push('složení');
      if (!draft.glass.trim()) missing.push('sklo');
      if (!draft.method.trim()) missing.push('postup');
      if (!draft.garnish.trim()) missing.push('dekoraci');
      if (missing.length) { showError(`Pro stav Ready ještě chybí: ${missing.join(', ')}.`); return; }
    }
    errorEl.hidden = true;
    const category = findCategory(currentYearId, currentCategoryId);
    const idx = category.drinks.findIndex(d => d.id === draft.id);
    if (idx === -1) category.drinks.push(draft);
    else category.drinks[idx] = draft;
    conceptsStage = 'drinks';
    conceptDraft = null;
    editingDrinkId = null;
    saveConcepts();
    renderConcepts();
  });
  const delBtn = container.querySelector('#cf-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (!confirm('Smazat tenhle drink?')) return;
    const category = findCategory(currentYearId, currentCategoryId);
    category.drinks = category.drinks.filter(d => d.id !== draft.id);
    conceptsStage = 'drinks';
    conceptDraft = null;
    editingDrinkId = null;
    saveConcepts();
    renderConcepts();
  });
}

// ── NAVIGATION ──
function showView(view) {
  document.getElementById('list-view').style.display = view === 'recipes' ? 'block' : 'none';
  document.getElementById('bottles-view').style.display = view === 'bottles' ? 'block' : 'none';
  document.getElementById('setup-view').style.display = view === 'setup' ? 'block' : 'none';
  document.getElementById('concepts-view').style.display = view === 'koncepty' ? 'block' : 'none';
  document.getElementById('detail-view').style.display = 'none';
  document.querySelector('.tabs').style.display = view === 'recipes' ? 'flex' : 'none';
  currentView = view;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');

  document.getElementById('search').value = '';
  if (view === 'recipes') renderList();
  if (view === 'bottles') renderBottles();
  if (view === 'setup') renderSetup();
  if (view === 'koncepty') renderConcepts();
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  document.getElementById('search').addEventListener('input', () => {
    if (currentView === 'recipes') renderList();
    if (currentView === 'bottles') renderBottles();
    if (currentView === 'setup') renderSetup();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
});
