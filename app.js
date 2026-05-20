let recipes = [], bottles = [], currentTab = 'all', currentView = 'recipes';

// ── DATA ──
async function loadData() {
  [recipes, bottles] = await Promise.all([
    fetch('data/recipes.json').then(r => r.json()),
    fetch('data/lahve_db.json').then(r => r.json()),
  ]);
  renderList();
}

// ── HELPERS ──
const CAT_LABELS = {
  signatures:     'Signatures AKTUAL',
  old_signatures: 'Staré signatures',
  world_classics: 'World classics',
};
const CAT_ALL_ORDER = ['signatures', 'old_signatures', 'world_classics'];

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── RENDER LIST ──
function renderList() {
  const q = normalize(document.getElementById('search').value.trim());
  const container = document.getElementById('list-view');

  let filtered = recipes.filter(r => {
    const matchCat = q || currentTab === 'all' || r.category === currentTab;
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
      <div class="recipe-card-name">${r.name}<span class="cat-badge cat-${r.category}">${CAT_LABELS[r.category]}</span></div>
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
    <div class="detail-cat"><span class="cat-badge cat-${r.category}">${CAT_LABELS[r.category]}</span></div>

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

// ── NAVIGATION ──
function showView(view) {
  document.getElementById('list-view').style.display = view === 'recipes' ? 'block' : 'none';
  document.getElementById('bottles-view').style.display = view === 'bottles' ? 'block' : 'none';
  document.getElementById('detail-view').style.display = 'none';
  document.querySelector('.tabs').style.display = view === 'recipes' ? 'flex' : 'none';
  currentView = view;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');

  document.getElementById('search').value = '';
  if (view === 'recipes') renderList();
  if (view === 'bottles') renderBottles();
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  document.getElementById('search').addEventListener('input', () => {
    if (currentView === 'recipes') renderList();
    if (currentView === 'bottles') renderBottles();
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.cat;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderList();
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
});
