let recipes = [], bottles = [], currentTab = 'all', currentView = 'recipes';
const CAT_LABELS = {};

// Preferred display order; unknown categories go to the end, alphabetical by label.
const CAT_ORDER = ['signatures', 'negroni', 'nealko', 'old_signatures', 'world_classics'];

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

function renderTabs() {
  const cats = Object.keys(CAT_LABELS).sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return CAT_LABELS[a].localeCompare(CAT_LABELS[b], 'cs');
  });
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

function recipeCard(r) {
  return `<div class="recipe-card" data-id="${r.id}">
    <div>
      <div class="recipe-card-name">${r.name}<span class="cat-badge cat-${r.category}">${CAT_LABELS[r.category]}</span>${(r.tags || []).includes('nealko') && r.category !== 'nealko' ? `<span class="cat-badge cat-nealko">${CAT_LABELS.nealko}</span>` : ''}</div>
      <div class="recipe-card-meta">${r.glass} · ${r.method}</div>
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
    <div class="detail-cat"><span class="cat-badge cat-${r.category}">${CAT_LABELS[r.category]}</span>${(r.tags || []).includes('nealko') && r.category !== 'nealko' ? `<span class="cat-badge cat-nealko">${CAT_LABELS.nealko}</span>` : ''}</div>

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

  const cats = Object.keys(CAT_LABELS).sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return CAT_LABELS[a].localeCompare(CAT_LABELS[b], 'cs');
  });

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

// ── NAVIGATION ──
function showView(view) {
  document.getElementById('list-view').style.display = view === 'recipes' ? 'block' : 'none';
  document.getElementById('bottles-view').style.display = view === 'bottles' ? 'block' : 'none';
  document.getElementById('setup-view').style.display = view === 'setup' ? 'block' : 'none';
  document.getElementById('detail-view').style.display = 'none';
  document.querySelector('.tabs').style.display = view === 'recipes' ? 'flex' : 'none';
  currentView = view;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');

  document.getElementById('search').value = '';
  if (view === 'recipes') renderList();
  if (view === 'bottles') renderBottles();
  if (view === 'setup') renderSetup();
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
