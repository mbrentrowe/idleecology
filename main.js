// main.js — UI layer and entry point for Idle Ecologist Text UI
import { createEngine, shortNumber, DAY_REAL_SECS, YEAR_REAL_SECS, CALENDAR_MONTHS, SEASONS, calendarDate, acreUpgradeCost, workerUpgradeCost, workerMultiplier, STARTING_LAND_ACRES, ESTABLISH_DAYS, LAND_MARKET_INTERVAL_DAYS, ENABLE_RANCH, TOTAL_LAND_ACRES } from './game.js';
import { RESEARCH, RESEARCH_CATEGORIES } from './research.js';
import { ECOREGIONS, WILDLIFE_TYPE_ICONS } from './ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST } from './ranch.js';
import { BIRDS, BIRD_LIST } from './birds.js';
import { INVASIVES, INVASIVE_MAP, findInvasive } from './invasives.js';
import { FarmView } from './farmview.js';
import { ECOREGION_POLYGONS, US_BORDER, CODE_TO_GAME_ID } from './ecomap.js';
import { getRegion, DEFAULT_REGION_ID } from './regions/registry.js';
import { loadMeta, saveMeta, regionSaveKey, regionCollectionScore, checkPrestige, executePrestige, switchRegion, getStartingBonuses, bpGoldMultiplier } from './prestige.js';

// Module-level cache for the full plant list (avoid repeated flatMap across renders)
const ALL_PLANTS = ECOREGIONS.flatMap(e => e.plants);

// ── Farm view canvas (Phase 1) ────────────────────────────────────────────────
let currentFarmView = null;

const _SHEET = { cols: 125, tile: 16, w: 2000, h: 1568 };
function cropIconHtml(gid, size = 24) {
  if (!gid) return '<span class="crop-icon-fallback">?</span>';
  const scale = size / _SHEET.tile;
  const col   = (gid - 1) % _SHEET.cols;
  const row   = Math.floor((gid - 1) / _SHEET.cols);
  const px    = Math.round(col * size);
  const py    = Math.round(row * size);
  const bw    = Math.round(_SHEET.w * scale);
  const bh    = Math.round(_SHEET.h * scale);
  return `<span class="crop-icon" style="width:${size}px;height:${size}px;background-position:-${px}px -${py}px;background-size:${bw}px ${bh}px"></span>`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const meta = loadMeta();
let currentRegionData = getRegion(meta.currentRegionId) ?? getRegion(DEFAULT_REGION_ID);
let engine = createEngine(currentRegionData);

function getCropCatalog() {
  return engine.CROPS;
}

function getCrop(cropId) {
  return getCropCatalog()[cropId] ?? null;
}

function getFarmZoneDefs() {
  return engine.FARM_ZONE_DEFS;
}

function getFarmZoneDef(zoneName) {
  return engine.getFarmZoneDef(zoneName);
}

function getUnlockedCrops() {
  return Object.values(getCropCatalog()).filter(ct => ct.isUnlocked(engine.cropStats));
}

function resetRegionDerivedState() {
  lastZonesFingerprint = '';
  lastRanchFingerprint = '';
  lastResearchFingerprint = '';
  lastGardenFingerprint = '';
  lastCollectionFingerprint = '';
  headerTabQty.clear();
  _knownDiscovered = null;
  _knownUnlockedCrops = null;
  _knownUnlockedRanch = null;
  _knownPlantedSpecies = null;
}

// Load per-region save (or migrated legacy save)
const _regionKey = regionSaveKey(meta.currentRegionId);
const _savedRaw  = localStorage.getItem(_regionKey);
let saved = null;
if (_savedRaw) {
  try { saved = JSON.parse(_savedRaw); } catch { /* start fresh */ }
}
// Fallback: check legacy key for backward compat (first load after migration)
if (!saved) {
  const _legacyRaw = localStorage.getItem('idle-ecologist-text-v1');
  if (_legacyRaw) {
    try { saved = JSON.parse(_legacyRaw); } catch { /* start fresh */ }
  }
}
if (saved) {
  engine.applyState(saved);
  if (saved.savedAt) {
    const offSecs = (Date.now() - saved.savedAt) / 1000;
    if (offSecs > 5) {
      const result = engine.simulateOffline(offSecs);
      showOfflineToast(result, offSecs);
      setTimeout(() => renderAll(), 0);
    }
  }
}

// Apply prestige gold multiplier from meta BP
engine.setPrestigeGoldMult(bpGoldMultiplier(meta.totalBP));

// Region-aware save: write to per-region key + meta
function saveGame() {
  const state = engine.getState();
  localStorage.setItem(regionSaveKey(meta.currentRegionId), JSON.stringify(state));
  saveMeta(meta);
}

const ENGINE_TICK_INTERVAL_MS = 250;
const SAVE_INTERVAL_MS = 10000;

function getNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

let lastEngineTickAt = getNowMs();

function runEngineTick() {
  engine.tick();
  lastEngineTickAt = getNowMs();
}

setInterval(runEngineTick, ENGINE_TICK_INTERVAL_MS);
setInterval(() => saveGame(), SAVE_INTERVAL_MS);

// ── iNaturalist photo cache ───────────────────────────────────────────────────
const INAT_CACHE_KEY = 'inat-photo-cache-v2';
const inatPhotoCache = (() => {
  try { return JSON.parse(localStorage.getItem(INAT_CACHE_KEY) || '{}'); } catch { return {}; }
})();

const INAT_DESC_CACHE_KEY = 'inat-desc-cache-v1';
const inatDescCache = (() => {
  try { return JSON.parse(localStorage.getItem(INAT_DESC_CACHE_KEY) || '{}'); } catch { return {}; }
})();

const INAT_URL_CACHE_KEY = 'inat-url-cache-v1';
const inatUrlCache = (() => {
  try { return JSON.parse(localStorage.getItem(INAT_URL_CACHE_KEY) || '{}'); } catch { return {}; }
})();
const inatTaxonInFlight = new Map();

// Hard-coded photo URLs for crops and ranch animals — bypass API for these
// entirely so they always load instantly and never risk a wrong/null result.
const STATIC_INAT_PHOTOS = {
  // Crops
  'Fragaria \u00d7 ananassa':              'https://inaturalist-open-data.s3.amazonaws.com/photos/74966564/square.jpg',
  'Allium fistulosum':                     'https://static.inaturalist.org/photos/37383663/square.jpeg',
  'Ipomoea batatas':                       'https://inaturalist-open-data.s3.amazonaws.com/photos/64415778/square.jpeg',
  'Abelmoschus esculentus':                'https://static.inaturalist.org/photos/78980367/square.jpg',
  'Arachis hypogaea':                      'https://inaturalist-open-data.s3.amazonaws.com/photos/105026294/square.jpeg',
  'Vaccinium virgatum':                    'https://inaturalist-open-data.s3.amazonaws.com/photos/122618869/square.jpeg',
  'Prunus persica':                        'https://inaturalist-open-data.s3.amazonaws.com/photos/188900677/square.jpeg',
  'Lactuca sativa':                        'https://inaturalist-open-data.s3.amazonaws.com/photos/75790/square.jpg',
  'Brassica oleracea var. acephala':       'https://inaturalist-open-data.s3.amazonaws.com/photos/30542720/square.jpg',
  'Oryza sativa':                          'https://inaturalist-open-data.s3.amazonaws.com/photos/48742632/square.jpg',
  'Brassica oleracea var. italica':        'https://static.inaturalist.org/photos/67937224/square.jpeg',
  'Solanum lycopersicum':                  'https://inaturalist-open-data.s3.amazonaws.com/photos/115407615/square.jpg',
  // Ranch animals
  'Gallus gallus domesticus':              'https://inaturalist-open-data.s3.amazonaws.com/photos/274681663/square.jpg',
  'Anas platyrhynchos domesticus':         'https://inaturalist-open-data.s3.amazonaws.com/photos/175267007/square.jpg',
  'Capra hircus':                          'https://inaturalist-open-data.s3.amazonaws.com/photos/6035700/square.jpeg',
  'Meleagris gallopavo':                   'https://inaturalist-open-data.s3.amazonaws.com/photos/114655826/square.jpg',
  'Sus scrofa domesticus':                 'https://inaturalist-open-data.s3.amazonaws.com/photos/267631414/square.jpeg',
  'Bos taurus':                            'https://inaturalist-open-data.s3.amazonaws.com/photos/29102489/square.jpg',
};

// 1×1 transparent GIF used as placeholder src until the real iNat photo loads
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Render an <img> that loads from the iNat photo cache (or fires an async fetch via loadInatThumbs). */
function inatThumbHtml(sciName, cls, alt = '') {
  if (!sciName) return '';
  const src = STATIC_INAT_PHOTOS[sciName] || inatPhotoCache[sciName] || BLANK_GIF;
  return `<img class="inat-thumb ${cls}" data-sci="${sciName}" src="${src}" alt="${alt}">`;
}

async function _fetchInatTaxon(sciName) {
  // Shared fetch — returns { photoUrl, desc } and populates both caches.
  try {
    const resp = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(sciName)}&per_page=1&is_active=true`);
    const data = await resp.json();
    const taxon = data.results?.[0];
    const url   = taxon?.default_photo?.square_url ?? null;
    const desc  = taxon?.wikipedia_summary ?? null;
    const taxonId = taxon?.id;
    if (url !== null) {
      inatPhotoCache[sciName] = url;
      localStorage.setItem(INAT_CACHE_KEY, JSON.stringify(inatPhotoCache));
    }
    if (desc !== null) {
      inatDescCache[sciName] = desc;
      localStorage.setItem(INAT_DESC_CACHE_KEY, JSON.stringify(inatDescCache));
    }
    if (taxonId) {
      inatUrlCache[sciName] = `https://www.inaturalist.org/taxa/${taxonId}`;
      localStorage.setItem(INAT_URL_CACHE_KEY, JSON.stringify(inatUrlCache));
    }
    return { photoUrl: url, desc };
  } catch {
    return { photoUrl: null, desc: null };
  }
}

function _fetchInatTaxonOnce(sciName) {
  if (!sciName) return Promise.resolve({ photoUrl: null, desc: null });
  if (inatTaxonInFlight.has(sciName)) return inatTaxonInFlight.get(sciName);
  const req = _fetchInatTaxon(sciName).finally(() => inatTaxonInFlight.delete(sciName));
  inatTaxonInFlight.set(sciName, req);
  return req;
}

async function fetchInatPhoto(sciName) {
  if (!sciName) return null;
  if (STATIC_INAT_PHOTOS[sciName]) return STATIC_INAT_PHOTOS[sciName];
  if (sciName in inatPhotoCache) return inatPhotoCache[sciName];
  const { photoUrl } = await _fetchInatTaxonOnce(sciName);
  return photoUrl;
}

async function fetchInatDesc(sciName) {
  if (!sciName) return null;
  if (sciName in inatDescCache) return inatDescCache[sciName];
  const { desc } = await _fetchInatTaxonOnce(sciName);
  return desc;
}

function loadInatThumbs() {
  content.querySelectorAll('img.inat-thumb[data-sci]').forEach(img => {
    const sci = img.dataset.sci;
    if (!sci) return;
    if (STATIC_INAT_PHOTOS[sci]) {
      img.src = STATIC_INAT_PHOTOS[sci];
      return; // static URL already set — no API call needed
    }
    if (sci in inatPhotoCache) {
      const url = inatPhotoCache[sci];
      if (url) { img.src = url; img.style.display = ''; }
    } else {
      fetchInatPhoto(sci).then(url => {
        if (url && img.isConnected) { img.src = url; img.style.display = ''; }
      });
    }
  });
}

function loadInatDescs(root = content) {
  root.querySelectorAll('[data-inat-desc]').forEach(el => {
    const sci = el.dataset.inatDesc;
    if (!sci) return;
    if (sci in inatDescCache) {
      const d = inatDescCache[sci];
      if (d && !el.textContent) { el.textContent = d; el.style.display = ''; }
    } else {
      fetchInatDesc(sci).then(d => {
        if (d && el.isConnected && !el.textContent) { el.textContent = d; el.style.display = ''; }
      });
    }
  });
}

// ── Wake Lock ───────────────────────────────────────────────────────────
let _wakeLock = null;
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch (_) { /* denied or unavailable */ }
}
let _resetting = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquireWakeLock();
  else if (!_resetting) saveGame(); // save immediately when tab goes to background
});
acquireWakeLock();

// ── Tab state ─────────────────────────────────────────────────────────────────
const TABS = ENABLE_RANCH
  ? ['crops', 'ranch', 'research', 'garden', 'land', 'map', 'collection', 'settings']
  : ['crops', 'research', 'garden', 'land', 'map', 'collection', 'settings'];
const HOME_TAB_KEY = 'idle-ecologist-home-tab';
const _savedHomeTab = localStorage.getItem(HOME_TAB_KEY);
let activeTab = (_savedHomeTab && TABS.includes(_savedHomeTab)) ? _savedHomeTab : 'crops';
const CONTROL_QTY_OPTIONS = [1, 5, 10, 25, 'max'];
const HEADER_QTY_TABS = new Set(ENABLE_RANCH ? ['crops', 'ranch', 'garden'] : ['crops', 'garden']);
const headerTabQty = new Map();

// ── In-game tutorial state ───────────────────────────────────────────────────
const TUTORIAL_SEEN_KEY = 'idle-ecologist-tutorial-seen-v1';
const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Idle Ecologist',
    body: 'This tutorial walks you through the core loop: grow crops, harvest for gold, expand your farm, and build biodiversity.',
    focusSelector: '#header',
  },
  {
    title: 'Step 1: Grow and Harvest Crops',
    body: 'In Crops, each unlocked zone grows over time. Harvested yields convert directly into gold, and that gold funds more acres and workers for faster output.',
    tab: 'crops',
    focusSelector: '#content',
  },
  {
    title: 'Step 2: Reclaim Your Land',
    body: 'You\'ve inherited 1,000 acres — but 990 are overrun by invasive species! In the Land tab, view the battle and remove invasives once you\'ve researched how to control them.',
    tab: 'land',
    focusSelector: '#content',
  },
  ...(ENABLE_RANCH ? [{
    title: 'Step 3: Grow with Ranch',
    body: 'Ranch unlocks as you progress and adds passive animal production. Add acres and workers to increase output.',
    tab: 'ranch',
    focusSelector: '#content',
  }] : []),
  {
    title: 'Step 4: Conservation Matters',
    body: 'In Conservation and Native Garden, spend research points and establish native host plants. Biodiversity increases your gold multiplier over time.',
    tab: 'research',
    focusSelector: '#content',
  },
  {
    title: 'Step 5: Track Discoveries',
    body: 'Collection shows discovered species and progression. Notifications highlight new unlocks and discoveries so you can jump to them quickly.',
    tab: 'collection',
    focusSelector: '#notif-btn',
  },
  {
    title: 'You Are Ready',
    body: 'Use Settings to control speed, auto-pilot, and save data. You can replay this tutorial any time with the replay button in Settings.',
    tab: 'settings',
    focusSelector: '#tutorial-replay-btn',
  },
];

const tutorialState = {
  open: false,
  index: 0,
};

let tutorialModal = null;
let tutorialTitleEl = null;
let tutorialBodyEl = null;
let tutorialStepEl = null;
let tutorialBackBtn = null;
let tutorialNextBtn = null;
let tutorialSkipBtn = null;

// ── Tab toggle state ──────────────────────────────────────────────────────────
let hideCompletedResearch = localStorage.getItem('hideCompletedResearch') === 'true';
let showOnlyStartableResearch = localStorage.getItem('showOnlyStartableResearch') === 'true';
let hideCompletedGarden   = localStorage.getItem('hideCompletedGarden')   === 'true';
let hideLockedGarden      = localStorage.getItem('hideLockedGarden')      === 'true';
let hideCompletedLand     = localStorage.getItem('hideCompletedLand')     === 'true';
const collapsedGardenCards = new Set(); // plant IDs currently collapsed

// ── IRL (Real Life) garden / sightings tracker ─────────────────────────────────
const IRL_SAVE_KEY = 'idle-ecologist-irl-v1';
const irlData = (() => {
  try { return JSON.parse(localStorage.getItem(IRL_SAVE_KEY) || '{}'); } catch { return {}; }
})();
// irlData shape: { [key]: { date: ISO string, note?: string } }
// keys: "plant:scarlet_strawberry", "crop:strawberry", "bird:american_robin",
//       "creature:pearl_crescent", "invasive:kudzu", "ranch:chicken"
let showIrlOnly = localStorage.getItem('showIrlOnly') === 'true';

function irlKey(category, id) { return `${category}:${id}`; }
function isIrl(category, id) { return irlKey(category, id) in irlData; }
function toggleIrl(category, id) {
  const key = irlKey(category, id);
  if (key in irlData) { delete irlData[key]; }
  else { irlData[key] = { date: new Date().toISOString() }; }
  localStorage.setItem(IRL_SAVE_KEY, JSON.stringify(irlData));
  renderAll();
}
function irlCount(category) {
  let n = 0;
  for (const k in irlData) if (k.startsWith(category + ':')) n++;
  return n;
}
function irlTotalCount() { return Object.keys(irlData).length; }

/** Build an iNaturalist observation upload URL pre-filled with species name. */
function inatObsUrl(sci) {
  return `https://www.inaturalist.org/observations/upload?taxon_name=${encodeURIComponent(sci)}`;
}

/** Build an IRL action bar for a collection card. */
function irlBarHtml(category, id, sci, label) {
  const marked = isIrl(category, id);
  const dateStr = marked ? new Date(irlData[irlKey(category, id)].date).toLocaleDateString() : '';
  return `<div class="irl-bar${marked ? ' irl-marked' : ''}">
    <button class="irl-toggle-btn${marked ? ' active' : ''}" data-irl-cat="${category}" data-irl-id="${id}">
      ${marked ? '✅' : '☐'} ${label}
    </button>
    ${marked ? `<span class="irl-date">since ${dateStr}</span>` : ''}
    ${marked && sci ? `<a class="irl-inat-btn" href="${inatObsUrl(sci)}" target="_blank" rel="noopener noreferrer" title="Upload your photo to iNaturalist">📸 Log on iNaturalist</a>` : ''}
    ${!marked && sci ? `<span class="irl-hint">Have you ${category === 'bird' || category === 'creature' ? 'spotted' : category === 'invasive' ? 'removed' : 'planted'} this in real life?</span>` : ''}
  </div>`;
}

// ── UI Construction ───────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const DUPLICATE_UI_ACTION_MS = 220;
const recentUiActionTimes = new Map();

function runGuardedUiAction(actionKey, handler) {
  const now = Date.now();
  const lastAt = recentUiActionTimes.get(actionKey) ?? 0;
  if (now - lastAt < DUPLICATE_UI_ACTION_MS) return false;
  recentUiActionTimes.set(actionKey, now);
  handler();
  return true;
}

function bindGuardedClick(button, actionKey, handler) {
  button.addEventListener('click', () => {
    runGuardedUiAction(actionKey, handler);
  });
}

// Header
const header = document.getElementById('header');
const hudRow1       = el('div', 'hud-row hud-row-stats');
const goldEl        = el('span', 'gold-amount');
const bioHeaderEl   = el('span', 'bio-header');
const rpHeaderEl    = el('span', 'rp-header');
const dayEl         = el('span', 'day-counter');
const headerQtyBtn  = el('button', 'hud-qty-btn', 'X1');
headerQtyBtn.type = 'button';
headerQtyBtn.hidden = true;
bindGuardedClick(headerQtyBtn, 'header-qty-cycle', () => {
  if (!tabSupportsHeaderQty(activeTab)) return;
  cycleHeaderQty(activeTab);
  renderAll();
});
const hudInnerLeft  = el('div', 'hud-inner-left');
const hudInnerRow1  = el('div', 'hud-inner-row');
const hudInnerRow2  = el('div', 'hud-inner-row');
[goldEl, bioHeaderEl].forEach(e => hudInnerRow1.appendChild(e));
[rpHeaderEl, dayEl].forEach(e => hudInnerRow2.appendChild(e));
hudInnerLeft.appendChild(hudInnerRow1);
hudInnerLeft.appendChild(hudInnerRow2);
hudRow1.appendChild(hudInnerLeft);
hudRow1.appendChild(headerQtyBtn);
header.appendChild(hudRow1);

// ── Bottom Tab Navigation ─────────────────────────────────────────────────────
const TAB_LABELS = {
  crops: '🌾 Crops',
  ...(ENABLE_RANCH ? { ranch: '🐄 Ranch' } : {}),
  research: '🌱 Conservation',
  garden: '🌿 Native Garden',
  land: '🗺️ Land',
  map: '🧑‍🌾 Map',
  collection: '📚 Collection',
  settings: '⚙️ Settings',
};
const TAB_ICONS  = {
  crops: '🌾',
  ...(ENABLE_RANCH ? { ranch: '🐄' } : {}),
  research: '🌱',
  garden: '🌿',
  land: '🗺️',
  map: '🧑‍🌾',
  collection: '📚',
  settings: '⚙️',
};

function tabDisplayName(tab) {
  return TAB_LABELS[tab]?.split(' ').slice(1).join(' ') || TAB_LABELS[tab] || tab;
}

const tabButtonsEl = document.getElementById('tab-buttons');
const tabBarEl = document.getElementById('tab-bar');
let fabOpen = false;

const tabBtns = {};
const MIN_TAB_PX = 40;       // minimum icon-only tap target
const LABEL_THRESHOLD_PX = 72; // per-tab width to start showing labels
const COMPACT_TAB_PRIORITY = ['crops', 'research', 'garden', 'map'];

const tabOverflowBtn = el('button', 'tab-btn tab-more-btn', '⋯');
tabOverflowBtn.type = 'button';
tabOverflowBtn.setAttribute('aria-label', 'More tabs');
tabOverflowBtn.setAttribute('aria-expanded', 'false');
tabOverflowBtn.hidden = true;

const tabOverflowMenu = el('div', 'tab-overflow-menu');
tabOverflowMenu.hidden = true;
tabBarEl.appendChild(tabOverflowMenu);

function setFabOpen(open) {
  // Navigation no longer uses a menu FAB; keep this as a compatibility no-op
  // because several existing handlers call setFabOpen(false) before tab switches.
  fabOpen = open;
  tabOverflowMenu.hidden = !open;
  tabOverflowMenu.classList.toggle('open', open);
  tabOverflowBtn.classList.toggle('open', open);
  tabOverflowBtn.setAttribute('aria-expanded', String(open));
}

function _setTabBtnText(tab, hasAlert = false) {
  const btn = tabBtns[tab];
  if (!btn) return;
  const iconEl  = btn.querySelector('.tab-btn-icon');
  const labelEl = btn.querySelector('.tab-btn-label');
  const alertEl = btn.querySelector('.tab-btn-alert');
  if (iconEl) iconEl.textContent = TAB_ICONS[tab] ?? '•';
  if (labelEl) labelEl.textContent = tabDisplayName(tab);
  btn.classList.toggle('has-alert', hasAlert);
  if (alertEl) {
    alertEl.textContent = '';
    alertEl.hidden = true;
  }
}

function _renderOverflowTabs(tabs) {
  tabOverflowMenu.innerHTML = '';
  for (const tab of tabs) {
    const item = el('button', 'tab-overflow-item', `${TAB_ICONS[tab]} ${TAB_LABELS[tab]}`);
    item.type = 'button';
    item.dataset.tab = tab;
    item.addEventListener('click', () => {
      activeTab = tab;
      setFabOpen(false);
      renderAll();
    });
    tabOverflowMenu.appendChild(item);
  }
}

function _syncTabLayout() {
  // Measure available width (subtract notif button + overflow button + padding)
  const barStyle = getComputedStyle(tabButtonsEl);
  const barPadL = parseFloat(barStyle.paddingLeft) || 0;
  const barPadR = parseFloat(barStyle.paddingRight) || 0;
  const gap = parseFloat(barStyle.gap) || 4;
  const barWidth = tabButtonsEl.clientWidth - barPadL - barPadR;
  // Reserve space for notification button (always shown) + gap
  const notifW = (notifTabBtn?.offsetWidth || 40) + gap;
  const overflowBtnW = 38 + gap; // width of ⋯ button + gap
  let availableWidth = barWidth - notifW;

  const orderedTabs = [...TABS];
  const totalTabs = orderedTabs.length;

  // Calculate per-tab width if all tabs are visible (no overflow button needed)
  const perTabAll = (availableWidth - gap * (totalTabs - 1)) / totalTabs;

  let visibleTabs, overflowTabs;

  if (perTabAll >= MIN_TAB_PX) {
    // All tabs fit — no overflow needed
    visibleTabs = orderedTabs;
    overflowTabs = [];
  } else {
    // Need overflow — recalculate with overflow button
    const reduced = availableWidth - overflowBtnW;
    // Figure out how many tabs fit at min size
    let maxFit = Math.floor((reduced + gap) / (MIN_TAB_PX + gap));
    maxFit = Math.max(maxFit, 2); // always show at least 2

    // Pick which tabs to show: priority tabs first, ensure active tab is visible
    visibleTabs = COMPACT_TAB_PRIORITY.filter(t => orderedTabs.includes(t)).slice(0, maxFit);
    if (!visibleTabs.includes(activeTab) && orderedTabs.includes(activeTab)) {
      if (visibleTabs.length < maxFit) visibleTabs.push(activeTab);
      else visibleTabs[visibleTabs.length - 1] = activeTab;
    }
    visibleTabs = [...new Set(visibleTabs)];
    overflowTabs = orderedTabs.filter(t => !visibleTabs.includes(t));
  }

  // Show / hide tab buttons
  for (const tab of orderedTabs) tabBtns[tab].hidden = !visibleTabs.includes(tab);

  const showOverflow = overflowTabs.length > 0;
  tabOverflowBtn.hidden = !showOverflow;
  if (!showOverflow) {
    setFabOpen(false);
  } else {
    _renderOverflowTabs(overflowTabs);
    tabOverflowBtn.classList.toggle('active', overflowTabs.includes(activeTab));
  }

  // Show labels if per-visible-tab width is generous enough
  const visibleCount = visibleTabs.length + (showOverflow ? 1 : 0); // +1 for overflow btn
  const perTabVisible = (availableWidth - (showOverflow ? overflowBtnW : 0) - gap * Math.max(visibleCount - 1, 0)) / visibleTabs.length;
  tabButtonsEl.classList.toggle('show-labels', perTabVisible >= LABEL_THRESHOLD_PX);
}

TABS.forEach(tab => {
  const btn = el('button', 'tab-btn tab-btn-main');
  btn.innerHTML = '<span class="tab-btn-icon"></span><span class="tab-btn-label"></span><span class="tab-btn-alert" hidden></span>';
  btn.dataset.tab = tab;
  btn.title = TAB_LABELS[tab];
  btn.setAttribute('aria-label', TAB_LABELS[tab]);
  tabBtns[tab] = btn;
  _setTabBtnText(tab, false);
  btn.addEventListener('click', () => {
    activeTab = tab;
    setFabOpen(false);
    renderAll();
  });
  tabButtonsEl.appendChild(btn);
});

tabButtonsEl.appendChild(tabOverflowBtn);

// Create notification tab button
const notifTabBtn = el('button', 'tab-btn tab-notif-btn');
notifTabBtn.id = 'notif-btn';
notifTabBtn.innerHTML = '<span class="tab-btn-icon">🔔</span><span id="notif-badge"></span>';
notifTabBtn.title = 'Notifications';
notifTabBtn.setAttribute('aria-label', 'View notifications');
notifTabBtn.addEventListener('click', openNotifModal);
tabButtonsEl.appendChild(notifTabBtn);

tabOverflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setFabOpen(!fabOpen);
});

document.addEventListener('click', (e) => {
  if (!fabOpen) return;
  if (tabOverflowBtn.contains(e.target) || tabOverflowMenu.contains(e.target)) return;
  setFabOpen(false);
});

// Initialize tab layout on page load
_syncTabLayout();

window.addEventListener('resize', () => {
  _syncTabLayout();
  tabButtonsEl.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
});

// ── Swipe navigation ──────────────────────────────────────────────────────────
let swipeStartX = 0;
let swipeStartY = 0;
const SWIPE_MIN_DISTANCE = 40;
const SWIPE_MAX_TIME = 500;
let swipeStartTime = 0;

document.addEventListener('touchstart', (e) => {
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  swipeStartTime = Date.now();
}, false);

document.addEventListener('touchend', (e) => {
  const swipeEndX = e.changedTouches[0].clientX;
  const swipeEndY = e.changedTouches[0].clientY;
  const swipeTime = Date.now() - swipeStartTime;
  const swipeDeltaX = swipeEndX - swipeStartX;
  const swipeDeltaY = swipeEndY - swipeStartY;
  
  // Ignore if too slow or if vertical movement was greater than horizontal
  if (swipeTime > SWIPE_MAX_TIME || Math.abs(swipeDeltaY) > Math.abs(swipeDeltaX)) return;
  
  // Ignore small swipes
  if (Math.abs(swipeDeltaX) < SWIPE_MIN_DISTANCE) return;
  
  // Don't swipe if the target is in the tab bar itself
  const target = e.target;
  if (target.closest('#tab-bar')) return;
  
  // Find current tab index
  const currentIndex = TABS.indexOf(activeTab);
  if (currentIndex === -1) return;
  
  let nextIndex = currentIndex;
  // Swipe right = previous tab
  if (swipeDeltaX > 0 && currentIndex > 0) {
    nextIndex = currentIndex - 1;
  }
  // Swipe left = next tab
  else if (swipeDeltaX < 0 && currentIndex < TABS.length - 1) {
    nextIndex = currentIndex + 1;
  } else {
    return;
  }
  
  const nextTab = TABS[nextIndex];
  if (nextTab) {
    activeTab = nextTab;
    setFabOpen(false);
    renderAll();
  }
}, false);

const content = document.getElementById('content');

// ── IRL button delegation ──────────────────────────────────────────────────────
content.addEventListener('click', e => {
  const btn = e.target.closest('.irl-toggle-btn');
  if (!btn) return;
  e.stopPropagation();
  const cat = btn.dataset.irlCat;
  const id  = btn.dataset.irlId;
  if (cat && id) toggleIrl(cat, id);
});

function clearTutorialFocus() {
  document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
}

function syncTutorialFocus() {
  clearTutorialFocus();
  if (!tutorialState.open) return;
  const step = TUTORIAL_STEPS[tutorialState.index];
  if (!step?.focusSelector) return;
  const target = document.querySelector(step.focusSelector);
  if (target) target.classList.add('tutorial-focus');
}

function updateTutorialModal() {
  if (!tutorialModal) return;
  const step = TUTORIAL_STEPS[tutorialState.index];
  if (!step) return;
  tutorialTitleEl.textContent = step.title;
  tutorialBodyEl.textContent = step.body;
  tutorialStepEl.textContent = `Step ${tutorialState.index + 1} / ${TUTORIAL_STEPS.length}`;
  tutorialBackBtn.disabled = tutorialState.index === 0;
  tutorialNextBtn.textContent = tutorialState.index === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';
}

function setTutorialOpen(open) {
  tutorialState.open = open;
  if (tutorialModal) tutorialModal.hidden = !open;
  document.body.classList.toggle('tutorial-open', open);
  if (!open) clearTutorialFocus();
}

function goToTutorialStep(index) {
  tutorialState.index = Math.max(0, Math.min(index, TUTORIAL_STEPS.length - 1));
  const step = TUTORIAL_STEPS[tutorialState.index];
  updateTutorialModal();
  if (step?.tab && activeTab !== step.tab) {
    activeTab = step.tab;
    setFabOpen(false);
    renderAll();
    return;
  }
  syncTutorialFocus();
}

function finishTutorial(markSeen = true) {
  if (markSeen) localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
  setTutorialOpen(false);
}

function startTutorial({ fromSettings = false } = {}) {
  if (!tutorialModal) return;
  if (!fromSettings && localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true') return;
  setFabOpen(false);
  closeNotifModal();
  setTutorialOpen(true);
  goToTutorialStep(0);
}

function buildTutorialModal() {
  tutorialModal = document.createElement('div');
  tutorialModal.id = 'tutorial-modal';
  tutorialModal.hidden = true;
  tutorialModal.innerHTML = `
    <div id="tutorial-backdrop"></div>
    <div id="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div id="tutorial-step"></div>
      <h3 id="tutorial-title"></h3>
      <p id="tutorial-body"></p>
      <div id="tutorial-actions">
        <button id="tutorial-skip" class="action-btn">Skip</button>
        <button id="tutorial-back" class="action-btn">Back</button>
        <button id="tutorial-next" class="action-btn">Next</button>
      </div>
    </div>
  `;
  document.body.appendChild(tutorialModal);

  tutorialTitleEl = tutorialModal.querySelector('#tutorial-title');
  tutorialBodyEl = tutorialModal.querySelector('#tutorial-body');
  tutorialStepEl = tutorialModal.querySelector('#tutorial-step');
  tutorialBackBtn = tutorialModal.querySelector('#tutorial-back');
  tutorialNextBtn = tutorialModal.querySelector('#tutorial-next');
  tutorialSkipBtn = tutorialModal.querySelector('#tutorial-skip');

  tutorialBackBtn.addEventListener('click', () => goToTutorialStep(tutorialState.index - 1));
  tutorialNextBtn.addEventListener('click', () => {
    if (tutorialState.index >= TUTORIAL_STEPS.length - 1) finishTutorial(true);
    else goToTutorialStep(tutorialState.index + 1);
  });
  tutorialSkipBtn.addEventListener('click', () => finishTutorial(true));
  tutorialModal.querySelector('#tutorial-backdrop').addEventListener('click', () => finishTutorial(true));
  document.addEventListener('keydown', e => {
    if (!tutorialState.open) return;
    if (e.key === 'Escape') finishTutorial(true);
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (tutorialState.index >= TUTORIAL_STEPS.length - 1) finishTutorial(true);
      else goToTutorialStep(tutorialState.index + 1);
    }
    if (e.key === 'ArrowLeft' && tutorialState.index > 0) goToTutorialStep(tutorialState.index - 1);
  });
}

buildTutorialModal();

// ── Render dispatcher ─────────────────────────────────────────────────────────
function renderAll() {
  if (!ENABLE_RANCH && activeTab === 'ranch') activeTab = 'crops';
  _syncTabLayout();
  // Tab button active state
  tabButtonsEl.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  // Clean up farm view canvas before wiping DOM
  if (currentFarmView) { currentFarmView.stop(); currentFarmView = null; }
  content.innerHTML = '';
  content.classList.remove('map-mode');
  content.classList.remove('map-mode-overview');
  document.body.dataset.tab = activeTab;
  switch (activeTab) {
    case 'crops':    lastZonesFingerprint = zonesFingerprint(); renderCrops();    break;
    case 'ranch':    renderRanch();    break;
    case 'research':   lastResearchFingerprint = researchFingerprint(); renderResearch();   break;
    case 'garden':     lastGardenFingerprint = gardenFingerprint(); renderGarden();     break;
    case 'land':       renderLand();       break;
    case 'map':        renderMap();        break;
    case 'collection': {
      const collectionScrollTarget = _pendingScrollToCollection;
      if (collectionScrollTarget) collectionFilter = collectionScrollTarget.filter;
      renderCollection();
      const creatureTarget = _pendingScrollToCreature;
      if (creatureTarget) {
        _pendingScrollToCreature = null;
        setTimeout(() => {
          const row = content.querySelector(`[data-ckey="${creatureTarget}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('discovery-highlight');
            setTimeout(() => row.classList.remove('discovery-highlight'), 2000);
          }
        }, 80);
      }
      if (collectionScrollTarget) {
        _pendingScrollToCollection = null;
        setTimeout(() => {
          const target = content.querySelector(`[data-collectionid="${collectionScrollTarget.id}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('discovery-highlight');
            setTimeout(() => target.classList.remove('discovery-highlight'), 2000);
          }
        }, 80);
      }
      break;
    }
    case 'settings':   renderSettings();   break;
  }
  loadInatThumbs();
  loadInatDescs();
  updateHeader();
  if (tutorialState.open) {
    updateTutorialModal();
    syncTutorialFocus();
  }
}

// ── Header update ─────────────────────────────────────────────────────────────
function updateHeader() {
  goldEl.textContent = `🪙 ${shortNumber(engine.gold.amount)} +${shortNumber(engine.getTotalGPS() * engine.gameSpeed)}/s`;

  // Calendar date
  const cal = calendarDate(engine.inGameDay);
  document.body.dataset.season = cal.season.name;
  dayEl.textContent = `📅 ${cal.month.abbr} ${cal.day} Y${cal.year}`;

  // Biosphere score + gold multiplier (combined badge)
  bioHeaderEl.textContent = `🌍 ${engine.getTotalBiosphereScore()}BP ×${engine.getGoldMultiplier().toFixed(2)}`;

  // Research points
  const pts = engine.researchPoints;
  const hintContext = getTabHintContext(pts);
  const _rpPerDay = engine.unlockedFarmZones.size;
  rpHeaderEl.textContent = `🌱 ${shortNumber(pts)}CP +${_rpPerDay}/d`;

  const showHeaderQty = tabSupportsHeaderQty(activeTab);
  headerQtyBtn.hidden = !showHeaderQty;
  if (showHeaderQty) {
    headerQtyBtn.textContent = getHeaderQtyLabel(getHeaderQtyForTab(activeTab));
    headerQtyBtn.title = `Purchase quantity for ${tabDisplayName(activeTab)}`;
    headerQtyBtn.setAttribute('aria-label', `Cycle purchase quantity for ${tabDisplayName(activeTab)}`);
  } else {
    headerQtyBtn.textContent = '';
    headerQtyBtn.title = '';
    headerQtyBtn.setAttribute('aria-label', 'Purchase quantity');
  }

  // Update tab button alert outlines when relevant tabs have affordable items
  _setTabBtnText('research', hintContext.hasAffordableResearch);
  _setTabBtnText('garden', hintContext.hasAffordableGarden && !hintContext.gardenBusy);

  const nextHintsFingerprint = getTabHintsFingerprint(hintContext);
  if (!notifModal.hidden && _notifTab === 'hints' && nextHintsFingerprint !== _lastHintsFingerprint) {
    _lastHintsFingerprint = nextHintsFingerprint;
    _buildNotifList();
  }
}

// ── Duration formatter (real seconds) ────────────────────────────────────────
function fmtDur(secs) {
  if (secs < 60)   return `${secs.toFixed(1)}s`;
  if (secs < 3600) { const m = Math.floor(secs / 60), s = Math.round(secs % 60); return s ? `${m}m ${s}s` : `${m}m`; }
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── Duration formatter (in-game days) ─────────────────────────────────────────
function fmtDays(days) {
  if (days < 1) return '< 1 day';
  const d = Math.round(days);
  if (d < 365) return `${d} day${d !== 1 ? 's' : ''}`;
  const yrs = Math.floor(d / 365);
  const rem = d % 365;
  if (rem === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${rem} day${rem !== 1 ? 's' : ''}`;
}

/** Generate an iNaturalist taxa URL — uses cached direct link if available, else search. */
function inatUrl(sci) {
  if (sci in inatUrlCache) return inatUrlCache[sci];
  return `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(sci)}`;
}

/** Generate a Wikipedia URL for a scientific name. */
function wikiUrl(sci) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(sci.replace(/ /g, '_'))}`;
}

/** Generate an EasyScape species page URL. */
function easyscapeUrl(sci, name) {
  const sciSlug = sci.replace(/ /g, '-');
  const nameSlug = name.replace(/ /g, '-');
  return `https://easyscape.com/species/${encodeURIComponent(sciSlug)}(${encodeURIComponent(nameSlug)})`;
}

/** Generate external reference links (iNaturalist + Wikipedia + EasyScape) for a scientific name. */
function speciesReferenceLinksHtml(sci, name) {
  if (!sci) return '';
  let html = `<a class="species-ext-link inat-link" href="${inatUrl(sci)}" target="_blank" rel="noopener noreferrer" title="View on iNaturalist">iNaturalist ↗</a>`
    + ` <a class="species-ext-link wiki-link" href="${wikiUrl(sci)}" target="_blank" rel="noopener noreferrer" title="View on Wikipedia">Wiki ↗</a>`;
  if (name) {
    html += ` <a class="species-ext-link easyscape-link" href="${easyscapeUrl(sci, name)}" target="_blank" rel="noopener noreferrer" title="View on EasyScape — care info &amp; buy near you">EasyScape ↗</a>`;
  }
  return html;
}

/** Generate external reference links plus the scientific name for inline contexts. */
function speciesLinksHtml(sci, name) {
  if (!sci) return '';
  return `<span class="garden-plant-sci">${sci}</span> ${speciesReferenceLinksHtml(sci, name)}`;
}

// ── Time-to-afford helper ────────────────────────────────────────────────────
function timeToUnlock(cost) {
  const needed = cost - engine.gold.amount;
  if (needed <= 0) return null;
  const gps = engine.getTotalGPS() * engine.gameSpeed;
  if (gps <= 0) return null;
  const secs = needed / gps;
  if (secs < 60)   return `~${Math.ceil(secs)}s`;
  if (secs < 3600) return `~${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`;
  return `~${(secs / 3600).toFixed(1)}h`;
}

function formatCropMilestoneText(status, { showProgress = true } = {}) {
  const cropName = status.crop?.name ?? status.cropId;
  if (!showProgress) return `Grow ${shortNumber(status.required)} ${cropName}`;
  return `Grow ${shortNumber(status.required)} ${cropName} (${shortNumber(status.current)}/${shortNumber(status.required)})`;
}

function cropMilestoneChipHtml(status, { showProgress = true } = {}) {
  return `<span class="research-req${status.met ? ' met' : ''}">${status.met ? '✅' : '🌾'} ${formatCropMilestoneText(status, { showProgress })}</span>`;
}

function getCropMasterySummary(cropId) {
  const mastery = engine.getCropMasteryStatus(cropId);
  const detail = mastery.nextThreshold == null
    ? 'All crop mastery tiers complete.'
    : `${shortNumber(mastery.grown)}/${shortNumber(mastery.nextThreshold)} harvested toward tier ${mastery.level + 1}.`;

  return {
    ...mastery,
    label: mastery.nextThreshold == null
      ? `Tier ${mastery.level}/${mastery.maxLevel} · complete`
      : `Tier ${mastery.level}/${mastery.maxLevel} · next at ${shortNumber(mastery.nextThreshold)}`,
    detail,
  };
}

function cropMasteryFingerprint(step = 25) {
  return Object.values(getCropCatalog())
    .map(crop => {
      const mastery = engine.getCropMasteryStatus(crop.id);
      const progressBucket = mastery.nextThreshold == null ? mastery.level : Math.floor(mastery.grown / step);
      return `${crop.id}:${mastery.level}:${progressBucket}`;
    })
    .join(',');
}

// ── Bulk purchase helpers ────────────────────────────────────────────────────
function bulkCost(costFn, current, qty) {
  let total = 0;
  for (let i = 0; i < qty; i++) total += costFn(current + i);
  return total;
}
function maxAffordableCount(costFn, current, budget) {
  let total = 0, count = 0;
  while (count < 10000) {
    const next = costFn(current + count);
    if (next <= 0 || total + next > budget) break;
    total += next;
    count++;
  }
  return count;
}

function tabSupportsHeaderQty(tab) {
  return HEADER_QTY_TABS.has(tab);
}

function getHeaderQtyForTab(tab = activeTab) {
  return tabSupportsHeaderQty(tab) ? (headerTabQty.get(tab) ?? 1) : 1;
}

function cycleHeaderQty(tab = activeTab) {
  if (!tabSupportsHeaderQty(tab)) return 1;
  const current = getHeaderQtyForTab(tab);
  const idx = CONTROL_QTY_OPTIONS.indexOf(current);
  const next = CONTROL_QTY_OPTIONS[(idx + 1) % CONTROL_QTY_OPTIONS.length];
  if (next === 1) headerTabQty.delete(tab);
  else headerTabQty.set(tab, next);
  return next;
}

function getHeaderQtyLabel(qty) {
  return qty === 'max' ? 'XMax' : `X${qty}`;
}

function resolveActionQty(qty, available) {
  const safeAvailable = Math.max(0, available);
  return qty === 'max' ? safeAvailable : Math.min(qty, safeAvailable);
}

function resolveWorkerQty(qty, costFn, current, budget) {
  return qty === 'max'
    ? maxAffordableCount(costFn, current, budget)
    : qty;
}

function getCompactAcreRemoveLabel(qty) {
  return `−${shortNumber(Math.max(1, qty))}`;
}

function getCompactAcreAddLabel(qty, freeAcres) {
  if (freeAcres < 1) return 'No free';
  return `+${shortNumber(Math.max(1, qty))} (${shortNumber(freeAcres)} free)`;
}

function getCompactWorkerLabel(qty, totalCost) {
  return qty > 0
    ? `+${shortNumber(qty)} — 🪙 ${shortNumber(totalCost)}`
    : '+1 — can\'t afford';
}

function getCompactGardenEstablishLabel(qty, plantCost, freeAcres) {
  return `🌱 +${shortNumber(Math.max(1, qty))} (${shortNumber(Math.max(0, freeAcres))} free) — ${shortNumber(plantCost)} CP`;
}

function getZoneControlSummaryHtml(acres, workers, workerMult) {
  return `
    <span class="zone-control-summary-item">Acres: <strong>${shortNumber(acres)}</strong></span>
    <span class="zone-control-summary-item is-workers">Workers: <strong>${shortNumber(workers)}</strong> <span class="zone-control-summary-mult">(${workerMult.toFixed(1)}×)</span></span>
  `;
}

function getTabHintContext(pts = engine.researchPoints) {
  const completedResearch = engine.completedResearch;
  const activeResearchIds = new Set(engine.researchSlots.map(slot => slot.id));
  const hasOpenResearchSlot = engine.researchSlots.length < engine.researchSlotCount;
  const hasAffordableResearch = hasOpenResearchSlot && RESEARCH.some(project => (
    !completedResearch.has(project.id)
    && !activeResearchIds.has(project.id)
    && engine.getResearchUnlockStatus(project).unlocked
    && pts >= project.cost
  ));

  const plantedSpecies = engine.plantedSpecies;
  const activePlantingId = engine.activePlantingId;
  const hasAffordableGarden = ECOREGIONS.some(eco =>
    eco.plants.some(plant => (
      !plantedSpecies.has(plant.id)
      && plant.id !== activePlantingId
      && engine.getPlantUnlockStatus(plant).unlocked
      && pts >= plant.cost
    ))
  );

  return {
    gardenBusy: !!activePlantingId || engine.nativeEstablishQueue.length > 0,
    hasAffordableGarden,
    hasAffordableResearch,
  };
}

function getTabHintState(tab, { hasAffordableResearch = false, hasAffordableGarden = false, gardenBusy = false } = {}) {
  const freeAcres = engine.getFreeAcres();
  switch (tab) {
    case 'crops': {
      const nextTarget = getNextCropMasteryTarget();
      if (nextTarget) {
        const { crop, mastery, remaining, unlocked } = nextTarget;
        if (!unlocked) {
          return {
            tone: 'info',
            text: `${crop.name} is the next crop mastery lane. Unlock its zone to start Tier ${mastery.level + 1} at ${shortNumber(mastery.nextThreshold)} grown.`,
          };
        }

        const masteryText = `${crop.name}: ${shortNumber(remaining)} more harvested for Tier ${mastery.level + 1} (${shortNumber(mastery.grown)}/${shortNumber(mastery.nextThreshold)}).`;
        if (freeAcres < 1) {
          return {
            tone: 'warn',
            text: `${masteryText} Land is capped, so clear invasive acres if you need room to keep pushing it.`,
          };
        }
        return { tone: 'grow', text: masteryText };
      }

      if (freeAcres < 1) {
        return { tone: 'warn', text: 'All crop mastery tiers are complete. Free invasive acres to keep scaling output.' };
      }
      return { tone: 'ready', text: 'All crop mastery tiers are complete. Crop pressure now shifts to research, native plants, and collection.' };
    }
    case 'research':
      if (hasAffordableResearch) return { tone: 'ready', text: 'A conservation project is affordable right now.' };
      if (engine.researchSlots.length > 0) return { tone: 'grow', text: `${engine.researchSlots.length} active project${engine.researchSlots.length !== 1 ? 's are' : ' is'} compounding.` };
      return { tone: 'info', text: 'Unlock more farm zones and native species to raise CP flow.' };
    case 'garden': {
      const queueDepth = engine.nativeEstablishQueue.length + (engine.activePlantingId ? 1 : 0);
      if (hasAffordableGarden && !gardenBusy) return { tone: 'ready', text: 'A native planting is ready to establish.' };
      if (queueDepth > 0) return { tone: 'grow', text: `${queueDepth} native planting${queueDepth !== 1 ? 's are' : ' is'} moving through the queue.` };
      return { tone: 'info', text: 'Native plantings turn ecology facts into long-term biosphere gains.' };
    }
    case 'land':
      return freeAcres < 1
        ? { tone: 'warn', text: 'Your farm is land-locked. Clear invasive acreage to keep scaling output.' }
        : { tone: 'info', text: `${freeAcres} free acre${freeAcres !== 1 ? 's' : ''} ready for crops, ranching, or native habitat.` };
    case 'map':
      return { tone: 'info', text: 'Map view connects your farm to the broader region and habitat layers.' };
    case 'collection':
      return { tone: 'grow', text: 'Track discoveries here and use them to deepen the game loop, not leave it.' };
    case 'settings':
      return { tone: 'info', text: 'Tune pacing, automation, and save behavior without changing core progress.' };
    default:
      return { tone: 'info', text: 'Keep the ecosystem growing while balancing income, land, and biodiversity.' };
  }
}

function getAllTabHintStates(context = getTabHintContext()) {
  const excludedTabs = new Set(['map', 'collection', 'settings']);
  return TABS.map(tab => ({
    icon: TAB_ICONS[tab] ?? '•',
    label: tabDisplayName(tab),
    tab,
    ...getTabHintState(tab, context),
  })).filter(hint => !excludedTabs.has(hint.tab));
}

function getTabHintsFingerprint(context = getTabHintContext()) {
  return `${activeTab}|${getAllTabHintStates(context)
    .map(hint => `${hint.tab}:${hint.tone}:${hint.text}`)
    .join('|')}`;
}

function getNextCropMasteryTarget() {
  const zoneByCropId = new Map(getFarmZoneDefs().map(def => [def.cropId, def]));
  const candidates = Object.values(getCropCatalog())
    .map(crop => {
      const mastery = engine.getCropMasteryStatus(crop.id);
      if (mastery.nextThreshold == null) return null;
      const zoneDef = zoneByCropId.get(crop.id) ?? null;
      const unlocked = zoneDef ? engine.unlockedFarmZones.has(zoneDef.name) : false;
      return {
        crop,
        mastery,
        remaining: Math.max(0, mastery.nextThreshold - mastery.grown),
        unlocked,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.remaining !== b.remaining) return a.remaining - b.remaining;
      if (a.mastery.nextThreshold !== b.mastery.nextThreshold) return a.mastery.nextThreshold - b.mastery.nextThreshold;
      return a.crop.name.localeCompare(b.crop.name);
    });

  return candidates[0] ?? null;
}

function getPlantById(plantId) {
  return ALL_PLANTS.find(plant => plant.id === plantId) ?? null;
}

function getGardenDashboardState() {
  const establishedSpecies = ALL_PLANTS.filter(plant => (engine.plantedSpeciesAcres.get(plant.id) ?? 0) > 0);
  const unlockedPlants = ALL_PLANTS.filter(plant => engine.getPlantUnlockStatus(plant).unlocked);
  const queuedSpecies = new Set(engine.nativeEstablishQueue.map(item => item.plantId));
  if (engine.activePlantingId) queuedSpecies.add(engine.activePlantingId);

  const establishedAcres = Array.from(engine.plantedSpeciesAcres.values()).reduce((sum, acres) => sum + acres, 0);
  const freeAcres = engine.getFreeAcres();
  const queueDepth = engine.nativeEstablishQueue.length + (engine.activePlantingId ? 1 : 0);
  const affordableUnlockedCount = unlockedPlants.reduce((count, plant) => {
    const established = (engine.plantedSpeciesAcres.get(plant.id) ?? 0) > 0;
    return count + (!established && !queuedSpecies.has(plant.id) && engine.researchPoints >= plant.cost ? 1 : 0);
  }, 0);
  const completedEcoregions = ECOREGIONS.reduce((count, region) => (
    count + (region.plants.every(plant => (engine.plantedSpeciesAcres.get(plant.id) ?? 0) > 0) ? 1 : 0)
  ), 0);

  let focus;
  if (queueDepth > 0) {
    const nextPlant = getPlantById(engine.nativeEstablishQueue[0]?.plantId ?? engine.activePlantingId);
    focus = {
      kicker: 'Propagation',
      title: nextPlant ? `${nextPlant.name} is moving through establishment` : 'Native establishment queue is active',
      body: queueDepth > 1
        ? `${queueDepth} plantings are in motion. Keep spare acreage open so the queue can keep widening habitat.`
        : 'This planting is converting conservation points into permanent habitat and biosphere score.',
      tone: 'grow',
    };
  } else if (freeAcres < 1) {
    focus = {
      kicker: 'Habitat cap',
      title: 'All acreage is already spoken for',
      body: 'Land is the bottleneck. Reclaim invasive acreage if you want to expand native habitat further.',
      tone: 'warn',
    };
  } else if (affordableUnlockedCount > 0) {
    focus = {
      kicker: 'Ready to plant',
      title: `${affordableUnlockedCount} unlocked native species can be established now`,
      body: 'Use open acres while you have them so idle land turns into biodiversity instead of sitting empty.',
      tone: 'ready',
    };
  } else if (establishedSpecies.length >= unlockedPlants.length && unlockedPlants.length > 0) {
    focus = {
      kicker: 'Deepen habitat',
      title: 'All unlocked native species are already represented',
      body: 'Add acres to the strongest host plants to intensify biosphere gains and attract more wildlife.',
      tone: 'info',
    };
  } else if (unlockedPlants.length > establishedSpecies.length) {
    const gap = unlockedPlants.length - establishedSpecies.length;
    focus = {
      kicker: 'Conservation pressure',
      title: `${gap} unlocked species still need CP or acreage`,
      body: 'Research opened the door. The next step is banking enough conservation points to start planting.',
      tone: 'info',
    };
  } else {
    focus = {
      kicker: 'First habitat',
      title: 'Native plants turn ecology data into progression',
      body: 'Establishing host plants raises biosphere score, unlocks wildlife support, and makes the learning layer part of normal play.',
      tone: 'info',
    };
  }

  return {
    affordableUnlockedCount,
    completedEcoregions,
    establishedAcres,
    establishedSpeciesCount: establishedSpecies.length,
    freeAcres,
    focus,
    gardenBio: engine.getGardenBiosphereScore(),
    queueDepth,
    queuedSpeciesCount: queuedSpecies.size,
    totalPlantCount: ALL_PLANTS.length,
    unlockedSpeciesCount: unlockedPlants.length,
  };
}

function renderGardenOperationCard() {
  const queuedItem = engine.nativeEstablishQueue[0] ?? null;
  const legacyPlant = getPlantById(engine.activePlantingId);

  let plant = null;
  let progressSource = '';
  let pct = 0;
  let remaining = 0;
  let footerText = '';

  if (queuedItem) {
    plant = getPlantById(queuedItem.plantId);
    progressSource = 'queue';
    const totalSecs = ESTABLISH_DAYS * DAY_REAL_SECS;
    pct = Math.min(100, Math.round(engine.nativeEstablishTimer / totalSecs * 100));
    remaining = Math.max(0, (totalSecs - engine.nativeEstablishTimer) / DAY_REAL_SECS);
    footerText = `${pct}% established • ${engine.nativeEstablishQueue.length} in queue${legacyPlant ? ' • legacy planting also active' : ''}`;
  } else if (legacyPlant) {
    plant = legacyPlant;
    progressSource = 'legacy';
    pct = Math.min(100, Math.round(engine.activePlantingTimer / legacyPlant.duration * 100));
    remaining = Math.max(0, legacyPlant.duration - engine.activePlantingTimer);
    footerText = `${pct}% established • legacy planting`;
  } else {
    return null;
  }

  const activeCard = el('div', 'research-active-card garden-active-card garden-operation-card');
  activeCard.dataset.progressSource = progressSource;
  activeCard.innerHTML = `
    <div class="research-active-header">
      <span class="research-active-icon">${plant?.icon ?? '🌿'}</span>
      <span class="research-active-name">${progressSource === 'queue'
        ? `Establishing ${plant?.name ?? 'native planting'}`
        : `Legacy establishment: ${plant?.name ?? 'native planting'}`}</span>
      <span class="research-active-time">${fmtDays(remaining)} remaining</span>
    </div>
    <div class="research-progress-track">
      <div class="research-progress-fill garden-progress" style="width:${pct}%"></div>
    </div>
    <div class="research-active-footer">
      <span class="research-active-pct">${footerText}</span>
      ${progressSource === 'legacy'
        ? '<button class="action-btn danger research-cancel-btn">✕ Cancel</button>'
        : '<span class="garden-operation-note">CP → permanent habitat</span>'}
    </div>
  `;

  if (progressSource === 'legacy') {
    activeCard.querySelector('.research-cancel-btn').addEventListener('click', () => {
      engine.cancelPlanting();
      renderAll();
    });
  }

  return activeCard;
}

function updateGardenOperationCard() {
  if (activeTab !== 'garden') return;
  const card = content.querySelector('.garden-operation-card');
  if (!card) return;

  const progressSource = card.dataset.progressSource;
  let pct = 0;
  let remaining = 0;
  let titleText = '';
  let footerText = '';

  if (progressSource === 'queue' && engine.nativeEstablishQueue.length > 0) {
    const plant = getPlantById(engine.nativeEstablishQueue[0].plantId);
    const totalSecs = ESTABLISH_DAYS * DAY_REAL_SECS;
    pct = Math.min(100, Math.round(engine.nativeEstablishTimer / totalSecs * 100));
    remaining = Math.max(0, (totalSecs - engine.nativeEstablishTimer) / DAY_REAL_SECS);
    titleText = `Establishing ${plant?.name ?? 'native planting'}`;
    footerText = `${pct}% established • ${engine.nativeEstablishQueue.length} in queue${engine.activePlantingId ? ' • legacy planting also active' : ''}`;
  } else if (progressSource === 'legacy' && engine.activePlantingId) {
    const plant = getPlantById(engine.activePlantingId);
    if (!plant) return;
    pct = Math.min(100, Math.round(engine.activePlantingTimer / plant.duration * 100));
    remaining = Math.max(0, plant.duration - engine.activePlantingTimer);
    titleText = `Legacy establishment: ${plant.name}`;
    footerText = `${pct}% established • legacy planting`;
  } else {
    return;
  }

  const fill = card.querySelector('.garden-progress');
  if (fill) fill.style.width = `${pct}%`;
  const nameEl = card.querySelector('.research-active-name');
  if (nameEl) nameEl.textContent = titleText;
  const timeEl = card.querySelector('.research-active-time');
  if (timeEl) timeEl.textContent = `${fmtDays(remaining)} remaining`;
  const pctEl = card.querySelector('.research-active-pct');
  if (pctEl) pctEl.textContent = footerText;
}

const CROP_PROGRESS_RING_RADIUS = 7;
const CROP_PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * CROP_PROGRESS_RING_RADIUS;

function getInterpolatedCropProgress(instance, workerMult = 1, nowMs = getNowMs()) {
  const cropType = instance?.cropType;
  if (!cropType) return 0;

  const maxPhase = Math.max(0, cropType.growthPhaseGIDs.length - 1);
  if (maxPhase <= 0) return 0;
  if (instance.isFullyGrown) return 1;

  const baseProgress = Math.max(0, Math.min(1, instance.overallProgress ?? 0));
  if (engine.gamePaused) return baseProgress;

  const elapsedSinceTick = Math.max(0, Math.min(ENGINE_TICK_INTERVAL_MS, nowMs - lastEngineTickAt));
  const predictedAdvance = (elapsedSinceTick / ENGINE_TICK_INTERVAL_MS) * engine.gameSpeed * Math.max(workerMult, 0);

  let predictedPhase = instance.phase ?? 0;
  let predictedTimer = (instance.timer ?? 0) + predictedAdvance;
  while (predictedTimer >= cropType.growthTimePerPhase && predictedPhase < maxPhase) {
    predictedTimer -= cropType.growthTimePerPhase;
    predictedPhase += 1;
  }

  const phaseProgress = predictedPhase >= maxPhase
    ? 1
    : predictedTimer / Math.max(cropType.growthTimePerPhase, 0.001);
  const progress = (predictedPhase + phaseProgress) / maxPhase;
  return Math.max(baseProgress, Math.min(1, progress));
}

function getCropProgressState(instance, workerMult = 1, nowMs = getNowMs()) {
  const cropType = instance?.cropType;
  if (!cropType) {
    return {
      isReady: false,
      stateClass: 'is-growing',
      progressValue: '0',
      titleText: 'Crop growth unavailable',
    };
  }

  if (instance.isFullyGrown) {
    return {
      isReady: true,
      stateClass: 'is-ready',
      progressValue: '1',
      titleText: `${cropType.name} ready to harvest`,
    };
  }

  const progress = Math.max(0, Math.min(0.9995, getInterpolatedCropProgress(instance, workerMult, nowMs)));
  const progressPct = Math.min(99, Math.round(progress * 100));
  return {
    isReady: false,
    stateClass: 'is-growing',
    progressValue: progress.toFixed(4),
    titleText: `${cropType.name} ${progressPct}% grown`,
  };
}

function ensureCropProgressIndicator(ringEl) {
  if (!ringEl || ringEl.dataset.initialized === 'true') return;

  ringEl.innerHTML = `
    <svg class="crop-progress-svg" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle class="crop-progress-track" cx="9" cy="9" r="${CROP_PROGRESS_RING_RADIUS}"></circle>
      <circle class="crop-progress-stroke" cx="9" cy="9" r="${CROP_PROGRESS_RING_RADIUS}"></circle>
    </svg>
    <span class="crop-progress-core" aria-hidden="true"></span>
    <span class="crop-progress-ready-mark" aria-hidden="true">✓</span>
  `;

  const strokeEl = ringEl.querySelector('.crop-progress-stroke');
  if (strokeEl) {
    const ringLength = CROP_PROGRESS_RING_CIRCUMFERENCE.toFixed(3);
    strokeEl.style.strokeDasharray = ringLength;
    strokeEl.style.strokeDashoffset = ringLength;
  }

  ringEl.dataset.initialized = 'true';
}

function applyCropProgressIndicator(ringEl, progressState) {
  if (!ringEl || !progressState) return;

  ensureCropProgressIndicator(ringEl);

  if (ringEl.dataset.state !== progressState.stateClass) {
    ringEl.className = `crop-progress-ring ${progressState.stateClass}`;
    ringEl.dataset.state = progressState.stateClass;
  }

  const progress = Math.max(0, Math.min(1, Number(progressState.progressValue) || 0));
  const dashOffset = ((1 - progress) * CROP_PROGRESS_RING_CIRCUMFERENCE).toFixed(3);
  const strokeEl = ringEl.querySelector('.crop-progress-stroke');
  if (strokeEl && strokeEl.dataset.dashOffset !== dashOffset) {
    strokeEl.style.strokeDashoffset = dashOffset;
    strokeEl.dataset.dashOffset = dashOffset;
  }

  if (ringEl.getAttribute('role') !== 'img') {
    ringEl.setAttribute('role', 'img');
  }

  if (ringEl.getAttribute('aria-label') !== progressState.titleText) {
    ringEl.setAttribute('aria-label', progressState.titleText);
  }
}

// ── CROPS TAB ────────────────────────────────────────────────────────────────
function renderCrops() {
  const sortedDefs = [...getFarmZoneDefs()].sort((a, b) => {
    const aUnlocked = engine.unlockedFarmZones.has(a.name);
    const bUnlocked = engine.unlockedFarmZones.has(b.name);
    if (aUnlocked === bUnlocked) return 0;
    return aUnlocked ? -1 : 1;
  });

  sortedDefs.forEach(def => {
    const unlocked = engine.unlockedFarmZones.has(def.name);
    const card = el('div', `zone-card${unlocked ? '' : ' locked'}`);
    card.dataset.zone = def.name;

    if (!unlocked) {
      const boundCrop = getCrop(def.cropId);
      const lockRow = el('div', 'lock-row');
      lockRow.innerHTML = `
        <span class="lock-icon">🔒</span>
        ${boundCrop?.sciName ? inatThumbHtml(boundCrop.sciName, 'lock-thumb', boundCrop.name) : ''}
        <span class="zone-name">${boundCrop?.name ?? def.cropId}</span>
      `;
      card.appendChild(lockRow);
      if (boundCrop?.unlockCriteria) {
        const { totalHarvested: required } = boundCrop.unlockCriteria;
        const harvestedNow = engine.getTotalCropsHarvested();
        const harvestedPct = Math.min(100, Math.round(harvestedNow / required * 100));
        const reqsEl  = el('div', 'unlock-reqs');
        reqsEl.innerHTML = `
          <span class="unlock-req">${shortNumber(harvestedNow)}<span class="next-sep">/</span>${shortNumber(required)} total crops harvested
            <span class="next-mini-bar"><span class="next-mini-fill" style="width:${harvestedPct}%"></span></span>
          </span>
        `;
        card.appendChild(reqsEl);
      }
    } else {
      const instance = engine.zoneCrops.get(def.name);
      const ct       = instance?.cropType;
      card.classList.add('zone-live');

      // Top row: iNat photo + crop name/sci meta + GPS
      const topRow = el('div', 'zone-top-row');
      const _wm  = workerMultiplier(engine.zoneWorkers.get(def.name) ?? 1);
      const _cyc = ct ? ct.totalGrowthTime / (engine.gameSpeed * _wm * 4) : 0;
      const progressState = getCropProgressState(instance, _wm);
      const harvestGold = ct
        ? ct.yieldGold * engine.getCropYieldMultiplier() * engine.getGoldMultiplier() * (engine.zoneAcres.get(def.name) ?? 0)
        : 0;
      topRow.innerHTML = `
        ${ct?.sciName ? inatThumbHtml(ct.sciName, 'zone-thumb', ct.name) : ''}
        <div class="zone-name-meta">
          <div class="zone-title-row">
            <span class="crop-progress-ring"></span>
            <span class="zone-name">${ct?.name ?? '—'}</span>
          </div>
          <span class="zone-meta">${ct?.sciName ? `<em>${ct.sciName}</em> · ` : ''}${engine.zoneAcres.get(def.name) ?? 0} acres${ct ? ` · ⏱ ${fmtDur(_cyc)}` : ''}${ct ? ` · 🪙 ${shortNumber(ct.yieldGold)}/acre` : ''}</span>
        </div>
        <span class="zone-gps">🪙 ${shortNumber(harvestGold)} / harvest</span>
      `;
      applyCropProgressIndicator(topRow.querySelector('.crop-progress-ring'), progressState);
      card.classList.toggle('zone-ready', progressState.isReady);
      card.appendChild(topRow);
      if (ct) {
        const cropInfoBtn = el('button', 'zone-info-btn', 'ℹ️');
        cropInfoBtn.title = 'View in Collection';
        cropInfoBtn.addEventListener('click', e => { e.stopPropagation(); _goToCollection('crops', ct.id); });
        topRow.appendChild(cropInfoBtn);
      }

      // Acre allocation row (land pool – no gold cost)
      const currentAcres = engine.zoneAcres.get(def.name) ?? 0;
      const freeAcres    = engine.getFreeAcres();
      const controlQty   = getHeaderQtyForTab('crops');
      const qtyAcre      = resolveActionQty(controlQty, freeAcres);
      const qtyRemoveAcre = resolveActionQty(controlQty, currentAcres);
      const currentWorkers   = engine.zoneWorkers.get(def.name) ?? 1;
      const workerCostFn     = n => workerUpgradeCost(def, n);
      const qtyWorker        = resolveWorkerQty(controlQty, workerCostFn, currentWorkers, engine.gold.amount);
      const workerTotalCost  = qtyWorker > 0 ? bulkCost(workerCostFn, currentWorkers, qtyWorker) : 0;
      const canAffordWorkers = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;
      const mult             = workerMultiplier(currentWorkers);

      const summaryRow = el('div', 'zone-control-summary');
      summaryRow.innerHTML = getZoneControlSummaryHtml(currentAcres, currentWorkers, mult);
      card.appendChild(summaryRow);

      const acreRow = el('div', 'acre-upgrade-row');

      const canAllocate = freeAcres >= 1;
      const canRemove   = currentAcres > 0;
      let removeBtn = null;
      if (canRemove) {
        removeBtn = el('button', 'buy-btn acre-btn danger-btn', getCompactAcreRemoveLabel(qtyRemoveAcre));
        bindGuardedClick(removeBtn, `crop-remove:${def.name}`, () => {
          for (let i = 0; i < qtyRemoveAcre; i++) engine.deallocateCropAcre(def.name);
          renderAll();
        });
      }
      const allocBtn = el('button', `buy-btn acre-btn${canAllocate ? '' : ' disabled'}`, getCompactAcreAddLabel(qtyAcre, freeAcres));
      allocBtn.dataset.zoneAlloc = def.name;
      allocBtn.disabled = !canAllocate;
      if (canAllocate) {
        bindGuardedClick(allocBtn, `crop-alloc:${def.name}`, () => {
          engine.queueCropAcre(def.name, qtyAcre);
          renderAll();
        });
      }
      acreRow.appendChild(allocBtn);
      if (removeBtn) acreRow.appendChild(removeBtn);
      // Worker upgrade button shares the same action row as acres
      const wBtn = el('button', `buy-btn acre-btn worker-btn${canAffordWorkers ? '' : ' disabled'}`, getCompactWorkerLabel(qtyWorker, workerTotalCost));
      wBtn.disabled = !canAffordWorkers;
      wBtn.dataset.zoneNameW = def.name;
      if (canAffordWorkers) {
        bindGuardedClick(wBtn, `crop-worker:${def.name}`, () => {
          for (let i = 0; i < qtyWorker; i++) engine.upgradeZoneWorkers(def.name);
          renderAll();
        });
      }
      acreRow.appendChild(wBtn);
      if (!canAffordWorkers && qtyWorker > 0) {
        const workerTta = timeToUnlock(workerTotalCost);
        if (workerTta) acreRow.appendChild(el('span', 'tta-label', workerTta));
      }
      card.appendChild(acreRow);

      const cropStatsRow = engine.cropStats.get(ct?.id) ?? { grown: 0, lifetimeSales: 0 };
      const mastery = ct ? getCropMasterySummary(ct.id) : null;
      const statsEl = el('div', 'ranch-stats-row');
      statsEl.innerHTML = `
        <span>🌾 Harvested: <strong>${shortNumber(cropStatsRow.grown)}</strong></span>
        <span>🪙 Earned: <strong>${shortNumber(cropStatsRow.lifetimeSales)}g</strong></span>
        ${mastery ? `<span>🌱 Mastery: <strong>${mastery.level}/${mastery.maxLevel}</strong>${mastery.nextThreshold == null ? ' · complete' : ` · next ${shortNumber(mastery.nextThreshold)}`}</span>` : ''}
      `;
      card.appendChild(statsEl);
    }

    content.appendChild(card);
  });

}


// ── RANCH TAB ────────────────────────────────────────────────────────────────
function renderRanch() {
  const unlocked   = engine.unlockedRanchAnimals;
  const ranchAcres = engine.ranchAcres;
  const ranchWorkers = engine.ranchWorkers;
  const ranchStats = engine.ranchStats;
  const totalHarvestedCrops = engine.getTotalCropsHarvested();

  const header = el('div', 'ranch-header');
  header.innerHTML = `
    <h2 class="ranch-title">🐄 Ranch</h2>
    <p class="ranch-subtitle">Unlock farm animals by harvesting crops. Each animal produces gold passively — expand with more acreage and hire workers to increase output.</p>
  `;
  content.appendChild(header);

  for (const animal of RANCH_ANIMAL_LIST) {
    const isUnlocked = unlocked.has(animal.id);

    if (!isUnlocked) {
      // ── Locked animal card ─────────────────────────────────────────────────
      const required = animal.unlockCriteria.totalHarvested;
      const pct      = Math.min(100, Math.round(totalHarvestedCrops / required * 100));
      const card = el('div', 'ranch-card ranch-card-locked');
      card.innerHTML = `
        <div class="ranch-card-head">
          ${inatThumbHtml(animal.sci, 'ranch-thumb', animal.name)}
          <div class="ranch-animal-names">
            <span class="ranch-animal-name">${animal.name}</span>
            <span class="ranch-animal-sci">${animal.sci}</span>
          </div>
          <span class="ranch-badge locked">🔒 Locked</span>
        </div>
        <div class="unlock-reqs">
          <span class="unlock-req">
            🌾 ${shortNumber(totalHarvestedCrops)}<span class="next-sep">/</span>${shortNumber(required)} total crops harvested
            <span class="next-mini-bar"><span class="next-mini-fill" style="width:${pct}%"></span></span>
          </span>
        </div>
      `;
      content.appendChild(card);
      continue;
    }

    // ── Unlocked animal card ───────────────────────────────────────────────
    const acres   = ranchAcres.get(animal.id) ?? 0;
    const workers = ranchWorkers.get(animal.id) ?? 1;
    const wm      = workerMultiplier(workers);
    const stats   = ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
    const gps     = acres > 0 ? (animal.goldPerCycle * acres * wm * engine.getGoldMultiplier() * 4 * engine.gameSpeed) / animal.productionIntervalSecs : 0;
    const controlQty = getHeaderQtyForTab('ranch');

    const workerCostFn = n => workerUpgradeCost({ cost: animal.baseCost }, n);
    const qtyWorker = resolveWorkerQty(controlQty, workerCostFn, workers, engine.gold.amount);
    const workerTotalCost = qtyWorker > 0 ? bulkCost(workerCostFn, workers, qtyWorker) : 0;
    const canAffordWorker = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;

    const summaryRow = el('div', 'zone-control-summary');
    summaryRow.innerHTML = getZoneControlSummaryHtml(acres, workers, wm);

    const card = el('div', 'ranch-card ranch-card-unlocked');

    // Header row
    const cardHead = el('div', 'ranch-card-head');
    cardHead.innerHTML = `
      ${inatThumbHtml(animal.sci, 'ranch-thumb', animal.name)}
      <div class="ranch-animal-names">
        <span class="ranch-animal-name">${animal.name}</span>
        ${speciesLinksHtml(animal.sci)}
        <span class="ranch-product-label">📦 ${animal.product}</span>
      </div>
      <div class="ranch-gps">+${shortNumber(gps)}<span class="ranch-gps-unit">/s</span></div>
    `;
    card.appendChild(cardHead);
    const ranchInfoBtn = el('button', 'zone-info-btn', 'ℹ️');
    ranchInfoBtn.title = 'View in Collection';
    ranchInfoBtn.addEventListener('click', () => _goToCollection('ranch', animal.id));
    cardHead.appendChild(ranchInfoBtn);
    card.appendChild(summaryRow);

    // Acre allocation row (matches crops layout)
    const freeAcresForRanch = engine.getFreeAcres();
    const qtyRanchAcre = resolveActionQty(controlQty, freeAcresForRanch);
    const qtyRemoveRanchAcre = resolveActionQty(controlQty, acres);
    const acreRow = el('div', 'acre-upgrade-row');
    const canAllocateRanch = freeAcresForRanch >= 1;
    const canRemoveRanch   = acres > 0;
    if (canRemoveRanch) {
      const ranchRemoveBtn = el('button', 'buy-btn acre-btn danger-btn', getCompactAcreRemoveLabel(qtyRemoveRanchAcre));
      bindGuardedClick(ranchRemoveBtn, `ranch-remove:${animal.id}`, () => {
        for (let i = 0; i < qtyRemoveRanchAcre; i++) engine.deallocateRanchAcre(animal.id);
        renderAll();
      });
      acreRow.appendChild(ranchRemoveBtn);
    }
    const ranchAllocBtn = el('button', `buy-btn acre-btn${canAllocateRanch ? '' : ' disabled'}`, getCompactAcreAddLabel(qtyRanchAcre, freeAcresForRanch));
    ranchAllocBtn.dataset.ranchAnimalId = animal.id;
    if (canAllocateRanch) {
      bindGuardedClick(ranchAllocBtn, `ranch-alloc:${animal.id}`, () => {
        engine.queueRanchAcre(animal.id, qtyRanchAcre);
        renderAll();
      });
    } else {
      ranchAllocBtn.disabled = true;
    }
    acreRow.appendChild(ranchAllocBtn);

    // Worker upgrade button shares the same action row as acres
    const workerBtn = el('button', `buy-btn acre-btn worker-btn${canAffordWorker ? '' : ' disabled'}`, getCompactWorkerLabel(qtyWorker, workerTotalCost));
    workerBtn.dataset.ranchAnimalIdW = animal.id;
    if (canAffordWorker) {
      bindGuardedClick(workerBtn, `ranch-worker:${animal.id}`, () => {
        for (let i = 0; i < qtyWorker; i++) engine.upgradeRanchWorkers(animal.id);
        renderAll();
      });
    } else {
      workerBtn.disabled = true;
    }
    acreRow.appendChild(workerBtn);
    if (!canAffordWorker && qtyWorker > 0) {
      const workerTtaLabel = timeToUnlock(workerTotalCost);
      if (workerTtaLabel) acreRow.appendChild(el('span', 'tta-label', workerTtaLabel));
    }
    card.appendChild(acreRow);

    // Stats row
    const statsEl = el('div', 'ranch-stats-row');
    statsEl.innerHTML = `
      <span>📦 Produced: <strong>${shortNumber(stats.produced)}</strong></span>
      <span>💰 Sold: <strong>${shortNumber(stats.sold)}</strong></span>
      <span>🪙 Earned: <strong>${shortNumber(stats.lifetimeSales)}g</strong></span>
    `;
    card.appendChild(statsEl);

    content.appendChild(card);
  }
}

function researchFingerprint() {
  const slots = engine.researchSlots;
  return `${engine.completedResearch.size}|${slots.map(slot => slot.id).join(',')}|${Math.floor(engine.researchPoints)}|${engine.researchSlotCount}|cm:${cropMasteryFingerprint()}`;
}

function getResearchDashboardState() {
  const completed = engine.completedResearch;
  const slots = engine.researchSlots;
  const slotCount = engine.researchSlotCount;
  const hasOpenSlot = slots.length < slotCount;
  const activeIds = new Set(slots.map(slot => slot.id));
  const pts = engine.researchPoints;
  const biosphere = engine.getBiosphereScore();
  const gardenBio = engine.getGardenBiosphereScore();
  const creatureBio = engine.getCreatureBiosphereScore();
  const totalBio = biosphere + gardenBio + creatureBio;
  const maxBiosphere = RESEARCH.reduce((sum, project) => sum + (project.effect?.biosphereBonus ?? 0), 0);
  const maxGardenBio = ALL_PLANTS.reduce((sum, plant) => sum + (plant.biosphereBonus ?? 0), 0);
  const maxCreatureBio = ALL_PLANTS.reduce((sum, plant) => sum + (plant.insectsHosted?.length ?? 0), 0);
  const maxTotal = maxBiosphere + maxGardenBio + maxCreatureBio;
  const goldMult = engine.getGoldMultiplier();
  const cpPerDay = engine.unlockedFarmZones.size;
  const availableProjects = RESEARCH.filter(project => (
    !completed.has(project.id)
    && !activeIds.has(project.id)
    && engine.getResearchUnlockStatus(project).unlocked
  ));
  const affordableProjects = availableProjects.filter(project => pts >= project.cost);
  const startableProjectsCount = hasOpenSlot ? affordableProjects.length : 0;
  const nextProject = availableProjects.reduce((cheapest, project) => (
    !cheapest || project.cost < cheapest.cost ? project : cheapest
  ), null);
  const nextSlotCost = engine.getNextSlotCost();

  let focus;
  if (completed.size === RESEARCH.length) {
    focus = {
      kicker: 'Research complete',
      title: 'The full conservation tree is already mapped',
      body: 'From here, extra CP can keep feeding native planting and the archive rather than unlocking more theory.',
      tone: 'info',
    };
  } else if (hasOpenSlot && affordableProjects.length > 0) {
    focus = {
      kicker: 'Startable now',
      title: `${affordableProjects.length} project${affordableProjects.length !== 1 ? 's are' : ' is'} ready to queue`,
      body: 'An open lane is idle right now. Spending CP here converts passive income into permanent unlocks and biosphere score.',
      tone: 'ready',
    };
  } else if (nextSlotCost !== null && pts >= nextSlotCost) {
    focus = {
      kicker: 'Lane expansion',
      title: `Slot ${slotCount + 1} is affordable now`,
      body: 'Buying another research lane lets you keep passive CP working even while current projects are still ticking down.',
      tone: 'ready',
    };
  } else if (slots.length > 0) {
    focus = {
      kicker: 'Compounding work',
      title: `${slots.length} research lane${slots.length !== 1 ? 's are' : ' is'} already in motion`,
      body: 'Let the timers run unless you need to reprioritize. Progress is already converting your economy into long-term power.',
      tone: 'grow',
    };
  } else if (nextProject) {
    const delta = Math.max(0, nextProject.cost - pts);
    focus = {
      kicker: 'Nearest unlock',
      title: delta > 0
        ? `${delta} more CP opens ${nextProject.name}`
        : `${nextProject.name} is the next clean pickup`,
      body: 'Farm zones generate the base CP flow. Native plantings amplify the biosphere side of the tree once those projects land.',
      tone: delta > 0 ? 'info' : 'ready',
    };
  } else {
    const lockedCount = RESEARCH.length - completed.size - activeIds.size;
    focus = {
      kicker: 'Prerequisites first',
      title: `${lockedCount} project${lockedCount !== 1 ? 's are' : ' is'} still gated by earlier work`,
      body: 'Clear the available projects first. Once those are complete, the deeper conservation branches will open behind them.',
      tone: 'warn',
    };
  }

  return {
    activeIds,
    affordableProjectsCount: affordableProjects.length,
    availableProjectsCount: availableProjects.length,
    biosphere,
    completed,
    cpPerDay,
    creatureBio,
    focus,
    gardenBio,
    goldMult,
    hasOpenSlot,
    maxGardenBio,
    maxTotal,
    nextSlotCost,
    pts,
    slotCount,
    slots,
    startableProjectsCount,
    totalBio,
  };
}

// ── RESEARCH TAB ─────────────────────────────────────────────────────────────
function renderResearch() {
  const planted = engine.plantedSpecies;
  const researchState = getResearchDashboardState();
  const completed = researchState.completed;
  const slots = researchState.slots;
  const slotCount = researchState.slotCount;
  const activeIds = researchState.activeIds;
  const pts = researchState.pts;

  // ── Biosphere Score banner ──────────────────────────────────────────────────
  const banner = el('div', 'research-banner');
  const bioPct = researchState.maxTotal > 0 ? Math.round(researchState.totalBio / researchState.maxTotal * 100) : 0;
  banner.innerHTML = `
    <div class="research-banner-row">
      <span class="bio-label">🌍 Biosphere Score</span>
      <span class="bio-score">${researchState.totalBio} <span class="bio-max">/ ${researchState.maxTotal}</span></span>
      <span class="research-pts">🌱 ${pts} CP</span>
    </div>
    <div class="bio-bar-track"><div class="bio-bar-fill" style="width:${bioPct}%"></div></div>
    <div class="bio-breakdown">
      <span>🌱 Conservation: <strong>${researchState.biosphere}</strong></span>
      <span>🌿 Garden: <strong>${researchState.gardenBio}</strong> / ${researchState.maxGardenBio}</span>
      <span>🦋 Creatures: <strong>${researchState.creatureBio}</strong></span>
      <span>💰 Gold Bonus: <strong>${researchState.goldMult.toFixed(2)}×</strong></span>
    </div>
    <p class="research-hint">Conservation points are earned passively — ${researchState.cpPerDay} CP/day from your ${researchState.cpPerDay} unlocked farm zone${researchState.cpPerDay !== 1 ? 's' : ''}. Plant native species in the 🌿 Garden tab to add more.</p>
  `;
  content.appendChild(banner);

  const dashboard = el('section', 'tab-dashboard research-dashboard');
  const summaryGrid = el('div', 'summary-grid research-summary-grid');
  [
    {
      key: 'points',
      kicker: 'Conservation points',
      value: `🌱 ${shortNumber(pts)}`,
      meta: `${researchState.cpPerDay} CP/day base income`,
      tone: researchState.affordableProjectsCount > 0 ? 'ready' : 'info',
    },
    {
      key: 'lanes',
      kicker: 'Research lanes',
      value: `${slots.length}/${slotCount}`,
      meta: researchState.nextSlotCost === null
        ? 'All slots purchased'
        : pts >= researchState.nextSlotCost
          ? `Slot ${slotCount + 1} ready for ${researchState.nextSlotCost} CP`
          : `${researchState.nextSlotCost - pts} CP to unlock slot ${slotCount + 1}`,
      tone: slots.length < slotCount ? 'ready' : slots.length > 0 ? 'grow' : 'neutral',
    },
    {
      key: 'projects',
      kicker: 'Projects mapped',
      value: `${completed.size}/${RESEARCH.length}`,
      meta: researchState.affordableProjectsCount > 0
        ? `${researchState.affordableProjectsCount} ready to start`
        : `${researchState.availableProjectsCount} available projects`,
      tone: completed.size === RESEARCH.length ? 'accent' : researchState.affordableProjectsCount > 0 ? 'ready' : 'info',
    },
    {
      key: 'reward',
      kicker: 'Gold conversion',
      value: `${researchState.goldMult.toFixed(2)}×`,
      meta: `Biosphere score at ${bioPct}% of cap`,
      tone: researchState.goldMult > 1 ? 'accent' : 'neutral',
    },
  ].forEach(cardData => {
    const card = el('div', 'summary-card');
    card.dataset.summary = cardData.key;
    card.dataset.tone = cardData.tone;
    card.innerHTML = `
      <span class="summary-kicker">${cardData.kicker}</span>
      <strong class="summary-value">${cardData.value}</strong>
      <span class="summary-meta">${cardData.meta}</span>
    `;
    summaryGrid.appendChild(card);
  });
  dashboard.appendChild(summaryGrid);

  const focusCallout = el('div', 'focus-callout research-focus-callout');
  focusCallout.dataset.tone = researchState.focus.tone;
  focusCallout.innerHTML = `
    <span class="focus-kicker">${researchState.focus.kicker}</span>
    <strong class="focus-title">${researchState.focus.title}</strong>
    <p class="focus-body">${researchState.focus.body}</p>
  `;
  dashboard.appendChild(focusCallout);
  content.appendChild(dashboard);

  // ── Research slots header ──────────────────────────────────────────────────
  const slotsHeader = el('div', 'research-slots-header');
  slotsHeader.innerHTML = `<span class="research-slots-label">🔬 Research Slots: ${slots.length} / ${slotCount} in use</span>`;

  // Buy slot button
  const nextSlotCost = researchState.nextSlotCost;
  if (nextSlotCost !== null) {
    const canBuy = pts >= nextSlotCost;
    const buyBtn = el('button', `action-btn research-buy-slot-btn${canBuy ? '' : ' disabled'}`,
      canBuy ? `+ Buy Slot ${slotCount + 1} (${nextSlotCost} CP)` : `+ Slot ${slotCount + 1} — need ${nextSlotCost - pts} more CP`);
    if (canBuy) {
      buyBtn.addEventListener('click', () => { engine.buyResearchSlot(); renderAll(); });
    } else {
      buyBtn.disabled = true;
    }
    slotsHeader.appendChild(buyBtn);
  } else {
    slotsHeader.appendChild(el('span', 'research-slots-max', '(max slots)'));
  }
  content.appendChild(slotsHeader);

  // ── Active research cards ────────────────────────────────────────────────────
  if (slots.length > 0) {
    for (const slot of slots) {
      const project = RESEARCH.find(r => r.id === slot.id);
      const pct     = project ? Math.min(100, Math.round(slot.timer / project.duration * 100)) : 0;
      const remaining = project ? Math.max(0, project.duration - slot.timer) : 0;

      const activeCard = el('div', 'research-active-card');
      activeCard.innerHTML = `
        <div class="research-active-header">
          <span class="research-active-icon">${project?.icon ?? '🌱'}</span>
          <span class="research-active-name">${project?.name ?? slot.id}</span>
          <span class="research-active-time">${fmtDays(remaining)} remaining</span>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="research-active-footer">
          <span class="research-active-pct">${pct}% complete</span>
          <button class="action-btn danger research-cancel-btn">✕ Cancel</button>
        </div>
      `;
      const slotId = slot.id;
      activeCard.querySelector('.research-cancel-btn').addEventListener('click', () => {
        engine.cancelResearch(slotId);
        renderAll();
      });
      content.appendChild(activeCard);
    }
  }
  if (slots.length < slotCount) {
    const freeSlots = slotCount - slots.length;
    const idleNote = el('p', 'research-idle-note', `— ${freeSlots} research slot${freeSlots !== 1 ? 's' : ''} available. Start a project below. —`);
    content.appendChild(idleNote);
  }

  // ── Hide-completed toggle ────────────────────────────────────────────────
  const researchDoneCount = RESEARCH.filter(r => completed.has(r.id)).length;
  const researchToggleBar = el('div', 'tab-toggle-bar');
  const researchToggleBtn = el('button',
    `tab-toggle-btn${hideCompletedResearch ? ' active' : ''}`,
    hideCompletedResearch
      ? `👁 Show completed (${researchDoneCount})`
      : `✓ Hide completed (${researchDoneCount})`
  );
  researchToggleBtn.addEventListener('click', () => {
    hideCompletedResearch = !hideCompletedResearch;
    localStorage.setItem('hideCompletedResearch', hideCompletedResearch);
    renderAll();
  });
  researchToggleBar.appendChild(researchToggleBtn);

  const startableCount = researchState.startableProjectsCount;
  const startableToggleBtn = el('button',
    `tab-toggle-btn${showOnlyStartableResearch ? ' active' : ''}`,
    showOnlyStartableResearch
      ? `👁 Show all (${startableCount} startable)`
      : `▶ Startable now (${startableCount})`
  );
  startableToggleBtn.addEventListener('click', () => {
    showOnlyStartableResearch = !showOnlyStartableResearch;
    localStorage.setItem('showOnlyStartableResearch', showOnlyStartableResearch);
    renderAll();
  });
  researchToggleBar.appendChild(startableToggleBtn);
  content.appendChild(researchToggleBar);

  // ── Category sections ──────────────────────────────────────────────────────
  let renderedResearchCards = 0;
  for (const cat of Object.values(RESEARCH_CATEGORIES)) {
    const catProjects = RESEARCH.filter(r => r.category === cat.id);
    const section = el('div', 'research-section');

    const catHeader = el('h2', 'section-header', cat.label);
    section.appendChild(catHeader);

    const catDesc = el('p', 'research-cat-desc', cat.desc);
    section.appendChild(catDesc);

    let visibleProjects = 0;

    for (const project of catProjects) {
      const isDone   = completed.has(project.id);
      if (hideCompletedResearch && isDone) continue;
      const isActive = activeIds.has(project.id);
      const unlockStatus = engine.getResearchUnlockStatus(project);
      const prereqsMet = unlockStatus.unlocked;
      const hasResearchLocks = unlockStatus.unmetResearch.length > 0;
      const hasCropLocks = unlockStatus.unmetCropMilestones.length > 0;
      const canAfford  = pts >= project.cost;
      const hasOpenSlot = slots.length < slotCount;
      const canStart   = prereqsMet && canAfford && !isDone && !isActive && hasOpenSlot;
      if (showOnlyStartableResearch && !canStart) continue;

      const card = el('div', `research-card${isDone ? ' research-done' : ''}${isActive ? ' research-in-progress' : ''}${!prereqsMet ? ' research-locked' : ''}`);

      // Header row
      const cardHead = el('div', 'research-card-head');
      cardHead.innerHTML = `<span class="research-icon">${project.icon}</span><span class="research-name">${project.name}</span>`;

      // Status badge
      const badge = el('span', 'research-badge');
      if (isDone) {
        badge.className = 'research-badge done';
        badge.textContent = '✅ Complete';
      } else if (isActive) {
        badge.className = 'research-badge active';
        badge.textContent = '🌱 In Progress…';
      } else if (!prereqsMet) {
        badge.className = 'research-badge locked';
        badge.textContent = hasCropLocks && !hasResearchLocks ? '🌾 Mastery needed' : '🔒 Locked';
      } else {
        badge.className = 'research-badge available';
        badge.textContent = `🌱 ${project.cost} CP · ${fmtDays(project.duration)}`;
      }
      cardHead.appendChild(badge);
      card.appendChild(cardHead);

      // Description + flavor
      const descEl = el('p', 'research-desc', project.desc);
      card.appendChild(descEl);
      const flavor = el('p', 'research-flavor', project.flavorText);
      card.appendChild(flavor);

      // Effect & prerequisites
      const meta = el('div', 'research-meta');
      meta.innerHTML = `
        <div class="research-meta-line">
          <span class="research-meta-label">Effect</span>
          <div class="research-chip-group">
            <span class="research-effect">✨ ${project.effect.label}</span>
          </div>
        </div>
      `;
      if (project.requires.length > 0) {
        const reqNames = project.requires.map(req => {
          const r = RESEARCH.find(p => p.id === req);
          const met = completed.has(req);
          return `<span class="research-req${met ? ' met' : ''}">${met ? '✅' : '🔒'} ${r?.name ?? req}</span>`;
        });
        meta.innerHTML += `
          <div class="research-meta-line">
            <span class="research-meta-label">Requires</span>
            <div class="research-chip-group">${reqNames.join('')}</div>
          </div>
        `;
      }
      if (unlockStatus.cropMilestones.length > 0) {
        meta.innerHTML += `
          <div class="research-meta-line">
            <span class="research-meta-label">Crop mastery</span>
            <div class="research-chip-group">${unlockStatus.cropMilestones.map(status => cropMilestoneChipHtml(status)).join('')}</div>
          </div>
        `;
      }

      // Plants unlocked by this research
      const unlockedByThis = ALL_PLANTS.filter(p =>
        (p.requiresResearch ?? []).includes(project.id)
      );
      if (unlockedByThis.length > 0) {
        const plantNames = unlockedByThis.map(p => {
          const isPlanted = planted.has(p.id);
          return `<span class="research-unlocks-plant${isPlanted ? ' planted' : ''}">${p.icon ?? '🌿'} ${p.name}${isPlanted ? ' ✅' : ''}</span>`;
        }).join('');
        meta.innerHTML += `
          <div class="research-meta-line">
            <span class="research-meta-label">Unlocks</span>
            <div class="research-chip-group">${plantNames}</div>
          </div>
        `;
      }

      card.appendChild(meta);

      // Action button
      if (!isDone && !isActive) {
        const btnRow = el('div', 'btn-row research-card-actions');
        const btnLabel = canStart
          ? '▶ Start Project'
          : hasResearchLocks ? '🔒 Prerequisites needed'
          : hasCropLocks ? '🌾 Crop mastery needed'
          : !canAfford  ? `🌱 Need ${project.cost - pts} more CP`
          : '🔬 All slots full';
        const btn = el('button', `action-btn${canStart ? '' : ' disabled'}`, btnLabel);
        if (canStart) {
          btn.addEventListener('click', () => { engine.startResearch(project.id); renderAll(); });
        } else {
          btn.disabled = true;
        }
        btnRow.appendChild(btn);
        card.appendChild(btnRow);
      }

      section.appendChild(card);
      visibleProjects++;
      renderedResearchCards++;
    }

    if (visibleProjects > 0) content.appendChild(section);
  }

  if (renderedResearchCards === 0) {
    const emptyNote = el('p', 'research-idle-note',
      showOnlyStartableResearch
        ? 'No projects can be started right now. Earn more CP, clear prerequisites, or free a research slot.'
        : 'No research projects match the current filters.'
    );
    content.appendChild(emptyNote);
  }
}
// ── NATIVE GARDEN TAB ───────────────────────────────────────────────────────
function renderGarden() {
  const planted           = engine.plantedSpecies;
  const activePId         = engine.activePlantingId;
  const activePTimer      = engine.activePlantingTimer;
  const pts               = engine.researchPoints;
  const completedResearch = engine.completedResearch;
  const researchById      = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

  // ── Hide-planted toggle ─────────────────────────────────────────────────
  const gardenPlantedCount = ALL_PLANTS.filter(p => planted.has(p.id)).length;
  const gardenToggleBar = el('div', 'tab-toggle-bar');
  const gardenToggleBtn = el('button',
    `tab-toggle-btn${hideCompletedGarden ? ' active' : ''}`,
    hideCompletedGarden
      ? `👁 Show planted (${gardenPlantedCount})`
      : `✓ Hide planted (${gardenPlantedCount})`
  );
  gardenToggleBtn.addEventListener('click', () => {
    hideCompletedGarden = !hideCompletedGarden;
    localStorage.setItem('hideCompletedGarden', hideCompletedGarden);
    renderAll();
  });
  gardenToggleBar.appendChild(gardenToggleBtn);

  // ── Hide-locked toggle ──────────────────────────────────────────────────
  const gardenLockedCount = ALL_PLANTS.filter(p =>
    !engine.getPlantUnlockStatus(p).unlocked
  ).length;
  const gardenLockedBtn = el('button',
    `tab-toggle-btn${hideLockedGarden ? ' active' : ''}`,
    hideLockedGarden
      ? `👁 Show locked (${gardenLockedCount})`
      : `🔒 Hide locked (${gardenLockedCount})`
  );
  gardenLockedBtn.addEventListener('click', () => {
    hideLockedGarden = !hideLockedGarden;
    localStorage.setItem('hideLockedGarden', hideLockedGarden);
    renderAll();
  });
  gardenToggleBar.appendChild(gardenLockedBtn);

  const allPlantIds = ALL_PLANTS.map(p => p.id);
  const allCollapsed = allPlantIds.every(id => collapsedGardenCards.has(id));
  const collapseAllBtn = el('button', 'tab-toggle-btn', allCollapsed ? '▶ Expand all' : '▼ Collapse all');
  collapseAllBtn.addEventListener('click', () => {
    if (allCollapsed) allPlantIds.forEach(id => collapsedGardenCards.delete(id));
    else              allPlantIds.forEach(id => collapsedGardenCards.add(id));
    renderAll();
  });
  gardenToggleBar.appendChild(collapseAllBtn);
  content.appendChild(gardenToggleBar);

  const gardenState = getGardenDashboardState();
  const dashboard = el('section', 'tab-dashboard garden-dashboard');
  const summaryGrid = el('div', 'summary-grid garden-summary-grid');
  [
    {
      key: 'species',
      kicker: 'Native species',
      value: `${gardenState.establishedSpeciesCount}/${gardenState.totalPlantCount}`,
      meta: `${gardenState.completedEcoregions} of ${ECOREGIONS.length} ecoregions completed`,
      tone: gardenState.establishedSpeciesCount > 0 ? 'grow' : 'neutral',
    },
    {
      key: 'acres',
      kicker: 'Habitat acres',
      value: `${gardenState.establishedAcres}`,
      meta: `${gardenState.freeAcres} free acre${gardenState.freeAcres !== 1 ? 's' : ''} still open`,
      tone: gardenState.freeAcres > 0 ? 'info' : 'warn',
    },
    {
      key: 'biosphere',
      kicker: 'Garden biosphere',
      value: `🌍 ${shortNumber(gardenState.gardenBio)}`,
      meta: `${gardenState.establishedAcres} established native acre${gardenState.establishedAcres !== 1 ? 's' : ''}`,
      tone: gardenState.gardenBio > 0 ? 'accent' : 'neutral',
    },
    {
      key: 'queue',
      kicker: 'Propagation queue',
      value: `${gardenState.queueDepth}`,
      meta: gardenState.queueDepth > 0
        ? `${gardenState.queuedSpeciesCount} species in motion`
        : `${gardenState.affordableUnlockedCount} affordable right now`,
      tone: gardenState.queueDepth > 0 ? 'grow' : gardenState.affordableUnlockedCount > 0 ? 'ready' : 'neutral',
    },
  ].forEach(cardData => {
    const card = el('div', 'summary-card');
    card.dataset.summary = cardData.key;
    card.dataset.tone = cardData.tone;
    card.innerHTML = `
      <span class="summary-kicker">${cardData.kicker}</span>
      <strong class="summary-value">${cardData.value}</strong>
      <span class="summary-meta">${cardData.meta}</span>
    `;
    summaryGrid.appendChild(card);
  });
  dashboard.appendChild(summaryGrid);

  const focusCallout = el('div', 'focus-callout');
  focusCallout.dataset.tone = gardenState.focus.tone;
  focusCallout.innerHTML = `
    <span class="focus-kicker">${gardenState.focus.kicker}</span>
    <strong class="focus-title">${gardenState.focus.title}</strong>
    <p class="focus-body">${gardenState.focus.body}</p>
  `;
  dashboard.appendChild(focusCallout);
  content.appendChild(dashboard);

  const gardenOperationCard = renderGardenOperationCard();
  if (gardenOperationCard) content.appendChild(gardenOperationCard);

  for (const ecoregion of ECOREGIONS) {
    // ── Ecoregion header ─────────────────────────────────────────────────────────
    const plantedCount = ecoregion.plants.filter(p => planted.has(p.id)).length;
    const totalCount   = ecoregion.plants.length;
    const ecoComplete  = plantedCount === totalCount;
    const ecoPct       = Math.round(plantedCount / totalCount * 100);

    const ecoHeader = el('div', `eco-header${ecoComplete ? ' eco-complete' : ''}`);
    ecoHeader.innerHTML = `
      <div class="eco-header-row">
        <span class="eco-icon">${ecoregion.icon}</span>
        <span class="eco-name">${ecoregion.label}</span>
        <span class="eco-progress-text">${plantedCount} / ${totalCount} planted</span>
        ${ecoComplete ? '<span class="eco-badge-complete">🏆 Complete!</span>' : ''}
      </div>
      <p class="eco-desc">${ecoregion.desc}</p>
      <div class="bio-bar-track" style="margin-top:8px">
        <div class="bio-bar-fill garden-fill" style="width:${ecoPct}%"></div>
      </div>
      <p class="eco-hnp-link">Source: <a href="${ecoregion.hnpUrl}" target="_blank" rel="noopener noreferrer" class="eco-link">Homegrown National Park – Keystone Plants ↗</a></p>
    `;
    content.appendChild(ecoHeader);

    // ── Plant type sections ──────────────────────────────────────────────────────────────
    const typeGroups = [
      { type: 'flower',  label: '🌸 Wildflowers & Groundcovers' },
      { type: 'shrub',   label: '🌿 Shrubs' },
      { type: 'tree',    label: '🌳 Trees' },
    ];

    for (const { type, label } of typeGroups) {
      const groupPlants = ecoregion.plants.filter(p => p.type === type);
      if (groupPlants.length === 0) continue;

      const groupHeader = el('h2', 'section-header', label);
      content.appendChild(groupHeader);

      for (const plant of groupPlants) {
        const establishedAcres = engine.plantedSpeciesAcres.get(plant.id) ?? 0;
        const isPlanted  = establishedAcres > 0 || engine.nativeEstablishQueue.some(i => i.plantId === plant.id);
        if (hideCompletedGarden && isPlanted) continue;
        const isActive   = activePId === plant.id || engine.nativeEstablishQueue.some(i => i.plantId === plant.id);
        const unlockStatus = engine.getPlantUnlockStatus(plant);
        const isUnlocked = unlockStatus.unlocked;

        // ── Locked card (research prerequisite not met) ───────────────────────────
        if (!isUnlocked) {
          if (hideLockedGarden) continue;
          const researchReqs = unlockStatus.unmetResearch.map(rid => {
            const name = researchById[rid]?.name ?? rid;
            return `<span class="research-req">🔒 ${name}</span>`;
          }).join('');
          const cropReqs = unlockStatus.cropMilestones.map(status => cropMilestoneChipHtml(status)).join('');
          const lockedCard = el('div', 'garden-card garden-card-locked');
          lockedCard.innerHTML = `
            <div class="garden-card-head">
              <span class="garden-plant-icon">🔒</span>
              ${inatThumbHtml(plant.sci, 'garden-thumb', plant.name)}
              <div class="garden-plant-summary">
                <div class="garden-plant-names">
                  <div class="garden-plant-title-row">
                    <span class="garden-plant-name">${plant.name}</span>
                    <span class="garden-plant-sci">${plant.sci}</span>
                  </div>
                  <div class="garden-species-links">${speciesReferenceLinksHtml(plant.sci, plant.name)}</div>
                </div>
                <div class="garden-badges">
                  <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
                  ${plant.insectsHosted?.length ? `<span class="garden-hosted-badge">${plant.insectsHosted.length} species hosted</span>` : ''}
                </div>
              </div>
            </div>
            <div class="garden-locked-msg">
              ${researchReqs ? `<div class="research-chip-group">${researchReqs}</div>` : ''}
              ${cropReqs ? `<div class="research-chip-group">${cropReqs}</div>` : ''}
            </div>
          `;
          content.appendChild(lockedCard);
          continue;
        }

        const card = el('div', `garden-card${isPlanted ? ' garden-planted' : ''}${isActive ? ' garden-active' : ''}`);
        const isCollapsed = collapsedGardenCards.has(plant.id);

        // ── Card header row: iNat photo + name + badges + collapse toggle ───────────────
        const cardHead = el('div', 'garden-card-head garden-card-head-clickable');
        cardHead.innerHTML = `
          ${inatThumbHtml(plant.sci, 'garden-thumb', plant.name)}
          <div class="garden-plant-summary">
            <div class="garden-plant-names">
              <div class="garden-plant-title-row">
                <span class="garden-plant-name">${plant.name}</span>
                <span class="garden-plant-sci">${plant.sci}</span>
              </div>
              <div class="garden-species-links">${speciesReferenceLinksHtml(plant.sci, plant.name)}</div>
            </div>
            <div class="garden-badges">
              <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
              ${plant.insectsHosted?.length ? `<span class="garden-hosted-badge">${plant.insectsHosted.length} species hosted</span>` : ''}
              ${establishedAcres > 0 ? `<span class="garden-status-badge planted">✅ ${establishedAcres} acre${establishedAcres !== 1 ? 's' : ''}</span>` : ''}
              ${isActive && establishedAcres === 0 ? '<span class="garden-status-badge active">🌱 Establishing…</span>' : ''}
            </div>
          </div>
          <button class="garden-collapse-btn" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '▶' : '▼'}</button>
        `;
        // Toggle on header click (but not on inat link clicks)
        cardHead.addEventListener('click', e => {
          if (e.target.closest('.species-ext-link')) return;
          if (e.target.closest('.zone-info-btn')) return;
          if (collapsedGardenCards.has(plant.id)) collapsedGardenCards.delete(plant.id);
          else collapsedGardenCards.add(plant.id);
          renderAll();
        });
        if (isPlanted) {
          const gardenInfoBtn = el('button', 'zone-info-btn', 'ℹ️');
          gardenInfoBtn.title = 'View in Collection';
          gardenInfoBtn.addEventListener('click', e => { e.stopPropagation(); _goToCollection('plants', plant.id); });
          const collapseBtn = cardHead.querySelector('.garden-collapse-btn');
          cardHead.insertBefore(gardenInfoBtn, collapseBtn);
        }
        card.appendChild(cardHead);

        // ── Collapsible body ──────────────────────────────────────────────────────
        if (isCollapsed) { content.appendChild(card); continue; }
        const cardBody = el('div', 'garden-card-body');

        // ── Plant description ─────────────────────────────────────────────────────
        const plantMeta = el('div', 'garden-plant-meta');
        plantMeta.innerHTML = `
          <span class="garden-meta-item">↕️ ${plant.height}</span>
          <span class="garden-meta-item">🌱 ${plant.seasonOfInterest}</span>
          ${plant.caterpillarSpp ? `<span class="garden-meta-item caterpillar-count">🐦 ${plant.caterpillarSpp}+ caterpillar species</span>` : ''}
        `;
        cardBody.appendChild(plantMeta);

        const descEl = el('p', 'garden-desc', plant.desc);
        cardBody.appendChild(descEl);

        // ── Insects & Wildlife hosted (educational section) ───────────────────────
        const insectSection = el('div', 'garden-insect-section');
        insectSection.innerHTML = '<div class="garden-insect-header">🦸 Insects & Wildlife Hosted</div>';

        for (const creature of plant.insectsHosted) {
          const typeIcon = WILDLIFE_TYPE_ICONS[creature.type] ?? '🐞';
          const insectRow = el('div', `garden-insect-row insect-type-${creature.type}`);
          insectRow.innerHTML = `
            <div class="garden-insect-label">
              <span class="insect-type-icon">${typeIcon}</span>
              <span class="insect-name">${creature.name}</span>
            </div>
          `;
          insectSection.appendChild(insectRow);
        }

        if (plant.wildlifeNote) {
          const wildlifeEl = el('div', 'garden-wildlife-note');
          wildlifeEl.innerHTML = `<span class="wildlife-note-icon">🌿</span> ${plant.wildlifeNote}`;
          insectSection.appendChild(wildlifeEl);
        }

        cardBody.appendChild(insectSection);

        // ── Cost & action row ──────────────────────────────────────────────────────────────
        const queuedForPlant   = engine.nativeEstablishQueue.filter(i => i.plantId === plant.id).length;
        const freeAcresNative  = engine.getFreeAcres();
        const isFirstAcre      = establishedAcres === 0 && queuedForPlant === 0 && activePId !== plant.id;
        const controlQtyNative = getHeaderQtyForTab('garden');
        const qtyNativeAdd     = resolveActionQty(controlQtyNative, freeAcresNative);
        const qtyNativeRemove  = resolveActionQty(controlQtyNative, establishedAcres);
        const qtyNativePlant   = resolveActionQty(controlQtyNative, freeAcresNative);
        const actionRow = el('div', 'garden-action-row');
        const bonusLabel = el('span', 'garden-bonus-label', `🌍 +${plant.biosphereBonus} Biosphere / acre`);
        actionRow.appendChild(bonusLabel);

        if (establishedAcres > 0 || queuedForPlant > 0 || isActive) {
          // Already established — show acre count + add/remove
          const acreInfo = el('span', 'garden-acre-info');
          let infoText = `🌱 ${establishedAcres} acre${establishedAcres !== 1 ? 's' : ''} established`;
          if (queuedForPlant > 0) infoText += ` · +${queuedForPlant} establishing`;
          if (isActive) infoText += ` · 1 establishing (legacy)`;
          acreInfo.textContent = infoText;
          actionRow.appendChild(acreInfo);
          const canAddMore = freeAcresNative >= 1;
          if (establishedAcres > 0) {
            const removeAcreBtn = el('button', 'action-btn danger', getCompactAcreRemoveLabel(qtyNativeRemove));
            bindGuardedClick(removeAcreBtn, `garden-remove:${plant.id}`, () => {
              engine.deallocateNativeAcre(plant.id, qtyNativeRemove);
              renderAll();
            });
            actionRow.appendChild(removeAcreBtn);
          }
          const addAcreBtn = el('button', `action-btn garden-plant-btn${canAddMore ? '' : ' disabled'}`,
            getCompactAcreAddLabel(qtyNativeAdd, freeAcresNative));
          if (canAddMore) {
            bindGuardedClick(addAcreBtn, `garden-add:${plant.id}`, () => {
              engine.queueNativeAcre(plant.id, qtyNativeAdd);
              renderAll();
            });
          } else {
            addAcreBtn.disabled = true;
          }
          actionRow.appendChild(addAcreBtn);
        } else {
          // First planting — button deducts CP + queues 1 acre
          const canAfford  = pts >= plant.cost;
          const canPlant   = canAfford && qtyNativePlant >= 1;
          const btn = el('button',
            `action-btn${canPlant ? ' garden-plant-btn' : ' disabled'}`,
            isActive ? `🌱 Establishing… ${fmtDays(Math.max(0, plant.duration - activePTimer))}`
            : canPlant ? getCompactGardenEstablishLabel(qtyNativePlant, plant.cost, freeAcresNative)
            : !canAfford ? `🌱 Need ${shortNumber(plant.cost - pts)} CP`
            : 'No free acres'
          );
          if (canPlant) {
            bindGuardedClick(btn, `garden-establish:${plant.id}`, () => {
              const result = engine.queueNativeAcre(plant.id, qtyNativePlant);
              if (result.ok) renderAll();
            });
          } else {
            btn.disabled = true;
          }
          actionRow.appendChild(btn);
          if (!canAfford && freeAcresNative < 1) {
            // Show both issues
          } else if (freeAcresNative < 1 && canAfford) {
            const goLandBtnG = el('button', 'action-btn', '🛡️ Free land');
            goLandBtnG.addEventListener('click', () => { activeTab = 'land'; renderAll(); });
            actionRow.appendChild(goLandBtnG);
          }
        }
        cardBody.appendChild(actionRow);

        card.appendChild(cardBody);
        content.appendChild(card);
      }
    }
  }
}

// ── Creature type display config ──────────────────────────────────────────────
const CREATURE_TYPE_META = {
  butterfly: { label: 'Butterfly', icon: '🦋', plural: 'Butterflies' },
  moth:      { label: 'Moth',      icon: '🌙', plural: 'Moths'       },
  bee:       { label: 'Bee',       icon: '🐝', plural: 'Bees'        },
  fly:       { label: 'Fly',       icon: '🪰', plural: 'Flies'       },
  beetle:    { label: 'Beetle',    icon: '🪲', plural: 'Beetles'     },
  wasp:      { label: 'Wasp',      icon: '⚗️',  plural: 'Wasps'      },
  bird:      { label: 'Bird',      icon: '🐦', plural: 'Birds'       },
  mammal:    { label: 'Mammal',    icon: '🐿️', plural: 'Mammals'     },
};

// ── LAND TAB ──────────────────────────────────────────────────────────────────
function renderLand() {
  const totalAcres    = engine.totalLandAcres;
  const allocAcres    = engine.getAllocatedAcres();
  const invadedAcres  = engine.getTotalInvadedAcres();
  const freeAcres     = engine.getFreeAcres();
  const nativeQ       = engine.nativeEstablishQueue;
  const nativeTimer   = engine.nativeEstablishTimer;
  const ESTABLISH_SECS = ESTABLISH_DAYS * DAY_REAL_SECS;
  const removalQ      = engine.invasiveRemovalQueue;

  // ── Summary banner ──────────────────────────────────────────────────────────
  const banner = el('div', 'land-banner');
  const invPct  = totalAcres > 0 ? Math.round(invadedAcres / totalAcres * 100) : 0;
  const allocPct = totalAcres > 0 ? Math.round(allocAcres / totalAcres * 100) : 0;
  const freePct  = totalAcres > 0 ? Math.round(freeAcres / totalAcres * 100) : 0;
  banner.innerHTML = `
    <div class="land-banner-row">
      <span class="land-stat"><span class="land-stat-num">${totalAcres}</span> Total Acres</span>
      <span class="land-stat" style="color:#e57373"><span class="land-stat-num">${invadedAcres}</span> Invaded</span>
      <span class="land-stat"><span class="land-stat-num">${allocAcres}</span> In Use</span>
      <span class="land-stat land-stat-free"><span class="land-stat-num">${freeAcres}</span> Free</span>
    </div>
    <div class="bio-bar-track land-bar-track" title="Red = invaded, Green = in use, White = free">
      <div style="display:flex;height:100%;width:100%;border-radius:inherit;overflow:hidden">
        <div style="width:${allocPct}%;background:#4caf50;transition:width .3s"></div>
        <div style="width:${freePct}%;background:#78909c;transition:width .3s"></div>
        <div style="width:${invPct}%;background:#e57373;transition:width .3s"></div>
      </div>
    </div>
    <div class="bio-breakdown">
      <span>🟩 In Use: ${allocAcres}</span>
      <span>⬜ Free: ${freeAcres}</span>
      <span>🟥 Invaded: ${invadedAcres}</span>
      <span>🔬 CP: ${Math.floor(engine.researchPoints)}</span>
    </div>
  `;
  content.appendChild(banner);

  // ── Establish queues ────────────────────────────────────────────────────────
  if (nativeQ.length > 0 || removalQ.length > 0) {
    const qSect = el('div', 'land-section');
    qSect.innerHTML = '<h2 class="land-section-header">⏳ In Progress</h2>';

    function queueBlock(queue, timer, secs, typeLabel, getLabel) {
      if (queue.length === 0) return;
      const pct    = Math.min(100, Math.round((timer / secs) * 100));
      const remain = Math.max(0, secs / DAY_REAL_SECS - timer / DAY_REAL_SECS);
      const first  = queue[0];
      const rest   = queue.length - 1;
      const card   = el('div', 'land-queue-card');
      card.innerHTML = `
        <div class="land-queue-row">
          <span class="land-queue-type">${typeLabel}</span>
          <span class="land-queue-name">${getLabel(first)}</span>
          <span class="land-queue-time">${fmtDays(remain)}</span>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill" style="width:${pct}%"></div>
        </div>
        ${rest > 0 ? `<div class="land-queue-more">+${rest} more in queue</div>` : ''}
      `;
      qSect.appendChild(card);
    }

    queueBlock(nativeQ, nativeTimer, ESTABLISH_SECS, '🌿 Planting', i => {
      const r = engine.findPlant(i.plantId);
      return r ? r.plant.name : i.plantId;
    });

    // Show invasive removal queue jobs
    for (const job of removalQ) {
      const inv = INVASIVE_MAP[job.invasiveId];
      if (!inv) continue;
      const secs = inv.removeTimeDays * DAY_REAL_SECS;
      const pct  = Math.min(100, Math.round((job.timer / inv.removeTimeDays) * 100));
      const card = el('div', 'land-queue-card');
      card.innerHTML = `
        <div class="land-queue-row">
          <span class="land-queue-type">🛡️ Removing</span>
          <span class="land-queue-name">${inv.icon} ${inv.name} (${job.acresRemaining} ac left)</span>
          <span class="land-queue-time">${fmtDays(Math.max(0, inv.removeTimeDays - job.timer))}</span>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill" style="width:${pct}%"></div>
        </div>
      `;
      qSect.appendChild(card);
    }

    content.appendChild(qSect);
  }

  // ── Invasive species list ───────────────────────────────────────────────────
  const invSect = el('div', 'land-section');
  invSect.innerHTML = '<h2 class="land-section-header">🛡️ Invasive Species Battle</h2>';

  // Hide-completed toggle
  const clearedCount = INVASIVES.filter(inv => (engine.invasiveAcres.get(inv.id) ?? 0) <= 0).length;
  const toggleBar = el('div', 'tab-toggle-bar');
  const toggleBtn = el('button',
    `tab-toggle-btn${hideCompletedLand ? ' active' : ''}`,
    hideCompletedLand
      ? `👁 Show cleared (${clearedCount})`
      : `✓ Hide cleared (${clearedCount})`
  );
  toggleBtn.addEventListener('click', () => {
    hideCompletedLand = !hideCompletedLand;
    localStorage.setItem('hideCompletedLand', hideCompletedLand);
    renderAll();
  });
  toggleBar.appendChild(toggleBtn);
  invSect.appendChild(toggleBar);

  // Group by tier
  const tiers = [
    { tier: 1, label: '🟢 Minor Invasives' },
    { tier: 2, label: '🟡 Medium Invasives' },
    { tier: 3, label: '🔴 Dominant Invasives' },
  ];

  for (const { tier, label } of tiers) {
    const species = INVASIVES.filter(s => s.tier === tier);
    if (species.length === 0) continue;
    const tierHeader = el('h3', 'land-tier-header', label);
    invSect.appendChild(tierHeader);

    for (const inv of species) {
      const current = engine.invasiveAcres.get(inv.id) ?? 0;
      const canRemove = engine.canRemoveInvasive(inv.id);
      const isCleared = current <= 0;
      if (hideCompletedLand && isCleared) continue;
      const pct = inv.baseAcres > 0 ? Math.round((1 - current / inv.baseAcres) * 100) : 100;
      const cp = engine.researchPoints;

      const card = el('div', `land-invasive-card${isCleared ? ' land-invasive-cleared' : ''}`);
      card.innerHTML = `
        <div class="land-invasive-header">
          <span class="land-invasive-icon">${inv.icon}</span>
          <div class="land-invasive-names">
            <span class="land-invasive-name">${inv.name}</span>
            <span class="land-invasive-sci">${inv.sci}</span>
          </div>
          <div class="land-invasive-status">
            ${isCleared
              ? '<span class="land-invasive-cleared-badge">✅ Cleared!</span>'
              : `<span class="land-invasive-acres">${current} / ${inv.baseAcres} ac</span>`
            }
          </div>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill ${isCleared ? 'land-progress-cleared' : ''}" style="width:${pct}%;background:${isCleared ? '#4caf50' : '#66bb6a'}"></div>
        </div>
        <div class="land-invasive-desc">${inv.desc}</div>
        ${!isCleared ? `
          <div class="land-invasive-damage"><strong>Damage:</strong> ${inv.damage}</div>
          <div class="land-invasive-control"><strong>Control:</strong> ${inv.controlMethod}</div>
        ` : ''}
        <div class="land-invasive-actions" id="inv-actions-${inv.id}"></div>
      `;
      invSect.appendChild(card);

      // Action buttons
      const actionsDiv = card.querySelector(`#inv-actions-${inv.id}`);
      if (isCleared) {
        // Nothing to do — species is cleared
      } else if (!canRemove) {
        const req = RESEARCH.find(r => r.id === inv.requiredResearch);
        const lockEl = el('div', 'land-invasive-locked');
        lockEl.innerHTML = `🔒 Research <strong>${req?.name ?? inv.requiredResearch}</strong> to unlock removal`;
        lockEl.style.cursor = 'pointer';
        lockEl.addEventListener('click', () => { activeTab = 'research'; renderAll(); });
        actionsDiv.appendChild(lockEl);
      } else {
        // Show removal buttons: 1, 5, 10, All
        const amounts = [1, 5, 10, current];
        const btnRow = el('div', 'land-invasive-btn-row');
        for (const amt of amounts) {
          if (amt <= 0 || amt > current) continue;
          const cost = amt * inv.removeCpPerAcre;
          const canAfford = cp >= cost;
          const label = amt === current ? `All (${amt})` : `${amt}`;
          const btn = el('button', `action-btn land-remove-btn${canAfford ? '' : ' disabled'}`, `Remove ${label} · ${cost} CP`);
          if (!canAfford) btn.disabled = true;
          btn.addEventListener('click', () => {
            const result = engine.removeInvasiveAcres(inv.id, amt);
            if (result.ok) renderAll();
          });
          btnRow.appendChild(btn);
        }
        actionsDiv.appendChild(btnRow);
      }
    }
  }
  content.appendChild(invSect);

  // ── Link to Map tab ────────────────────────────────────────────────────────
  const mapLink = el('div', 'land-section');
  mapLink.innerHTML = '<h2 class="land-section-header">🧑‍🌾 Farm Map</h2>';
  const goMapBtn = el('button', 'action-btn', '🧑‍🌾 Open Map View');
  goMapBtn.addEventListener('click', () => { activeTab = 'map'; renderAll(); });
  mapLink.appendChild(goMapBtn);
  content.appendChild(mapLink);
}

// ── MAP TAB ───────────────────────────────────────────────────────────────────
let _mapMode = 'overview';  // 'overview' | 'farm'

function renderMap() {
  content.classList.add('map-mode');
  if (_mapMode === 'overview') content.classList.add('map-mode-overview');

  // ── Mode toggle bar ──────────────────────────────────────────────────────
  const modeBar = el('div', 'map-mode-bar');
  const overviewBtn = el('button', `map-mode-btn${_mapMode === 'overview' ? ' active' : ''}`, '🌎 Ecoregion Map');
  const farmBtn     = el('button', `map-mode-btn${_mapMode === 'farm' ? ' active' : ''}`, '🧑‍🌾 Farm View');
  overviewBtn.addEventListener('click', () => { _mapMode = 'overview'; renderAll(); });
  farmBtn.addEventListener('click', () => { _mapMode = 'farm'; renderAll(); });
  modeBar.appendChild(overviewBtn);
  modeBar.appendChild(farmBtn);
  content.appendChild(modeBar);

  if (_mapMode === 'overview') {
    _renderEcoregionOverview();
  } else {
    _renderFarmView();
  }
}

// ── Ecoregion Overview Map ────────────────────────────────────────────────────
function _renderEcoregionOverview() {
  const mapWrap = el('div', 'farm-canvas-wrap eco-map-wrap');
  const mapDiv  = document.createElement('div');
  mapDiv.id = 'eco-leaflet-map';
  mapWrap.appendChild(mapDiv);
  content.appendChild(mapWrap);

  // ── Stats panel below map ────────────────────────────────────────────────
  const statsPanel = el('div', 'eco-stats-panel');
  const eco = currentRegionData; // current active ecoregion (from prestige meta)
  const totalAcres   = engine.totalLandAcres;
  const allocAcres   = engine.getAllocatedAcres();
  const invadedAcres = engine.getTotalInvadedAcres();
  const freeAcres    = engine.getFreeAcres();
  const plantedCount = engine.plantedSpecies.size;
  const totalPlants  = eco.plants.length;
  const discovered   = engine.discoveredCreatures.size;

  // ── Collection & prestige progress ───────────────────────────────────────
  const collection = regionCollectionScore(engine);
  const prestigeCheck = checkPrestige(meta, engine);
  const pctComplete = Math.round(collection.fraction * 100);
  const thresholdPct = Math.round(prestigeCheck.threshold * 100);
  const bd = collection.breakdown;

  statsPanel.innerHTML = `
    <div class="eco-stats-header">
      <span class="eco-stats-icon">${eco.icon}</span>
      <span class="eco-stats-title">${eco.label}</span>
      <span class="eco-bp-badge" title="Total Biosphere Points (prestige currency)">🌍 ${meta.totalBP} BP</span>
    </div>
    <div class="eco-stats-desc">${eco.desc}</div>
    <div class="eco-stats-grid">
      <div class="eco-stat"><span class="eco-stat-num">${totalAcres}</span><span class="eco-stat-lbl">Total Acres</span></div>
      <div class="eco-stat"><span class="eco-stat-num">${allocAcres}</span><span class="eco-stat-lbl">In Use</span></div>
      <div class="eco-stat"><span class="eco-stat-num">${invadedAcres}</span><span class="eco-stat-lbl">Invaded</span></div>
      <div class="eco-stat"><span class="eco-stat-num">${freeAcres}</span><span class="eco-stat-lbl">Free</span></div>
      <div class="eco-stat"><span class="eco-stat-num">${plantedCount}/${totalPlants}</span><span class="eco-stat-lbl">Native Species</span></div>
      <div class="eco-stat"><span class="eco-stat-num">${discovered}</span><span class="eco-stat-lbl">Wildlife Found</span></div>
    </div>
    <div class="eco-stats-bar">
      <div style="width:${totalAcres > 0 ? Math.round(allocAcres / totalAcres * 100) : 0}%;background:#4caf50"></div>
      <div style="width:${totalAcres > 0 ? Math.round(freeAcres / totalAcres * 100) : 0}%;background:#78909c"></div>
      <div style="width:${totalAcres > 0 ? Math.round(invadedAcres / totalAcres * 100) : 0}%;background:#e57373"></div>
    </div>
    <div class="eco-stats-legend">
      <span>🟩 In Use</span><span>⬜ Free</span><span>🟥 Invaded</span>
    </div>
    <div class="eco-prestige-section">
      <div class="eco-prestige-title">🏆 Region Collection — ${pctComplete}%</div>
      <div class="eco-collection-grid">
        <span>🌿 Plants: ${bd.plants.current}/${bd.plants.max}</span>
        <span>🦋 Creatures: ${bd.creatures.current}/${bd.creatures.max}</span>
        <span>🐦 Birds: ${bd.birds.current}/${bd.birds.max}</span>
        <span>🔬 Research: ${bd.research.current}/${bd.research.max}</span>
        <span>🌾 Crop Mastery: ${bd.crops.current}/${bd.crops.max}</span>
        <span>🛡️ Invasives Cleared: ${bd.invasives.current}/${bd.invasives.max}</span>
      </div>
      <div class="eco-prestige-bar-wrap">
        <div class="eco-prestige-bar">
          <div class="eco-prestige-fill" style="width:${Math.min(100, pctComplete)}%"></div>
          <div class="eco-prestige-threshold" style="left:${thresholdPct}%" title="Prestige threshold: ${thresholdPct}%"></div>
        </div>
        <div class="eco-prestige-bar-labels">
          <span>0%</span><span>${thresholdPct}% to prestige</span><span>100%</span>
        </div>
      </div>
      ${prestigeCheck.canPrestige && !meta.prestiged[eco.id] ? `<div class="eco-prestige-ready">✨ Ready to prestige! ${eco.prestigeReward ?? ''}</div>` : ''}
      ${meta.prestiged[eco.id] ? `<div class="eco-prestige-done">✅ Prestiged · ${meta.regionBP[eco.id] ?? 0} BP earned · Gold ×${bpGoldMultiplier(meta.totalBP).toFixed(1)}</div>` : ''}
    </div>
  `;

  // Add prestige button if eligible
  if (prestigeCheck.canPrestige && !meta.prestiged[eco.id]) {
    const prestigeBtn = el('button', 'action-btn prestige-btn', `🌟 Prestige ${eco.name}`);
    prestigeBtn.addEventListener('click', () => {
      const result = executePrestige(meta, engine);
      if (result.ok) {
        // Apply updated BP multiplier to running engine
        engine.setPrestigeGoldMult(bpGoldMultiplier(meta.totalBP));
        saveGame();
        renderAll();
        // Show prestige toast
        const mult = bpGoldMultiplier(meta.totalBP).toFixed(1);
        showToast(`🌟 Prestiged! +${result.bpAwarded} BP earned. Gold multiplier now ${mult}×`
          + (result.newRegions.length ? ` — ${result.newRegions.length} new region${result.newRegions.length > 1 ? 's' : ''} unlocked!` : ''));
      }
    });
    statsPanel.querySelector('.eco-prestige-section').appendChild(prestigeBtn);
  }

  content.appendChild(statsPanel);

  // ── Leaflet map with OSM tiles + ecoregion polygon overlays ───────────────
  const activeCode = eco.code; // e.g. '8.3'
  // Build set of unlocked ecoregion codes from prestige meta
  const _unlockedCodes = new Set();
  for (const rid of meta.unlockedRegionIds) {
    const r = getRegion(rid);
    if (r) _unlockedCodes.add(r.code);
  }

  const map = L.map(mapDiv, {
    center: [45, -100],
    zoom: 3,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: true,
    attributionControl: true,
  });

  // Dark-themed OSM tiles (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  // Tooltip element (reused for hover)
  const tooltip = L.DomUtil.create('div', 'eco-tooltip eco-leaflet-tooltip', mapDiv);
  tooltip.hidden = true;

  // ── Draw ecoregion polygons ──────────────────────────────────────────────
  const ecoLayers = {};

  for (const ecoP of ECOREGION_POLYGONS) {
    if (ecoP.code === '0.0') continue; // skip water features
    const isActive   = ecoP.code === activeCode;
    const isUnlocked = _unlockedCodes.has(ecoP.code);

    // Convert [lon, lat] → [lat, lon] for Leaflet
    const latLngs = ecoP.polygons
      .filter(p => p.length >= 3)
      .map(p => p.map(([lon, lat]) => [lat, lon]));

    if (!latLngs.length) continue;

    let style;
    if (isActive) {
      style = { color: '#ffd700', weight: 2.5, fillColor: ecoP.color, fillOpacity: 0.55 };
    } else if (isUnlocked) {
      style = { color: 'rgba(255,255,255,0.4)', weight: 1, fillColor: ecoP.color, fillOpacity: 0.45 };
    } else {
      style = { color: 'rgba(100,100,100,0.3)', weight: 0.5, fillColor: '#3c3c3c', fillOpacity: 0.35 };
    }

    const layer = L.polygon(latLngs, style).addTo(map);

    // Hover tooltip
    layer.on('mouseover', (e) => {
      tooltip.hidden = false;
      const status = isActive ? '✅ Active'
        : isUnlocked ? '🔓 Unlocked — click to switch'
        : '🔒 Locked';
      tooltip.innerHTML = `<strong>${ecoP.code} – ${ecoP.name}</strong><br>${status}`;
      if (!isActive) {
        layer.setStyle({ fillOpacity: isUnlocked ? 0.65 : 0.5, weight: 1.5 });
      }
    });
    layer.on('mousemove', (e) => {
      const pt = map.mouseEventToContainerPoint(e.originalEvent);
      tooltip.style.left = Math.min(pt.x + 14, mapDiv.clientWidth - 180) + 'px';
      tooltip.style.top  = Math.max(pt.y - 40, 4) + 'px';
    });
    layer.on('mouseout', () => {
      tooltip.hidden = true;
      layer.setStyle(style);
    });

    // Click — switch to farm view if active region, or switch region if unlocked
    if (isActive) {
      layer.on('click', () => {
        _mapMode = 'farm';
        renderAll();
      });
    } else if (isUnlocked) {
      const _targetRegionId = CODE_TO_GAME_ID[ecoP.code];
      if (_targetRegionId) {
        layer.on('click', () => {
          const result = switchRegion(meta, engine, _targetRegionId);
          if (result.ok) {
            currentRegionData = result.regionData;
            engine = createEngine(currentRegionData);
            resetRegionDerivedState();
            engine.setPrestigeGoldMult(bpGoldMultiplier(meta.totalBP));
            if (result.savedState) {
              engine.applyState(result.savedState);
            } else {
              // New region — apply BP bonuses
              const bonuses = getStartingBonuses(meta);
              engine.gold.amount = bonuses.startingGold;
            }
            renderAll();
          }
        });
      }
    }

    ecoLayers[ecoP.code] = layer;
  }

  // ── Draw US border polyline ──────────────────────────────────────────────
  const usBorderLL = US_BORDER.map(([lon, lat]) => [lat, lon]);
  L.polyline(usBorderLL, {
    color: 'rgba(200,200,200,0.3)',
    weight: 1.5,
    dashArray: '6,4',
    interactive: false,
  }).addTo(map);

  // ── Ecoregion labels (via markers with DivIcon) ──────────────────────────
  function _polyCentroid(coords) {
    let cx = 0, cy = 0;
    for (const [lon, lat] of coords) { cx += lon; cy += lat; }
    return [cy / coords.length, cx / coords.length]; // [lat, lon]
  }

  for (const ecoP of ECOREGION_POLYGONS) {
    if (ecoP.code === '0.0') continue;
    if (!ecoP.polygons.length || ecoP.polygons[0].length < 3) continue;
    const center = _polyCentroid(ecoP.polygons[0]);
    const isActive = ecoP.code === activeCode;
    const labelHtml = isActive
      ? `<span style="color:#ffd700;font-weight:bold">${ecoP.code}</span><br><span style="color:#fff;font-size:9px">${ecoP.name}</span>`
      : `<span style="color:rgba(180,180,180,0.6)">${ecoP.code}</span>`;

    L.marker(center, {
      icon: L.divIcon({
        className: 'eco-label-icon',
        html: labelHtml,
        iconSize: [100, 30],
        iconAnchor: [50, 15],
      }),
      interactive: false,
    }).addTo(map);
  }

  // Invalidate size after DOM is settled (Leaflet needs this)
  requestAnimationFrame(() => map.invalidateSize());

  // ── Cleanup on tab switch ────────────────────────────────────────────────
  const _mo = new MutationObserver(() => {
    if (!mapDiv.isConnected) {
      map.remove();
      _mo.disconnect();
    }
  });
  _mo.observe(content, { childList: true });
}

function _pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Farm View (pixel-art canvas) ──────────────────────────────────────────────
function _renderFarmView() {
  const canvasWrap = el('div', 'farm-canvas-wrap');
  const farmCanvas = document.createElement('canvas');
  farmCanvas.id = 'farm-canvas';
  canvasWrap.appendChild(farmCanvas);

  // Floating toolbar overlay (zoom + fullscreen)
  const toolbar = el('div', 'map-toolbar');
  const zoomOutBtn = el('button', 'map-tool-btn', '−');
  zoomOutBtn.title = 'Zoom out';
  const zoomLabel  = el('span', 'map-zoom-label', '1×');
  const zoomInBtn  = el('button', 'map-tool-btn', '+');
  zoomInBtn.title = 'Zoom in';
  const fsBtn = el('button', 'map-tool-btn', '⛶');
  fsBtn.title = 'Fullscreen';
  toolbar.appendChild(zoomOutBtn);
  toolbar.appendChild(zoomLabel);
  toolbar.appendChild(zoomInBtn);
  toolbar.appendChild(fsBtn);
  canvasWrap.appendChild(toolbar);

  // Speech bubble overlay (positioned by farmer callback)
  const speechBubble = el('div', 'farm-speech');
  speechBubble.innerHTML = `
    <div class="farm-speech-arrow"></div>
    <img class="farm-speech-photo" src="${BLANK_GIF}" alt="" hidden>
    <div class="farm-speech-content">
      <div class="farm-speech-header">
        <span class="farm-speech-icon"></span>
        <span class="farm-speech-heading"></span>
      </div>
      <div class="farm-speech-text"></div>
      <div class="farm-speech-pager"></div>
    </div>
  `;
  speechBubble.hidden = true;
  canvasWrap.appendChild(speechBubble);

  content.appendChild(canvasWrap);

  // Fullscreen toggle
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      canvasWrap.requestFullscreen().catch(() => {});
    }
  });
  const _onFsChange = () => {
    fsBtn.title = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
  };
  document.addEventListener('fullscreenchange', _onFsChange);

  // Helper: look up best available photo URL for a scientific name
  function _speechPhotoUrl(sci) {
    if (!sci) return null;
    const url = STATIC_INAT_PHOTOS[sci] || inatPhotoCache[sci] || null;
    if (url) return url.replace('/square.', '/medium.');
    return null;
  }

  // Start the pixel-art farm view
  let _speechLastSci = null;
  currentFarmView = new FarmView(farmCanvas, engine);

  // Zoom controls
  const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
  let zoomIdx = 0;
  function _applyZoom() {
    currentFarmView.setZoom(ZOOM_STEPS[zoomIdx]);
    zoomLabel.textContent = `${ZOOM_STEPS[zoomIdx]}×`;
    zoomOutBtn.disabled = zoomIdx <= 0;
    zoomInBtn.disabled  = zoomIdx >= ZOOM_STEPS.length - 1;
  }
  zoomInBtn.addEventListener('click', () => {
    if (zoomIdx < ZOOM_STEPS.length - 1) { zoomIdx++; _applyZoom(); }
  });
  zoomOutBtn.addEventListener('click', () => {
    if (zoomIdx > 0) { zoomIdx--; _applyZoom(); }
  });
  _applyZoom();

  // Clean up listeners when view stops
  const _origStop = currentFarmView.stop.bind(currentFarmView);
  currentFarmView.stop = () => {
    document.removeEventListener('fullscreenchange', _onFsChange);
    content.classList.remove('map-mode');
    if (document.fullscreenElement && document.fullscreenElement.classList.contains('farm-canvas-wrap')) {
      document.exitFullscreen().catch(() => {});
    }
    _origStop();
  };
  currentFarmView.onSpeechUpdate = (data) => {
    if (!data) { speechBubble.hidden = true; _speechLastSci = null; return; }
    speechBubble.hidden = false;
    speechBubble.querySelector('.farm-speech-icon').textContent = data.icon || '';
    speechBubble.querySelector('.farm-speech-heading').textContent = data.heading || '';
    speechBubble.querySelector('.farm-speech-text').textContent = data.text || '';
    speechBubble.querySelector('.farm-speech-pager').textContent =
      data.factTotal > 1 ? `${data.factNum} / ${data.factTotal}` : '';

    // Photo
    const photoEl = speechBubble.querySelector('.farm-speech-photo');
    const sci = data.sci || null;
    if (sci !== _speechLastSci) {
      _speechLastSci = sci;
      const photoUrl = _speechPhotoUrl(sci);
      if (photoUrl) {
        photoEl.src = photoUrl;
        photoEl.hidden = false;
      } else {
        photoEl.hidden = true;
        photoEl.src = BLANK_GIF;
        if (sci) _fetchInatTaxon(sci);
      }
    }

    // Position bubble above farmer (clamped inside canvas wrapper)
    const wrapRect = canvasWrap.getBoundingClientRect();
    const bubbleW  = speechBubble.offsetWidth || 300;
    const bubbleH  = speechBubble.offsetHeight || 120;
    let left = data.farmerPx - bubbleW / 2 + 8;
    left = Math.max(4, Math.min(left, wrapRect.width - bubbleW - 4));
    let top  = data.farmerPy - bubbleH - 12;
    if (top < 4) top = data.farmerPy + 24;
    speechBubble.style.left = `${left}px`;
    speechBubble.style.top  = `${top}px`;
  };
  currentFarmView.start();
}

// ── COLLECTION TAB ────────────────────────────────────────────────────────────
function renderCollection() {
  const planted    = engine.plantedSpecies;
  const discovered = engine.discoveredCreatures;
  const pityMap    = engine.creaturePity;
  const PITY_DAYS  = engine.CREATURE_PITY_DAYS;

  // Build flat lookup: creatureKey → { creature, hostPlants: [{plant, eco}] }
  const creatureMap = new Map();
  for (const eco of ECOREGIONS) {
    for (const plant of eco.plants) {
      for (const creature of (plant.insectsHosted ?? [])) {
        const ckey = engine.creatureKey(creature.name);
        if (!creatureMap.has(ckey)) creatureMap.set(ckey, { creature, hostPlants: [] });
        creatureMap.get(ckey).hostPlants.push({ plant, eco });
      }
    }
  }
  // Separate bird-type creatures (they'll be shown in the Birds section)
  const nonBirdCreatureMap = new Map([...creatureMap].filter(([, v]) => v.creature.type !== 'bird'));
  const birdCreatureMap    = new Map([...creatureMap].filter(([, v]) => v.creature.type === 'bird'));
  const totalCreatures  = nonBirdCreatureMap.size;
  const discoveredCount = [...discovered].filter(k => nonBirdCreatureMap.has(k)).length;
  const totalBirdCreatures    = birdCreatureMap.size;
  const discoveredBirdCreatures = [...discovered].filter(k => birdCreatureMap.has(k)).length;
  const totalBirds = BIRD_LIST.length + totalBirdCreatures;
  const foundBirds = engine.discoveredBirds.size + discoveredBirdCreatures;
  const unlockedCrops        = getUnlockedCrops();
  const unlockedRanchAnimals = engine.unlockedRanchAnimals;
  const totalCropCount       = Object.keys(getCropCatalog()).length;
  const totalRanchCount      = ENABLE_RANCH ? RANCH_ANIMAL_LIST.length : 0;

  // ── Biosphere banner ────────────────────────────────────────────────────────
  const researchBio      = engine.getBiosphereScore();
  const gardenBio        = engine.getGardenBiosphereScore();
  const creatureBio      = engine.getCreatureBiosphereScore();
  const maxResearchBio   = RESEARCH.reduce((s, r) => s + (r.effect?.biosphereBonus ?? 0), 0);
  const maxGardenBio     = ALL_PLANTS.reduce((s, p) => s + (p.biosphereBonus ?? 0), 0);
  const birdBio          = engine.discoveredBirds.size;
  const totalBio         = researchBio + gardenBio + creatureBio + birdBio;
  const maxTotal         = maxResearchBio + maxGardenBio + totalCreatures + totalBirds;
  const goldMult         = engine.getGoldMultiplier();
  const bioPct           = maxTotal > 0 ? Math.round(totalBio / maxTotal * 100) : 0;
  const completedResearchCount = engine.completedResearch.size;
  const totalResearchCount     = RESEARCH.length;
  const plantedCount           = planted.size;
  const totalPlantCount        = ALL_PLANTS.length;

  const showCrops      = collectionFilter === 'all' || collectionFilter === 'crops';
  const showPlants     = collectionFilter === 'all' || collectionFilter === 'plants';
  const showCreatures  = collectionFilter === 'all' || collectionFilter === 'creatures';
  const showRanch      = ENABLE_RANCH && (collectionFilter === 'all' || collectionFilter === 'ranch');
  const showHistory    = collectionFilter === 'history';
  const showBirds      = collectionFilter === 'all' || collectionFilter === 'birds';
  const showInvasives  = collectionFilter === 'all' || collectionFilter === 'invasives';

  const researchedInvasives = INVASIVES.filter(inv => engine.completedResearch.has(inv.requiredResearch));
  const researchedInvasiveCount = researchedInvasives.length;
  const totalHistoryCount = discoveredCount + discoveredBirdCreatures + engine.discoveredBirds.size;
  const irlTotal = irlTotalCount();
  const archiveFound = completedResearchCount + plantedCount + discoveredCount + foundBirds + researchedInvasiveCount + unlockedCrops.length + unlockedRanchAnimals.size;
  const archiveTotal = totalResearchCount + totalPlantCount + totalCreatures + totalBirds + INVASIVES.length + totalCropCount + totalRanchCount;
  const archivePct = archiveTotal > 0 ? Math.round(archiveFound / archiveTotal * 100) : 0;
  const wildlifeRemaining = Math.max(0, (totalCreatures + totalBirds) - (discoveredCount + foundBirds));
  const plantRemaining = Math.max(0, totalPlantCount - plantedCount);

  let collectionFocus;
  if (showHistory) {
    collectionFocus = {
      kicker: 'Archive log',
      title: `${discoveredCount + foundBirds} wildlife discoveries are recorded on the timeline`,
      body: 'Use the history view to trace when the sim started compounding from new plants, insects, and birds.',
      tone: totalHistoryCount > 0 ? 'info' : 'warn',
    };
  } else if (showIrlOnly && irlTotal > 0) {
    collectionFocus = {
      kicker: 'Real-world filter',
      title: `Showing ${irlTotal} real-garden record${irlTotal !== 1 ? 's' : ''}`,
      body: 'This view is narrowed to what you have tracked outside the sim, so the archive doubles as a field notebook.',
      tone: 'info',
    };
  } else if (wildlifeRemaining > 0) {
    collectionFocus = {
      kicker: 'Wildlife frontier',
      title: `${wildlifeRemaining} creature and bird entries are still missing`,
      body: 'Keep host plants established and let time run. The archive fills fastest when habitat diversity is still widening.',
      tone: 'grow',
    };
  } else if (plantRemaining > 0) {
    collectionFocus = {
      kicker: 'Flora gaps',
      title: `${plantRemaining} native plant${plantRemaining !== 1 ? 's are' : ' is'} still missing from the guide`,
      body: 'Research may already support them. The next step is turning open acreage and CP into permanent habitat entries.',
      tone: 'ready',
    };
  } else if (researchedInvasiveCount < INVASIVES.length) {
    const invasiveGap = INVASIVES.length - researchedInvasiveCount;
    collectionFocus = {
      kicker: 'Control dossier',
      title: `${invasiveGap} invasive profile${invasiveGap !== 1 ? 's are' : ' is'} still locked`,
      body: 'The field guide is broad, but invasive-control research still has gaps before the archive is truly complete.',
      tone: 'warn',
    };
  } else {
    collectionFocus = {
      kicker: 'Field guide',
      title: 'The collection is acting like a full archive now',
      body: 'At this stage the guide is less about missing entries and more about reviewing what your runs have already taught you.',
      tone: 'info',
    };
  }

  const banner = el('div', 'research-banner collection-banner');
  banner.innerHTML = `
    <div class="research-banner-row">
      <span class="bio-label">🗂️ Archive Coverage</span>
      <span class="bio-score">${totalBio} <span class="bio-max">/ ${maxTotal}</span></span>
      <span class="research-pts">${archivePct}% logged</span>
    </div>
    <div class="bio-bar-track"><div class="bio-bar-fill" style="width:${bioPct}%"></div></div>
    <div class="bio-breakdown">
      <span>🌱 Conservation: <strong>${completedResearchCount}</strong> / ${totalResearchCount}</span>
      <span>🌿 Plants: <strong>${plantedCount}</strong> / ${totalPlantCount}</span>
      <span>🦋 Creatures: <strong>${discoveredCount}</strong> / ${totalCreatures}</span>
      <span>🐦 Birds: <strong>${foundBirds}</strong> / ${totalBirds}</span>
      <span>💰 Gold Bonus: <strong>${goldMult.toFixed(2)}×</strong></span>
    </div>
    <p class="research-hint collection-hint">${archiveFound} of ${archiveTotal} archive entries are logged across research, flora, wildlife, production, and invasive control.</p>
  `;
  content.appendChild(banner);

  // ── Filter bar ──────────────────────────────────────────────────────────────
  const filterBar = el('div', 'collection-filter-bar');
  const filterDefs = [
    { key: 'all',       label: 'All'                                                                              },
    { key: 'crops',     label: `🌾 Crops (${unlockedCrops.length} / ${totalCropCount})`                         },
    { key: 'plants',    label: `🌿 Native Plants (${planted.size} / ${totalPlantCount})`                         },
    { key: 'creatures', label: `🦋 Creatures (${discoveredCount} / ${totalCreatures})`                           },
    { key: 'birds',     label: `🐦 Birds (${foundBirds} / ${totalBirds})`                                        },
    { key: 'invasives', label: `🛡️ Invasives (${researchedInvasiveCount} / ${INVASIVES.length})`                  },
    ...(ENABLE_RANCH ? [{ key: 'ranch', label: `🐄 Ranch Animals (${unlockedRanchAnimals.size} / ${totalRanchCount})` }] : []),
    { key: 'history',   label: `📊 History (${totalHistoryCount})` },
  ];
  for (const fd of filterDefs) {
    const btn = el('button', `collection-filter-btn${collectionFilter === fd.key ? ' active' : ''}`, fd.label);
    btn.addEventListener('click', () => { collectionFilter = fd.key; renderAll(); });
    filterBar.appendChild(btn);
  }

  // Collapse-all / expand-all toggle (only relevant when plants section is shown)
  if (showPlants && planted.size > 0) {
    const toggleAllBtn = el('button', `collection-filter-btn collection-collapse-all-btn`, collectionAllCollapsed ? '▶ Expand All' : '▼ Collapse All');
    toggleAllBtn.addEventListener('click', () => {
      collectionAllCollapsed = !collectionAllCollapsed;
      if (collectionAllCollapsed) {
        for (const eco of ECOREGIONS) for (const p of eco.plants) if (planted.has(p.id)) collectionCreaturesCollapsed.add(p.id);
      } else {
        collectionCreaturesCollapsed.clear();
      }
      renderAll();
    });
    filterBar.appendChild(toggleAllBtn);
  }

  // Show undiscovered toggle
  if (showCreatures || showBirds || (collectionFilter === 'all')) {
    const undiscBtn = el('button', `collection-filter-btn tab-toggle-btn${showUndiscoveredCollection ? ' active' : ''}`,
      showUndiscoveredCollection ? '👁 Hide locked' : '🔒 Show locked');
    undiscBtn.addEventListener('click', () => {
      showUndiscoveredCollection = !showUndiscoveredCollection;
      localStorage.setItem('showUndiscoveredCollection', showUndiscoveredCollection);
      renderAll();
    });
    filterBar.appendChild(undiscBtn);
  }

  // IRL filter toggle
  const irlBtn = el('button', `collection-filter-btn tab-toggle-btn irl-filter-btn${showIrlOnly ? ' active' : ''}`,
    showIrlOnly ? `🌱 Show all (${irlTotal} IRL)` : `🌱 My Real Garden (${irlTotal})`);
  irlBtn.addEventListener('click', () => {
    showIrlOnly = !showIrlOnly;
    localStorage.setItem('showIrlOnly', showIrlOnly);
    renderAll();
  });
  filterBar.appendChild(irlBtn);

  content.appendChild(filterBar);

  const collectionFocusCallout = el('div', 'focus-callout collection-focus-callout');
  collectionFocusCallout.dataset.tone = collectionFocus.tone;
  collectionFocusCallout.innerHTML = `
    <span class="focus-kicker">${collectionFocus.kicker}</span>
    <strong class="focus-title">${collectionFocus.title}</strong>
    <p class="focus-body">${collectionFocus.body}</p>
  `;
  content.appendChild(collectionFocusCallout);

  // IRL summary banner
  if (irlTotal > 0) {
    const irlSummary = el('div', 'irl-summary');
    const pc = irlCount('plant'), cc = irlCount('creature'), bc = irlCount('bird'), ic = irlCount('invasive'), crc = irlCount('crop'), rc = irlCount('ranch');
    const parts = [];
    if (pc > 0) parts.push(`🌿 ${pc} planted`);
    if (cc > 0) parts.push(`🦋 ${cc} spotted`);
    if (bc > 0) parts.push(`🐦 ${bc} spotted`);
    if (ic > 0) parts.push(`🛡️ ${ic} invasives`);
    if (crc > 0) parts.push(`🌾 ${crc} crops`);
    if (rc > 0) parts.push(`🐄 ${rc} ranch`);
    irlSummary.innerHTML = `
      <div class="irl-summary-head">
        <strong class="irl-summary-title">🌱 My Real Garden</strong>
        <span class="irl-summary-total">${irlTotal} tracked</span>
      </div>
      <div class="irl-summary-chips">${parts.map(part => `<span class="irl-summary-chip">${part}</span>`).join('')}</div>
    `;
    content.appendChild(irlSummary);
  }

  // ── Crops ───────────────────────────────────────────────────────────────────
  if (showCrops) {
    content.appendChild(el('h2', 'section-header', `🌾 Crops — ${unlockedCrops.length} of ${Object.keys(getCropCatalog()).length} unlocked`));
    if (unlockedCrops.length === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Harvest crops in the 🌾 Crops tab to unlock new varieties. —'));
    }
    for (const ct of unlockedCrops) {
      if (showIrlOnly && !isIrl('crop', ct.id)) continue;
      const stats = engine.cropStats.get(ct.id) ?? { grown: 0, lifetimeSales: 0 };
      const mastery = getCropMasterySummary(ct.id);
      const masteryHtml = mastery.thresholds.map((threshold, index) => {
        const met = mastery.grown >= threshold;
        return `<span class="research-req${met ? ' met' : ''}">${met ? '✅' : '🌱'} Tier ${index + 1} · ${shortNumber(threshold)}</span>`;
      }).join('');
      const card = el('div', 'collection-crop-card');
      card.dataset.collectionid = ct.id;
      const cardHead = el('div', 'collection-crop-head');
      cardHead.innerHTML = `
        ${ct.sciName ? inatThumbHtml(ct.sciName, 'collection-crop-thumb', ct.name) : ''}
        <div class="collection-crop-names">
          <span class="collection-plant-name">${ct.name}</span>
          ${speciesLinksHtml(ct.sciName, ct.name)}
          <span class="collection-crop-mastery-summary">🌱 ${mastery.label}</span>
          <span class="collection-crop-mastery-detail">${mastery.detail}</span>
          <div class="collection-crop-mastery">${masteryHtml}</div>
        </div>
        <div class="collection-crop-stats">
          <span class="collection-crop-stat">🌾 Harvested: <strong>${shortNumber(stats.grown)}</strong></span>
          <span class="collection-crop-stat">🪙 Earned: <strong>${shortNumber(stats.lifetimeSales)}g</strong></span>
        </div>
      `;
      card.appendChild(cardHead);
      if (ct.sciName) {
        const descEl = el('p', 'garden-desc inat-desc-lazy');
        descEl.dataset.inatDesc = ct.sciName;
        if (ct.sciName in inatDescCache && inatDescCache[ct.sciName]) {
          descEl.textContent = inatDescCache[ct.sciName];
        }
        card.appendChild(descEl);
      }
      // IRL bar
      const cropIrlEl = el('div', '');
      cropIrlEl.innerHTML = irlBarHtml('crop', ct.id, ct.sciName, 'Grown IRL');
      card.appendChild(cropIrlEl.firstElementChild);
      content.appendChild(card);
    }
  }

  // ── Ranch Animals ──────────────────────────────────────────────────────────
  if (showRanch) {
    content.appendChild(el('h2', 'section-header', `🐄 Ranch Animals — ${unlockedRanchAnimals.size} of ${RANCH_ANIMAL_LIST.length} unlocked`));
    if (unlockedRanchAnimals.size === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Harvest crops in the 🌾 Crops tab to unlock ranch animals. —'));
    }
    for (const animal of RANCH_ANIMAL_LIST) {
      if (!unlockedRanchAnimals.has(animal.id)) continue;
      if (showIrlOnly && !isIrl('ranch', animal.id)) continue;
      const stats = engine.ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
      const card = el('div', 'collection-crop-card');
      card.dataset.collectionid = animal.id;
      const cardHead = el('div', 'collection-crop-head');
      cardHead.innerHTML = `
        ${animal.sci ? inatThumbHtml(animal.sci, 'collection-crop-thumb', animal.name) : `<span style="font-size:48px;flex-shrink:0">${animal.icon}</span>`}
        <div class="collection-crop-names">
          <span class="collection-plant-name">${animal.name}</span>
          ${speciesLinksHtml(animal.sci)}
          <span style="font-size:12px;color:#aaa;display:block;margin-top:4px">Product: ${animal.product}</span>
        </div>
        <div class="collection-crop-stats">
          <span class="collection-crop-stat">🐄 Cycles: <strong>${shortNumber(stats.produced)}</strong></span>
          <span class="collection-crop-stat">💰 Sold: <strong>${shortNumber(stats.sold)}</strong></span>
          <span class="collection-crop-stat">🪙 Earned: <strong>${shortNumber(stats.lifetimeSales)}g</strong></span>
        </div>
      `;
      card.appendChild(cardHead);
      const careP = el('p', 'ranch-care', animal.care);
      card.appendChild(careP);
      // IRL bar
      const ranchIrlEl = el('div', '');
      ranchIrlEl.innerHTML = irlBarHtml('ranch', animal.id, animal.sci, 'Raised IRL');
      card.appendChild(ranchIrlEl.firstElementChild);
      content.appendChild(card);
    }
  }

  // ── Native Plants ───────────────────────────────────────────────────────────
  if (showPlants) {
    content.appendChild(el('h2', 'section-header', `🌿 Native Plants — ${planted.size} of ${totalPlantCount} established`));

    if (planted.size === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Plant native species in the 🌿 Garden tab to begin your collection. —'));
    }

    for (const eco of ECOREGIONS) {
      for (const plant of eco.plants) {
        if (!planted.has(plant.id)) continue;
        if (showIrlOnly && !isIrl('plant', plant.id)) continue;

        const plantCreatures  = plant.insectsHosted ?? [];
        const discoveredHere  = plantCreatures.filter(c => discovered.has(engine.creatureKey(c.name))).length;
        const totalHere       = plantCreatures.length;
        const allFound        = discoveredHere === totalHere;

        const card = el('div', 'collection-plant-card');
        card.dataset.collectionid = plant.id;

        // Card head: photo + name + meta + badges
        const cardHead = el('div', 'collection-plant-head');
        cardHead.innerHTML = `
          ${inatThumbHtml(plant.sci, 'collection-plant-thumb', plant.name)}
          <div class="collection-plant-names">
            <span class="collection-plant-name">${plant.name}</span>
            ${speciesLinksHtml(plant.sci, plant.name)}
            <span class="collection-plant-meta">↕️ ${plant.height ?? '—'} · 🌱 ${plant.seasonOfInterest ?? '—'}${plant.caterpillarSpp ? ` · 🐦 ${plant.caterpillarSpp}+ species` : ''}</span>
          </div>
          <div class="collection-plant-badges">
            <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
            <span class="collection-creature-count${allFound ? ' complete' : ''}">${discoveredHere}/${totalHere} observed</span>
            <span class="collection-plant-bp">🌍 +${plant.biosphereBonus} BP</span>
          </div>
        `;
        card.appendChild(cardHead);
        card.appendChild(el('p', 'garden-desc', plant.desc));

        // Creature list
        const isCollapsed = collectionCreaturesCollapsed.has(plant.id);
        const creatureList = el('div', `collection-creature-list${isCollapsed ? ' collapsed' : ''}`);
        const listHeader = el('button', 'collection-creature-list-header');
        listHeader.innerHTML = `<span class="collection-creature-list-chevron">${isCollapsed ? '▶' : '▼'}</span> 🦋 Insects &amp; Wildlife Hosted <span class="collection-creature-list-count">(${discoveredHere}/${totalHere})</span>`;
        listHeader.addEventListener('click', () => {
          if (collectionCreaturesCollapsed.has(plant.id)) {
            collectionCreaturesCollapsed.delete(plant.id);
            collectionAllCollapsed = false;
          } else {
            collectionCreaturesCollapsed.add(plant.id);
            // Update global state if all are now collapsed
            let allNowCollapsed = true;
            for (const eco2 of ECOREGIONS) for (const p2 of eco2.plants) if (planted.has(p2.id) && !collectionCreaturesCollapsed.has(p2.id)) { allNowCollapsed = false; break; }
            collectionAllCollapsed = allNowCollapsed;
          }
          renderAll();
        });
        creatureList.appendChild(listHeader);
        const creatureBody = el('div', 'collection-creature-list-body');
        creatureList.appendChild(creatureBody);

        for (const creature of plantCreatures) {
          const ckey         = engine.creatureKey(creature.name);
          const isDiscovered = discovered.has(ckey);
          const pity         = pityMap.get(ckey) ?? 0;
          const typeInfo     = CREATURE_TYPE_META[creature.type] ?? { label: creature.type, icon: '🐞', plural: creature.type };

          const row = el('div', `collection-creature-row${isDiscovered ? ' discovered' : ' undiscovered'}`);
          row.dataset.ckey = ckey;
          if (isDiscovered) {
            row.innerHTML = `
              <div class="garden-insect-label">
                <span class="insect-type-icon">${typeInfo.icon}</span>
                <span class="insect-name">${creature.name}</span>
                <span class="collection-plant-bp">🌍 +1 BP</span>
              </div>
            `;
          } else {
            const pityPct = Math.min(100, Math.round((pity / PITY_DAYS) * 100));
            row.innerHTML = `
              <div class="collection-creature-shadow">${typeInfo.icon}</div>
              <div class="collection-creature-info">
                <div class="collection-creature-head">
                  <span class="collection-creature-name undiscovered-name">❓ Not yet observed</span>
                  <span class="collection-creature-type-badge type-${creature.type}">${typeInfo.icon} ${typeInfo.label}</span>
                </div>
                <span class="collection-creature-role">Keep your land planted — this creature may appear over time.</span>
                <div class="collection-pity-bar-track"><div class="collection-pity-bar-fill" style="width:${pityPct}%"></div></div>
                <span class="collection-pity-label">${pity > 0 ? `${pity} day${pity !== 1 ? 's' : ''} scouted · ${pityPct}% to guaranteed discovery` : 'Not yet scouted'}</span>
              </div>
            `;
          }
          creatureBody.appendChild(row);
        }

        if (plant.wildlifeNote) {
          const wildEl = el('div', 'garden-wildlife-note');
          wildEl.innerHTML = `<span class="wildlife-note-icon">🌿</span> ${plant.wildlifeNote}`;
          creatureBody.appendChild(wildEl);
        }

        card.appendChild(creatureList);
        // IRL bar
        const plantIrlEl = el('div', '');
        plantIrlEl.innerHTML = irlBarHtml('plant', plant.id, plant.sci, 'Planted IRL');
        card.appendChild(plantIrlEl.firstElementChild);
        content.appendChild(card);
      }
    }
  }

  // ── Creatures index (excludes bird-type — those are in Birds section) ─────
  if (showCreatures) {
    content.appendChild(el('h2', 'section-header', `🦋 Observed Creatures — ${discoveredCount} of ${totalCreatures}`));

    if (discoveredCount === 0 && !showUndiscoveredCollection) {
      content.appendChild(el('p', 'research-idle-note', '— Establish native plants to attract insects and wildlife. —'));
    }

    const byType = new Map();
    // Always iterate through the full map to group by type
    for (const [ckey, entry] of nonBirdCreatureMap) {
      const { creature } = entry;
      const isDisc = discovered.has(ckey);
      if (!isDisc && !showUndiscoveredCollection) continue;
      if (!byType.has(creature.type)) byType.set(creature.type, []);
      byType.get(creature.type).push({ ckey, ...entry, isDiscovered: isDisc });
    }

    const typeOrder = ['butterfly', 'moth', 'bee', 'wasp', 'fly', 'beetle', 'mammal'];
    for (const type of typeOrder) {
      if (!byType.has(type)) continue;
      const entries  = byType.get(type);
      const typeInfo = CREATURE_TYPE_META[type] ?? { label: type, icon: '🐞', plural: type };
      const discInType = entries.filter(e => e.isDiscovered).length;

      content.appendChild(el('h3', 'collection-type-header', `${typeInfo.icon} ${typeInfo.plural} (${discInType} / ${entries.length})`));

      const grid = el('div', 'collection-creature-grid');
      for (const { creature, hostPlants, isDiscovered } of entries) {
        if (showIrlOnly && !isIrl('creature', engine.creatureKey(creature.name))) continue;
        const hostNames = hostPlants.map(h => h.plant.name).join(', ');
        const ccard = el('div', `collection-creature-card${isDiscovered ? '' : ' collection-bird-locked'}`);
        if (isDiscovered) {
          ccard.innerHTML = `
            ${creature.sci ? inatThumbHtml(creature.sci, 'collection-creature-card-thumb', creature.name) : `<span class="collection-creature-card-thumb-icon">${typeInfo.icon}</span>`}
            <div class="collection-creature-card-body">
              <div class="collection-creature-head">
                <span class="collection-creature-name">${creature.name}</span>
                <span class="collection-creature-type-badge type-${type}">${typeInfo.icon}</span>
              </div>
              ${speciesLinksHtml(creature.sci)}
              <span class="collection-host-label">Host: <strong>${hostNames}</strong></span>
              <span class="collection-creature-role">${creature.role}</span>
              <p class="collection-creature-note">${creature.note}</p>
              <span class="collection-creature-bp">+1 🌍 BP</span>
              ${irlBarHtml('creature', engine.creatureKey(creature.name), creature.sci, 'Spotted IRL')}
            </div>
          `;
        } else {
          const pity = pityMap.get(engine.creatureKey(creature.name)) ?? 0;
          const pityPct = Math.min(100, Math.round((pity / PITY_DAYS) * 100));
          ccard.innerHTML = `
            <span class="collection-creature-card-thumb-icon">${typeInfo.icon}</span>
            <div class="collection-creature-card-body">
              <div class="collection-creature-head">
                <span class="collection-creature-name undiscovered-name">❓ ${creature.name}</span>
                <span class="collection-creature-type-badge type-${type}">${typeInfo.icon}</span>
              </div>
              <span class="collection-host-label">Host: <strong>${hostNames}</strong></span>
              <span class="collection-creature-role">${pity > 0 ? `${pity} day${pity !== 1 ? 's' : ''} scouted · ${pityPct}%` : 'Not yet scouted — plant host species to begin'}</span>
              <div class="collection-pity-bar-track"><div class="collection-pity-bar-fill" style="width:${pityPct}%"></div></div>
            </div>
          `;
        }
        grid.appendChild(ccard);
      }
      content.appendChild(grid);
    }
  }

  // ── Birds (merged: plant-hosted bird creatures + BIRD_LIST attracted birds) ─
  if (showBirds) {
    const attractedBirds = engine.discoveredBirds;
    const birdMetrics    = engine.getBirdMetrics();
    const totalBirds     = BIRD_LIST.length + totalBirdCreatures;
    const foundBirds     = attractedBirds.size + discoveredBirdCreatures;
    content.appendChild(el('h2', 'section-header', `🐦 Birds — ${foundBirds} of ${totalBirds}`));

    // ── Plant-hosted birds (creature discovery system) ──
    if (totalBirdCreatures > 0) {
      const hostBirdEntries = [];
      for (const [ckey, entry] of birdCreatureMap) {
        const isDisc = discovered.has(ckey);
        if (!isDisc && !showUndiscoveredCollection) continue;
        hostBirdEntries.push({ ckey, ...entry, isDiscovered: isDisc });
      }
      if (hostBirdEntries.length > 0) {
        content.appendChild(el('h3', 'collection-type-header', `🪺 Host-Plant Birds (${discoveredBirdCreatures} / ${totalBirdCreatures})`));
        const hostGrid = el('div', 'collection-creature-grid');
        for (const { creature, hostPlants, isDiscovered } of hostBirdEntries) {
          if (showIrlOnly && !isIrl('creature', engine.creatureKey(creature.name))) continue;
          const hostNames = hostPlants.map(h => h.plant.name).join(', ');
          const ccard = el('div', `collection-creature-card${isDiscovered ? '' : ' collection-bird-locked'}`);
          if (isDiscovered) {
            ccard.innerHTML = `
              ${creature.sci ? inatThumbHtml(creature.sci, 'collection-creature-card-thumb', creature.name) : '<span class="collection-creature-card-thumb-icon">🐦</span>'}
              <div class="collection-creature-card-body">
                <div class="collection-creature-head">
                  <span class="collection-creature-name">${creature.name}</span>
                  <span class="collection-creature-type-badge type-bird">🐦</span>
                </div>
                ${speciesLinksHtml(creature.sci)}
                <span class="collection-host-label">Host: <strong>${hostNames}</strong></span>
                <span class="collection-creature-role">${creature.role}</span>
                <p class="collection-creature-note">${creature.note}</p>
                <span class="collection-creature-bp">+1 🌍 BP</span>
                ${irlBarHtml('creature', engine.creatureKey(creature.name), creature.sci, 'Spotted IRL')}
              </div>
            `;
          } else {
            const pity = pityMap.get(engine.creatureKey(creature.name)) ?? 0;
            const pityPct = Math.min(100, Math.round((pity / PITY_DAYS) * 100));
            ccard.innerHTML = `
              <span class="collection-creature-card-thumb-icon">🐦</span>
              <div class="collection-creature-card-body">
                <div class="collection-creature-head">
                  <span class="collection-creature-name undiscovered-name">❓ ${creature.name}</span>
                  <span class="collection-creature-type-badge type-bird">🐦</span>
                </div>
                <span class="collection-host-label">Host: <strong>${hostNames}</strong></span>
                <span class="collection-creature-role">${pity > 0 ? `${pity} day${pity !== 1 ? 's' : ''} scouted · ${pityPct}%` : 'Not yet scouted — plant host species to begin'}</span>
                <div class="collection-pity-bar-track"><div class="collection-pity-bar-fill" style="width:${pityPct}%"></div></div>
              </div>
            `;
          }
          hostGrid.appendChild(ccard);
        }
        content.appendChild(hostGrid);
      }
    }

    // ── Attracted birds (BIRD_LIST criteria system) ──
    content.appendChild(el('h3', 'collection-type-header', `🌳 Attracted Birds (${attractedBirds.size} / ${BIRD_LIST.length})`));
    if (attractedBirds.size === 0 && !showUndiscoveredCollection) {
      content.appendChild(el('p', 'research-idle-note', '— Build insect diversity and establish fruiting native plants to attract native bird visitors. —'));
    }
    const birdGrid = el('div', 'collection-creature-grid');
    for (const bird of BIRD_LIST) {
      const isAttracted = attractedBirds.has(bird.id);
      if (!isAttracted && !showUndiscoveredCollection) continue;
      if (showIrlOnly && !isIrl('bird', bird.id)) continue;
      const card = el('div', `collection-creature-card${isAttracted ? '' : ' collection-bird-locked'}`);
      if (isAttracted) {
        card.innerHTML = `
          ${inatThumbHtml(bird.sci, 'collection-creature-card-thumb', bird.name)}
          <div class="collection-creature-card-body">
            <div class="collection-creature-head">
              <span class="collection-creature-name">${bird.name}</span>
              <span class="collection-creature-type-badge type-bird">🐦</span>
            </div>
            ${speciesLinksHtml(bird.sci)}
            <span class="collection-creature-role">${bird.role}</span>
            <p class="collection-creature-note">${bird.note}</p>
            <div class="collection-host-label">Attracted by: <strong>${bird.attractedBy}</strong></div>
            <span class="collection-creature-bp">+1 🌍 BP</span>
            ${irlBarHtml('bird', bird.id, bird.sci, 'Spotted IRL')}
          </div>
        `;
        const thumbImg = card.querySelector('.collection-creature-card-thumb');
        if (thumbImg && thumbImg.src === BLANK_GIF) {
          fetchInatPhoto(bird.sci).then(url => {
            if (!url) return;
            inatPhotoCache[bird.sci] = url;
            thumbImg.src = url;
          });
        }
      } else {
        const c = bird.unlockCriteria;
        const parts = [];
        if (c.insectsDiscovered) parts.push(`🦋 ${birdMetrics.insectsDiscovered} / ${c.insectsDiscovered} insects`);
        if (c.fruitingPlants)    parts.push(`🍒 ${birdMetrics.fruitingPlants} / ${c.fruitingPlants} fruiting plants`);
        if (c.plantsEstablished) parts.push(`🌿 ${birdMetrics.plantsEstablished} / ${c.plantsEstablished} plants`);
        if (c.hasPlantType) {
          const has = birdMetrics.plantTypeEstablished.has(c.hasPlantType);
          parts.push(`${has ? '✓' : '✗'} ${c.hasPlantType} established`);
        }
        card.innerHTML = `
          <span class="collection-creature-card-thumb-icon">🐦</span>
          <div class="collection-creature-card-body">
            <div class="collection-creature-head">
              <span class="collection-creature-name undiscovered-name">${bird.name}</span>
              <span class="collection-creature-type-badge type-bird">🐦</span>
            </div>
            <span class="collection-creature-role">${bird.attractedBy}</span>
            <div class="collection-host-label">Progress: ${parts.join(' · ')}</div>
          </div>
        `;
      }
      birdGrid.appendChild(card);
    }
    content.appendChild(birdGrid);
  }

  // ── Invasive species ──────────────────────────────────────────────────
  if (showInvasives) {
    content.appendChild(el('h2', 'section-header', `🛡️ Invasive Species — ${researchedInvasiveCount} of ${INVASIVES.length} researched`));
    if (researchedInvasiveCount === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Complete invasive control research in the 🔬 Research tab to catalogue invasive species. —'));
    }

    const tierLabels = { 3: 'Dominant', 2: 'Medium', 1: 'Minor' };
    for (const tier of [3, 2, 1]) {
      const tierInvasives = INVASIVES.filter(inv => inv.tier === tier);
      const tierResearched = tierInvasives.filter(inv => engine.completedResearch.has(inv.requiredResearch));
      if (tierResearched.length === 0 && collectionFilter === 'invasives') {
        // Show locked tier header only in dedicated invasives view
        content.appendChild(el('h3', 'collection-type-header', `${tier === 3 ? '🔴' : tier === 2 ? '🟠' : '🟡'} ${tierLabels[tier]} Tier — 0 / ${tierInvasives.length} researched`));
        continue;
      } else if (tierResearched.length === 0) {
        continue;
      }
      content.appendChild(el('h3', 'collection-type-header', `${tier === 3 ? '🔴' : tier === 2 ? '🟠' : '🟡'} ${tierLabels[tier]} Tier — ${tierResearched.length} / ${tierInvasives.length} researched`));

      const grid = el('div', 'collection-creature-grid');
      for (const inv of tierInvasives) {
        const isResearched = engine.completedResearch.has(inv.requiredResearch);
        if (showIrlOnly && !isIrl('invasive', inv.id)) continue;
        const card = el('div', `collection-creature-card${isResearched ? '' : ' collection-bird-locked'}`);
        const currentAcres = engine.invasiveAcres.get(inv.id) ?? 0;
        const pctRemoved = inv.baseAcres > 0 ? Math.round((1 - currentAcres / inv.baseAcres) * 100) : 100;
        if (isResearched) {
          card.innerHTML = `
            ${inv.sci ? inatThumbHtml(inv.sci, 'collection-creature-card-thumb', inv.name) : `<span class="collection-creature-card-thumb-icon">${inv.icon}</span>`}
            <div class="collection-creature-card-body">
              <div class="collection-creature-head">
                <span class="collection-creature-name">${inv.icon} ${inv.name}</span>
                <span class="collection-creature-type-badge type-${inv.type}">${inv.type === 'plant' ? '🌿' : '🐾'} ${inv.type}</span>
              </div>
              ${speciesLinksHtml(inv.sci)}
              <span class="collection-creature-role">${inv.desc}</span>
              <p class="collection-creature-note"><strong>Ecological damage:</strong> ${inv.damage}</p>
              <p class="collection-creature-note"><strong>Control method:</strong> ${inv.controlMethod}</p>
              <div class="collection-host-label">🏕️ ${currentAcres > 0 ? `${currentAcres} / ${inv.baseAcres} acres remaining — ${pctRemoved}% cleared` : `Fully eradicated! (was ${inv.baseAcres} acres)`}</div>
              ${irlBarHtml('invasive', inv.id, inv.sci, 'Spotted / Removed IRL')}
            </div>
          `;
          const thumbImg = card.querySelector('.collection-creature-card-thumb');
          if (thumbImg && thumbImg.src === BLANK_GIF) {
            fetchInatPhoto(inv.sci).then(url => {
              if (!url) return;
              inatPhotoCache[inv.sci] = url;
              thumbImg.src = url;
            });
          }
        } else {
          card.innerHTML = `
            <span class="collection-creature-card-thumb-icon">${inv.icon}</span>
            <div class="collection-creature-card-body">
              <div class="collection-creature-head">
                <span class="collection-creature-name undiscovered-name">${inv.name}</span>
                <span class="collection-creature-type-badge type-${inv.type}">${inv.type === 'plant' ? '🌿' : '🐾'}</span>
              </div>
              <span class="collection-creature-role">Complete <strong>${inv.requiredResearch.replace(/_/g, ' ')}</strong> research to learn about this invasive.</span>
              <div class="collection-host-label">🏕️ Occupying ${currentAcres} acres</div>
            </div>
          `;
        }
        grid.appendChild(card);
      }
      content.appendChild(grid);
    }
  }

  // ── Discovery history (all types) ───────────────────────────────────
  if (showHistory) {
    content.appendChild(el('h2', 'section-header', `📊 Discovery Log — ${totalHistoryCount} total`));

    if (totalHistoryCount === 0) {
      content.appendChild(el('p', 'research-idle-note', '— No discoveries yet. Establish native plants in the 🌿 Garden tab to begin. —'));
    } else {
      // Build unified timeline from all discovery sources
      const historyEntries = [];
      const discoveryLog = engine.creatureDiscoveryLog;

      // Creatures (non-bird)
      for (const ckey of discovered) {
        const entry = nonBirdCreatureMap.get(ckey);
        if (!entry) continue;
        const typeInfo = CREATURE_TYPE_META[entry.creature.type] ?? { label: entry.creature.type, icon: '🐞' };
        historyEntries.push({
          day: discoveryLog.get(ckey) ?? 0,
          icon: typeInfo.icon,
          name: entry.creature.name,
          sci: entry.creature.sci,
          detail: `Host: ${entry.hostPlants.map(h => h.plant.name).join(', ')}`,
          category: 'creature',
        });
      }

      // Bird-type creatures
      for (const ckey of discovered) {
        const entry = birdCreatureMap.get(ckey);
        if (!entry) continue;
        historyEntries.push({
          day: discoveryLog.get(ckey) ?? 0,
          icon: '🐦',
          name: entry.creature.name,
          sci: entry.creature.sci,
          detail: `Host: ${entry.hostPlants.map(h => h.plant.name).join(', ')}`,
          category: 'bird',
        });
      }

      // Attracted birds (BIRD_LIST)
      const birdLog = engine.birdDiscoveryLog;
      for (const birdId of engine.discoveredBirds) {
        const bird = BIRD_LIST.find(b => b.id === birdId);
        if (!bird) continue;
        historyEntries.push({
          day: birdLog.get(birdId) ?? 0,
          icon: '🐦',
          name: bird.name,
          sci: bird.sci,
          detail: `Attracted by: ${bird.attractedBy}`,
          category: 'bird',
        });
      }

      historyEntries.sort((a, b) => a.day - b.day);

      const historyList = el('ol', 'discovery-history-list');
      historyEntries.forEach(({ icon, name, sci, detail, day, category }, idx) => {
        const cal = day > 0 ? calendarDate(day) : null;
        const dateStr = cal ? `${cal.month.abbr} ${cal.day}, Year ${cal.year}` : 'Year 1 (legacy)';
        const row = el('li', 'discovery-history-row');
        row.innerHTML = `
          <span class="dh-num">${idx + 1}</span>
          <span class="dh-icon">${icon}</span>
          <div class="dh-details">
            <span class="dh-name">${name}</span>
            ${sci ? `<span class="dh-sci">${sci}</span>` : ''}
            <span class="dh-host">${detail}</span>
          </div>
          <span class="dh-date">${dateStr}</span>
        `;
        historyList.appendChild(row);
      });
      content.appendChild(historyList);
    }
  }
}

// ── CROP LOADOUT SYSTEM ──────────────────────────────────────────────────────
const LOADOUT_SAVE_KEY = 'idle-ecologist-crop-presets-v1';
const LEGACY_LOADOUT_SAVE_KEY = 'idle-ecologist-loadouts-v1';
const LOADOUT_SLOTS = ['a', 'b', 'c'];

function _readStoredLoadouts() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOADOUT_SAVE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function _writeStoredLoadouts(allLoadouts) {
  try {
    localStorage.setItem(LOADOUT_SAVE_KEY, JSON.stringify(allLoadouts));
    return true;
  } catch {
    console.warn('Failed to save crop presets');
    return false;
  }
}

function _getAllLoadouts() {
  const saved = _readStoredLoadouts();
  if (Object.keys(saved).length > 0) return saved;

  let legacy = {};
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_LOADOUT_SAVE_KEY) || '{}') || {};
  } catch {
    legacy = {};
  }
  if (!legacy || typeof legacy !== 'object') return saved;

  const migrated = {};
  for (const slot of LOADOUT_SLOTS) {
    const preferredKeys = [`${engine.currentSeasonName}:${slot}`, ...SEASONS.map(season => `${season.name}:${slot}`)];
    const key = preferredKeys.find(candidate => {
      const loadout = legacy[candidate];
      return loadout && typeof loadout === 'object' && Object.keys(loadout).length > 0;
    });
    if (key) migrated[slot] = legacy[key];
  }

  if (Object.keys(migrated).length > 0) _writeStoredLoadouts(migrated);
  return migrated;
}

function _getLoadoutKey(slot) {
  return slot;
}

function saveLoadout(slot) {
  const loadout = {};
  for (const def of getFarmZoneDefs()) {
    const acres = engine.zoneAcres.get(def.name) ?? 0;
    if (acres > 0) {
      loadout[def.name] = acres;
    }
  }

  const allLoadouts = _getAllLoadouts();
  const key = _getLoadoutKey(slot);
  allLoadouts[key] = loadout;
  return _writeStoredLoadouts(allLoadouts);
}

function getLoadout(slot) {
  const allLoadouts = _getAllLoadouts();
  const key = _getLoadoutKey(slot);
  return allLoadouts[key] || null;
}

function isLoadoutEmpty(slot) {
  const loadout = getLoadout(slot);
  return !loadout || Object.keys(loadout).length === 0;
}

function loadLoadout(slot) {
  const loadout = getLoadout(slot);
  if (!loadout) return false;

  // Calculate total acres needed
  let totalNeeded = 0;
  for (const def of getFarmZoneDefs()) {
    totalNeeded += loadout[def.name] ?? 0;
  }

  // Get available acres (including currently allocated)
  const totalAcres = engine.totalLandAcres;
  const currentCropAcres = Array.from(engine.zoneAcres.values()).reduce((a, b) => a + b, 0);
  const currentPlantAcres = Array.from(engine.plantedSpeciesAcres.values()).reduce((a, b) => a + b, 0);
  const currentlyUsed = currentCropAcres + currentPlantAcres;
  const freeAcres = totalAcres - currentlyUsed;

  if (totalNeeded <= totalAcres) {
    // Case 1: Simple case — we have enough total acres
    const deficitAcres = totalNeeded - freeAcres;
    if (deficitAcres > 0) {
      // Need to remove acres from existing crops to make room
      _removeAcresToMakeRoom(deficitAcres);
    }
    // Apply the loadout
    _applyLoadout(loadout);
    return true;
  } else {
    // Case 2: Not enough total acres — should not happen, but handle gracefully
    console.warn('Not enough total acres for loadout');
    return false;
  }
}

function _removeAcresToMakeRoom(acresNeeded) {
  // Build a list of all crops with acres, sorted by yield (lowest cost first)
  const crops = [];
  for (const def of getFarmZoneDefs()) {
    const acres = engine.zoneAcres.get(def.name) ?? 0;
    if (acres > 0) {
      const cropType = getCrop(def.cropId);
      crops.push({
        zoneName: def.name,
        acres: acres,
        yieldGold: cropType?.yieldGold ?? 0,
      });
    }
  }

  // Sort by yield (lowest first) to remove cheapest crops
  crops.sort((a, b) => a.yieldGold - b.yieldGold);

  // Remove acres starting from lowest-yield crops
  let removed = 0;
  for (const crop of crops) {
    if (removed >= acresNeeded) break;
    const removeCount = Math.min(crop.acres, acresNeeded - removed);
    for (let i = 0; i < removeCount; i++) {
      engine.deallocateCropAcre(crop.zoneName);
    }
    removed += removeCount;
  }
}

function _applyLoadout(loadout) {
  // First clear all current crop acres
  for (const def of getFarmZoneDefs()) {
    const currentAcres = engine.zoneAcres.get(def.name) ?? 0;
    for (let i = 0; i < currentAcres; i++) {
      engine.deallocateCropAcre(def.name);
    }
  }

  // Now apply the loadout
  for (const [zoneName, targetAcres] of Object.entries(loadout)) {
    engine.queueCropAcre(zoneName, targetAcres);
  }
}

// ── SETTINGS TAB ─────────────────────────────────────────────────────────────
function renderSettings() {
  content.appendChild(el('h2', 'section-header', '⚙️ Settings'));

  // Pause / Resume
  const pauseSection = el('div', 'settings-section');
  pauseSection.appendChild(el('div', 'settings-label', 'Game Paused'));
  pauseSection.appendChild(el('p', 'settings-desc', 'Pause the game to prevent time from advancing. Your progress is preserved exactly as-is.'));
  const pauseBtn = el('button', `action-btn${engine.gamePaused ? ' active' : ''}`,
    engine.gamePaused ? '▶ Resume' : '⏸ Pause');
  pauseBtn.addEventListener('click', () => { engine.setPaused(!engine.gamePaused); renderAll(); });
  pauseSection.appendChild(pauseBtn);
  content.appendChild(pauseSection);

  // Game speed
  const speedSection = el('div', 'settings-section');
  speedSection.appendChild(el('div', 'settings-label', 'Game Speed'));
  const speedRow = el('div', 'btn-row');
  [1, 3, 6, 12].forEach(spd => {
    const btn = el('button', `speed-btn${engine.gameSpeed === spd ? ' active' : ''}`, `${spd}×`);
    btn.addEventListener('click', () => { engine.setGameSpeed(spd); renderAll(); });
    speedRow.appendChild(btn);
  });
  speedSection.appendChild(speedRow);
  content.appendChild(speedSection);

  // Auto-pilot
  const apSection = el('div', 'settings-section');
  apSection.appendChild(el('div', 'settings-label', '🤖 Auto-pilot'));

  const apModeDescs = {
    economy:      ENABLE_RANCH
      ? 'Maximizes income: prioritizes farm and ranch growth, allocates free acres, buys land, and hires the cheapest available worker.'
      : 'Maximizes income: prioritizes farm growth, allocates free acres, buys land, and hires the cheapest available worker.',
    conservation: 'Balances income with nature: does everything Economy does, plus auto-starts research projects, establishes native plants, and re-plants habitat-risk species first.',
  };
  const apDesc = el('p', 'settings-desc',
    engine.autoPilot ? apModeDescs[engine.autoPilotMode] : 'Enable Auto-pilot to let the game make decisions for you based on your chosen priority.');
  apSection.appendChild(apDesc);

  // ON / OFF toggle
  const apBtn = el('button', `ap-btn${engine.autoPilot ? ' ap-on' : ''}`,
    engine.autoPilot ? '🤖 ON' : '🤖 OFF');
  apBtn.addEventListener('click', () => { engine.setAutoPilot(!engine.autoPilot); renderAll(); });
  apSection.appendChild(apBtn);

  // Mode buttons — only shown when AP is enabled
  if (engine.autoPilot) {
    const modeRow = el('div', 'btn-row');
    const modes = [
      { id: 'economy',      label: '💰 Economy' },
      { id: 'conservation', label: '🌿 Conservation' },
    ];
    for (const m of modes) {
      const mBtn = el('button', `speed-btn${engine.autoPilotMode === m.id ? ' active' : ''}`, m.label);
      mBtn.addEventListener('click', () => { engine.setAutoPilotMode(m.id); renderAll(); });
      modeRow.appendChild(mBtn);
    }
    apSection.appendChild(modeRow);
  }

  content.appendChild(apSection);

  // Screen (fullscreen + wake lock)
  const screenSection = el('div', 'settings-section');
  screenSection.appendChild(el('div', 'settings-label', '📱 Screen'));
  const screenBtnRow = el('div', 'btn-row');
  if (document.fullscreenEnabled) {
    const fsBtn = el('button', 'action-btn', document.fullscreenElement ? '⛶ Exit Fullscreen' : '⛶ Fullscreen');
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      setTimeout(() => renderAll(), 300);
    });
    screenBtnRow.appendChild(fsBtn);
  } else {
    screenSection.appendChild(el('p', 'settings-desc',
      '📱 iOS: tap Share → “Add to Home Screen” to play fullscreen.'));
  }
  if ('wakeLock' in navigator) {
    const wlOn = _wakeLock !== null;
    const wlBtn = el('button', `action-btn${wlOn ? ' wl-on' : ''}`, wlOn ? '🔆 Keep screen on: ON' : '🔅 Keep screen on: OFF');
    wlBtn.addEventListener('click', async () => {
      if (_wakeLock) { await _wakeLock.release(); _wakeLock = null; }
      else { await acquireWakeLock(); }
      renderAll();
    });
    screenBtnRow.appendChild(wlBtn);
  }
  screenSection.appendChild(screenBtnRow);
  content.appendChild(screenSection);

  // Home Page
  const homeSection = el('div', 'settings-section');
  homeSection.appendChild(el('div', 'settings-label', '🏠 Home Page'));
  homeSection.appendChild(el('p', 'settings-desc', 'Choose which tab opens when you start the game.'));
  const homeRow = el('div', 'btn-row');
  const homeChoices = [
    { id: 'crops', label: '🌾 Crops' },
    { id: 'map',   label: '🧑‍🌾 Map' },
  ];
  const currentHome = localStorage.getItem(HOME_TAB_KEY) || 'crops';
  for (const h of homeChoices) {
    const hBtn = el('button', `speed-btn${currentHome === h.id ? ' active' : ''}`, h.label);
    hBtn.addEventListener('click', () => {
      localStorage.setItem(HOME_TAB_KEY, h.id);
      renderAll();
    });
    homeRow.appendChild(hBtn);
  }
  homeSection.appendChild(homeRow);
  content.appendChild(homeSection);

  // Tutorial
  const tutorialSection = el('div', 'settings-section');
  tutorialSection.appendChild(el('div', 'settings-label', '🎓 Tutorial'));
  tutorialSection.appendChild(el('p', 'settings-desc', 'Run an in-game walkthrough of the main gameplay loop and core systems.'));
  const tutorialBtn = el('button', 'action-btn', '🎓 Replay Tutorial');
  tutorialBtn.id = 'tutorial-replay-btn';
  tutorialBtn.addEventListener('click', () => startTutorial({ fromSettings: true }));
  tutorialSection.appendChild(tutorialBtn);
  content.appendChild(tutorialSection);

  // Save / Reset
  const saveSection = el('div', 'settings-section');
  saveSection.appendChild(el('div', 'settings-label', 'Save Data'));
  const saveBtn  = el('button', 'action-btn', '💾 Save Now');
  const resetBtn = el('button', 'action-btn danger', '🗑 Reset Game');
  saveBtn.addEventListener('click', () => { saveGame(); saveBtn.textContent = '✅ Saved!'; setTimeout(() => { saveBtn.textContent = '💾 Save Now'; }, 1500); });
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      _resetting = true;
      localStorage.removeItem(regionSaveKey(meta.currentRegionId));
      engine.clearSave();
      location.reload();
    }
  });
  const btnRow = el('div', 'btn-row');
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(resetBtn);
  saveSection.appendChild(btnRow);
  content.appendChild(saveSection);

  // Crop presets
  const loadoutSection = el('div', 'settings-section');
  loadoutSection.appendChild(el('div', 'settings-label', '🌾 Crop Presets'));
  loadoutSection.appendChild(el('p', 'settings-desc', 'Save your current crop layout into one of three reusable presets. Loading a preset reallocates crop acres only; native habitat stays untouched.'));

  LOADOUT_SLOTS.forEach(slot => {
    const slotRow = el('div', 'loadout-slot-row');
    const isEmpty = isLoadoutEmpty(slot);

    const slotLabel = el('span', 'loadout-slot-label', `Preset ${slot.toUpperCase()}: ${isEmpty ? '(empty)' : '✓ saved'}`);
    slotRow.appendChild(slotLabel);

    const btnContainer = el('div', 'loadout-btn-group');

    const saveBtn = el('button', 'action-btn loadout-save-btn', `Save ${slot.toUpperCase()}`);
    saveBtn.addEventListener('click', () => {
      const success = saveLoadout(slot);
      if (success) {
        saveBtn.textContent = `✅ Saved!`;
        setTimeout(() => {
          saveBtn.textContent = `Save ${slot.toUpperCase()}`;
          renderAll();
        }, 1500);
      }
    });
    btnContainer.appendChild(saveBtn);

    if (!isEmpty) {
      const loadBtn = el('button', 'action-btn loadout-load-btn', `Load ${slot.toUpperCase()}`);
      loadBtn.addEventListener('click', () => {
        const success = loadLoadout(slot);
        if (success) {
          loadBtn.textContent = `✅ Loaded!`;
          setTimeout(() => {
            loadBtn.textContent = `Load ${slot.toUpperCase()}`;
            renderAll();
          }, 1500);
        } else {
          loadBtn.textContent = `❌ Error`;
          setTimeout(() => {
            loadBtn.textContent = `Load ${slot.toUpperCase()}`;
          }, 1500);
        }
      });
      btnContainer.appendChild(loadBtn);
    }

    slotRow.appendChild(btnContainer);
    loadoutSection.appendChild(slotRow);
  });

  content.appendChild(loadoutSection);
}

// ── Offline toast ─────────────────────────────────────────────────────────────
// ── Generic toast for prestige / misc notifications ──────────────────────────
function showToast(msg, durationMs = 6000) {
  const toast = el('div', 'offline-toast');
  toast.style.cursor = 'pointer';
  toast.innerHTML = `<div style="padding:14px 18px;font-size:14px;">${msg}</div>`;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

function showOfflineToast(result, realSecs) {
  const fmt = s => s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
                 : s >= 60   ? `${Math.floor(s/60)}m ${s%60}s`
                 : `${s}s`;

  const cap       = result.capped ? ' (capped at 2h)' : '';
  const daysLine  = result.daysAdvanced > 0
    ? `<div style="color:#aaa;font-size:12px;margin-top:2px">⏩ ${result.daysAdvanced} in-game day${result.daysAdvanced !== 1 ? 's' : ''} simulated</div>`
    : '';
  const statusLine = `<div class="offline-status">Offline progress has been applied. The game is still running.</div>`;

  const toast = el('div', 'offline-toast');
  toast.innerHTML = `
    <div class="offline-title">Welcome back!</div>
    <div>Away for ${fmt(Math.floor(realSecs))}${cap}</div>
    <div style="color:#ffd700;margin-top:6px">🪙 +${shortNumber(result.goldEarned)} earned</div>
    ${daysLine}
    ${statusLine}
    <div class="offline-toast-btns">
      <button class="offline-close">Dismiss</button>
    </div>
  `;
  toast.querySelector('.offline-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 15000);
}

// ── Update loop ───────────────────────────────────────────────────────────────
let lastZonesFingerprint    = '';
let lastRanchFingerprint    = '';
let lastResearchFingerprint   = '';
let lastGardenFingerprint     = '';
let lastCollectionFingerprint = '';
let lastLandFingerprint       = '';
let collectionFilter = 'all'; // 'all' | 'crops' | 'plants' | 'creatures' | 'birds' | 'invasives' | 'history'
let collectionCreaturesCollapsed = new Set(); // plant IDs whose creature list is collapsed
let collectionAllCollapsed = false;
let showUndiscoveredCollection = localStorage.getItem('showUndiscoveredCollection') === 'true';

// ── Notification log ─────────────────────────────────────────────
let _knownDiscovered      = null;  // null = not yet initialised; synced silently on first tick
let _knownUnlockedCrops   = null;  // Set of crop ids
let _knownUnlockedRanch   = null;  // Set of animal ids
let _knownPlantedSpecies  = null;  // Set of plant ids
let _knownCompletedResearch = null; // Set of research ids
let _pendingScrollToCreature = null;    // ckey to scroll-to after switching to collection tab
let _pendingScrollToCollection = null;  // { filter, id } to navigate to a specific collection card
const _notifLog = [];   // generic notification entries
let _notifIdCounter = 0;
const MAX_NOTIFICATIONS = 200;
const NOTIF_SAVE_KEY = 'idle-ecologist-notifs-v1';

function _serializeNotifs() {
  return _notifLog.map(n => {
    const base = { id: n.id, day: n.day, read: n.read, type: n.type };
    if (n.type === 'discovery' || n.type === 'extirpated') return { ...base, ckey: n.ckey };
    if (n.type === 'crop')     return { ...base, cropId: n.cropId };
    if (n.type === 'ranch')    return { ...base, animalId: n.animalId };
    if (n.type === 'plant')    return { ...base, plantId: n.plantId };
    if (n.type === 'research')      return { ...base, researchId: n.researchId };
    if (n.type === 'bird_attracted') return { ...base, birdId: n.birdId };
    return base;
  });
}

function _saveNotifs() {
  try { localStorage.setItem(NOTIF_SAVE_KEY, JSON.stringify(_serializeNotifs())); } catch {}
}

function _loadNotifs() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_SAVE_KEY) || '[]');
    if (!Array.isArray(raw)) return;
    for (const n of raw) {
      let extra = null;
      if (n.type === 'discovery' || n.type === 'extirpated') {
        const { creature, hostPlants } = _resolveCreature(n.ckey);
        if (creature) extra = { ckey: n.ckey, creature, hostPlants };
      } else if (n.type === 'crop') {
        const cropType = getCrop(n.cropId);
        if (cropType) extra = { cropId: n.cropId, cropType };
      } else if (n.type === 'ranch') {
        const animal = RANCH_ANIMAL_LIST.find(a => a.id === n.animalId);
        if (animal) extra = { animalId: n.animalId, animal };
      } else if (n.type === 'plant') {
        const plant = ALL_PLANTS.find(p => p.id === n.plantId);
        if (plant) extra = { plantId: n.plantId, plant };
      } else if (n.type === 'research') {
        const project = RESEARCH.find(r => r.id === n.researchId);
        if (project) extra = { researchId: n.researchId, project };
      } else if (n.type === 'bird_attracted') {
        const bird = BIRDS[n.birdId];
        if (bird) extra = { birdId: n.birdId, bird };
      }
      if (extra) {
        _notifLog.push({ id: n.id, day: n.day, read: n.read, type: n.type, ...extra });
        if (n.id > _notifIdCounter) _notifIdCounter = n.id;
      }
    }
  } catch {}
}

const notifModal = document.getElementById('notif-modal');
const notifList  = document.getElementById('notif-list');

function _resolveCreature(ckey) {
  let creature = null;
  const hostPlants = [];
  for (const eco of ECOREGIONS) {
    for (const plant of eco.plants) {
      const c = (plant.insectsHosted ?? []).find(c => engine.creatureKey(c.name) === ckey);
      if (c) { if (!creature) creature = c; hostPlants.push({ plant, eco }); }
    }
  }
  return { creature, hostPlants };
}

function _pushNotif(entry) {
  _notifLog.unshift({ id: ++_notifIdCounter, day: engine.inGameDay, read: false, ...entry });
  if (_notifLog.length > MAX_NOTIFICATIONS) _notifLog.length = MAX_NOTIFICATIONS;
  updateNotifBadge();
  _saveNotifs();
}

function _pushCreatureNotif(type, ckey) {
  const { creature, hostPlants } = _resolveCreature(ckey);
  if (!creature) return;
  _pushNotif({ type, ckey, creature, hostPlants });
}

engine.onCreatureExtirpated = ckey => _pushCreatureNotif('extirpated', ckey);

function _pushBirdNotif(birdId) {
  const bird = BIRDS[birdId];
  if (!bird) return;
  _pushNotif({ type: 'bird_attracted', birdId, bird });
}

engine.onBirdAttracted = birdId => _pushBirdNotif(birdId);

_loadNotifs();
updateNotifBadge();

let _notifTab = 'unread'; // 'unread' | 'read' | 'hints'
let _lastHintsFingerprint = '';

const HINT_TONE_META = {
  info: { badgeClass: 'notif-badge-hint-info', label: 'Info' },
  grow: { badgeClass: 'notif-badge-hint-grow', label: 'Growth' },
  ready: { badgeClass: 'notif-badge-hint-ready', label: 'Ready' },
  warn: { badgeClass: 'notif-badge-hint-warn', label: 'Attention' },
};

function updateNotifBadge() {
  const unread = _notifLog.filter(n => !n.read).length;
  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn) notifBtn.classList.toggle('has-unread', unread > 0);
  const badge = document.getElementById('notif-badge');
  if (badge) badge.textContent = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '';
}

function _buildHintsList() {
  const tabUnreadBtn = document.getElementById('notif-tab-unread');
  const tabReadBtn   = document.getElementById('notif-tab-read');
  const tabHintsBtn  = document.getElementById('notif-tab-hints');
  if (tabUnreadBtn) tabUnreadBtn.classList.toggle('active', false);
  if (tabReadBtn)   tabReadBtn.classList.toggle('active', false);
  if (tabHintsBtn)  tabHintsBtn.classList.toggle('active', true);

  const hintStates = getAllTabHintStates();
  _lastHintsFingerprint = getTabHintsFingerprint();
  notifList.innerHTML = '';

  for (const hint of hintStates) {
    const toneMeta = HINT_TONE_META[hint.tone] ?? HINT_TONE_META.info;
    const entry = el('div', `notif-entry notif-hint-entry tone-${hint.tone}`);
    entry.innerHTML = `
      <div class="notif-entry-thumb notif-hint-thumb"><span class="notif-type-icon">${hint.icon}</span></div>
      <div class="notif-entry-body">
        <div class="notif-entry-top">
          <span class="notif-badge-label ${toneMeta.badgeClass}">${toneMeta.label}</span>
          <span class="notif-hint-tab-name">${hint.label}</span>
          ${hint.tab === activeTab ? '<span class="notif-entry-date">Current</span>' : ''}
        </div>
        <div class="notif-entry-name">${TAB_LABELS[hint.tab] ?? hint.label}</div>
        <div class="notif-entry-desc notif-hint-text">${hint.text}</div>
      </div>
      <div class="notif-entry-actions">
        <button class="notif-icon-btn notif-goto" title="Open tab" aria-label="Open tab">↗</button>
      </div>
    `;
    entry.querySelector('.notif-goto')?.addEventListener('click', () => {
      closeNotifModal();
      activeTab = hint.tab;
      setFabOpen(false);
      renderAll();
    });
    notifList.appendChild(entry);
  }
}

function _buildNotifList() {
  if (_notifTab === 'hints') {
    _buildHintsList();
    return;
  }

  // Sync tab button states
  const tabUnreadBtn = document.getElementById('notif-tab-unread');
  const tabReadBtn   = document.getElementById('notif-tab-read');
  const tabHintsBtn  = document.getElementById('notif-tab-hints');
  if (tabUnreadBtn) tabUnreadBtn.classList.toggle('active', _notifTab === 'unread');
  if (tabReadBtn)   tabReadBtn.classList.toggle('active',   _notifTab === 'read');
  if (tabHintsBtn)  tabHintsBtn.classList.toggle('active', false);
  const filtered = _notifLog.filter(n => _notifTab === 'unread' ? !n.read : n.read);
  notifList.innerHTML = '';
  if (filtered.length === 0) {
    notifList.innerHTML = `<p class="notif-empty">${_notifTab === 'unread' ? 'No unread notifications.' : 'No read notifications.'}</p>`;
    return;
  }
  for (const notif of filtered) {
    const { type, day, read } = notif;
    const cal = calendarDate(day);
    const dateStr = `${cal.month.abbr} ${cal.day}, Year ${cal.year}`;
    const entry = el('div', `notif-entry${read ? ' notif-read' : ''}`);
    entry.dataset.notifId = notif.id;

    let thumbHtml = '', badgeClass = '', badgeLabel = '', nameHtml = '', subHtml = '', gotoHandler = null;

    if (type === 'discovery' || type === 'extirpated') {
      const { creature, hostPlants } = notif;
      const typeInfo = CREATURE_TYPE_META[creature.type] ?? { label: creature.type, icon: '🐞' };
      const hostNames = hostPlants.map(h => h.plant.name).join(', ');
      const thumbSrc = STATIC_INAT_PHOTOS[creature.sci] || inatPhotoCache[creature.sci] || BLANK_GIF;
      thumbHtml = creature.sci
        ? `<img class="inat-thumb notif-thumb" data-sci="${creature.sci}" src="${thumbSrc}" alt="${creature.name}">`
        : `<span class="notif-type-icon">${typeInfo.icon}</span>`;
      badgeClass = type === 'discovery' ? 'notif-badge-discovery' : 'notif-badge-extirpated';
      badgeLabel = type === 'discovery' ? '🔍 New Discovery' : '⚠️ Extirpated';
      nameHtml = `<div class="notif-entry-name">${creature.name}</div>`
        + speciesLinksHtml(creature.sci);
      subHtml = `
        <div class="notif-entry-host">${type === 'discovery' ? 'Host' : 'Host removed'}: <strong>${hostNames}</strong></div>
        <div class="notif-entry-host">Type: <strong>${typeInfo.label}</strong></div>
        ${creature.role ? `<div class="notif-entry-desc">${creature.role}</div>` : ''}
        ${creature.note ? `<div class="notif-entry-desc">${creature.note}</div>` : ''}
        <div class="notif-entry-host">Biosphere: <strong>+1 BP</strong></div>
      `;
      if (creature.sci && thumbSrc === BLANK_GIF) {
        fetchInatPhoto(creature.sci).then(url => {
          if (!url) return;
          inatPhotoCache[creature.sci] = url;
          const img = entry.querySelector('.notif-thumb');
          if (img) img.src = url;
        });
      }
      if (type === 'discovery') {
        gotoHandler = () => {
          closeNotifModal();
          _pendingScrollToCreature = notif.ckey;
          activeTab = 'collection';
          setFabOpen(false);
          renderAll();
        };
      }
    } else if (type === 'crop') {
      const { cropType } = notif;
      const cropStatsRow = engine.cropStats.get(cropType.id) ?? { grown: 0, lifetimeSales: 0 };
      const mastery = getCropMasterySummary(cropType.id);
      const thumbSrc = STATIC_INAT_PHOTOS[cropType.sciName] || inatPhotoCache[cropType.sciName] || BLANK_GIF;
      thumbHtml = cropType.sciName
        ? `<img class="inat-thumb notif-thumb" data-sci="${cropType.sciName}" src="${thumbSrc}" alt="${cropType.name}">`
        : `<span class="notif-type-icon">🌾</span>`;
      badgeClass = 'notif-badge-crop';
      badgeLabel = '🌾 Crop Unlocked';
      nameHtml = `<div class="notif-entry-name">${cropType.name}</div>`
        + speciesLinksHtml(cropType.sciName, cropType.name);
      const _cropDescCached = cropType.sciName ? (inatDescCache[cropType.sciName] ?? null) : null;
      subHtml = `
        <div class="notif-entry-host">Now available in 🌾 Crops</div>
        <div class="notif-entry-host">🌱 Mastery: <strong>${mastery.label}</strong></div>
        <div class="notif-entry-host">🌾 Harvested: <strong>${shortNumber(cropStatsRow.grown)}</strong> · 🪙 Earned: <strong>${shortNumber(cropStatsRow.lifetimeSales)}g</strong></div>
        ${cropType.sciName ? `<div class="notif-entry-desc" data-inat-desc="${cropType.sciName}">${_cropDescCached ?? ''}</div>` : ''}
      `;
      if (cropType.sciName && thumbSrc === BLANK_GIF) {
        fetchInatPhoto(cropType.sciName).then(url => {
          if (!url) return;
          inatPhotoCache[cropType.sciName] = url;
          const img = entry.querySelector('.notif-thumb');
          if (img) img.src = url;
        });
      }
      gotoHandler = () => { closeNotifModal(); activeTab = 'crops'; setFabOpen(false); renderAll(); };
    } else if (type === 'ranch') {
      const { animal } = notif;
      const ranchStatsRow = engine.ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
      const thumbSrc = STATIC_INAT_PHOTOS[animal.sci] || inatPhotoCache[animal.sci] || BLANK_GIF;
      thumbHtml = animal.sci
        ? `<img class="inat-thumb notif-thumb" data-sci="${animal.sci}" src="${thumbSrc}" alt="${animal.name}">`
        : `<span class="notif-type-icon">${animal.icon ?? '🐄'}</span>`;
      badgeClass = 'notif-badge-ranch';
      badgeLabel = '🐄 Animal Unlocked';
      nameHtml = `<div class="notif-entry-name">${animal.name}</div>`
        + speciesLinksHtml(animal.sci);
      subHtml = `
        <div class="notif-entry-host">Product: <strong>${animal.product}</strong></div>
        <div class="notif-entry-host">🐄 Cycles: <strong>${shortNumber(ranchStatsRow.produced)}</strong> · 💰 Sold: <strong>${shortNumber(ranchStatsRow.sold)}</strong> · 🪙 Earned: <strong>${shortNumber(ranchStatsRow.lifetimeSales)}g</strong></div>
        ${animal.care ? `<div class="notif-entry-desc">${animal.care}</div>` : ''}
        ${animal.desc ? `<div class="notif-entry-desc">${animal.desc}</div>` : ''}
      `;
      if (animal.sci && thumbSrc === BLANK_GIF) {
        fetchInatPhoto(animal.sci).then(url => {
          if (!url) return;
          inatPhotoCache[animal.sci] = url;
          const img = entry.querySelector('.notif-thumb');
          if (img) img.src = url;
        });
      }
      gotoHandler = () => {
        closeNotifModal();
        activeTab = ENABLE_RANCH ? 'ranch' : 'collection';
        setFabOpen(false);
        renderAll();
      };
    } else if (type === 'plant') {
      const { plant } = notif;
      const discoveredHere = (plant.insectsHosted ?? []).filter(c => engine.discoveredCreatures.has(engine.creatureKey(c.name))).length;
      const totalHere = (plant.insectsHosted ?? []).length;
      const thumbSrc = STATIC_INAT_PHOTOS[plant.sci] || inatPhotoCache[plant.sci] || BLANK_GIF;
      thumbHtml = `<img class="inat-thumb notif-thumb" data-sci="${plant.sci}" src="${thumbSrc}" alt="${plant.name}">`;
      badgeClass = 'notif-badge-plant';
      badgeLabel = '🌿 Plant Established';
      nameHtml = `<div class="notif-entry-name">${plant.name}</div>`
        + speciesLinksHtml(plant.sci, plant.name);
      subHtml = `
        <div class="notif-entry-host">Hosts <strong>${totalHere}</strong> species · Observed <strong>${discoveredHere}/${totalHere}</strong></div>
        <div class="notif-entry-host">Type: <strong>${plant.type}</strong>${plant.height ? ` · Height: <strong>${plant.height}</strong>` : ''}${plant.seasonOfInterest ? ` · Focus: <strong>${plant.seasonOfInterest}</strong>` : ''}</div>
        <div class="notif-entry-host">Biosphere: <strong>+${plant.biosphereBonus ?? 0} BP</strong>${plant.caterpillarSpp ? ` · Supports <strong>${plant.caterpillarSpp}+</strong> caterpillar species` : ''}</div>
        ${plant.wildlifeNote ? `<div class="notif-entry-desc">${plant.wildlifeNote}</div>` : ''}
        ${plant.desc ? `<div class="notif-entry-desc">${plant.desc}</div>` : ''}
      `;
      if (thumbSrc === BLANK_GIF) {
        fetchInatPhoto(plant.sci).then(url => {
          if (!url) return;
          inatPhotoCache[plant.sci] = url;
          const img = entry.querySelector('.notif-thumb');
          if (img) img.src = url;
        });
      }
      gotoHandler = () => {
        closeNotifModal();
        _pendingScrollToCollection = { filter: 'plants', id: plant.id };
        activeTab = 'collection';
        setFabOpen(false);
        renderAll();
      };
    } else if (type === 'research') {
      const { project } = notif;
      thumbHtml = `<span class="notif-type-icon" style="font-size:32px">${project.icon}</span>`;
      badgeClass = 'notif-badge-research';
      badgeLabel = '🌱 Project Complete';
      nameHtml = `<div class="notif-entry-name">${project.name}</div>`;
      const bp = project.effect?.biosphereBonus ?? 0;
      subHtml = `
        ${project.effect?.label ? `<div class="notif-entry-host">${project.effect.label}</div>` : ''}
        ${bp > 0 ? `<div class="notif-entry-host">Biosphere: <strong>+${bp} BP</strong></div>` : ''}
        ${project.desc ? `<div class="notif-entry-desc">${project.desc}</div>` : ''}
      `;
      gotoHandler = () => { closeNotifModal(); activeTab = 'research'; setFabOpen(false); renderAll(); };
    } else if (type === 'bird_attracted') {
      const { bird } = notif;
      const thumbSrc = STATIC_INAT_PHOTOS[bird.sci] || inatPhotoCache[bird.sci] || BLANK_GIF;
      thumbHtml = `<img class="inat-thumb notif-thumb" data-sci="${bird.sci}" src="${thumbSrc}" alt="${bird.name}">`;
      badgeClass = 'notif-badge-bird';
      badgeLabel = '🐦 Bird Attracted';
      nameHtml = `<div class="notif-entry-name">${bird.name}</div>`
        + speciesLinksHtml(bird.sci);
      subHtml = `
        <div class="notif-entry-host">Attracted by: <strong>${bird.attractedBy}</strong></div>
        <div class="notif-entry-host">Role: <strong>${bird.role}</strong></div>
        ${bird.note ? `<div class="notif-entry-desc">${bird.note}</div>` : ''}
        <div class="notif-entry-host">Biosphere: <strong>+1 BP</strong></div>
      `;
      if (thumbSrc === BLANK_GIF) {
        fetchInatPhoto(bird.sci).then(url => {
          if (!url) return;
          inatPhotoCache[bird.sci] = url;
          const img = entry.querySelector('.notif-thumb');
          if (img) img.src = url;
        });
      }
      gotoHandler = () => {
        closeNotifModal();
        _pendingScrollToCollection = { filter: 'birds' };
        activeTab = 'collection';
        setFabOpen(false);
        renderAll();
      };
    }

    entry.innerHTML = `
      <div class="notif-entry-thumb">${thumbHtml}</div>
      <div class="notif-entry-body">
        <div class="notif-entry-top">
          <span class="notif-badge-label ${badgeClass}">${badgeLabel}</span>
          <span class="notif-entry-date">${dateStr}</span>
        </div>
        ${nameHtml}
        ${subHtml}
      </div>
      ${gotoHandler ? `<div class="notif-entry-actions"><button class="notif-icon-btn notif-goto" title="View" aria-label="View">ℹ️</button></div>` : ''}
    `;
    if (gotoHandler) entry.querySelector('.notif-goto')?.addEventListener('click', gotoHandler);
    notifList.appendChild(entry);
  }
  loadInatDescs(notifList);
}

function openNotifModal() {
  _notifTab = _notifLog.some(n => !n.read) ? 'unread' : 'hints';
  _buildNotifList();
  notifModal.hidden = false;
}
function closeNotifModal() {
  _notifLog.forEach(n => { n.read = true; });
  _saveNotifs();
  updateNotifBadge();
  notifModal.hidden = true;
}

document.getElementById('notif-close').addEventListener('click', closeNotifModal);
document.getElementById('notif-backdrop').addEventListener('click', closeNotifModal);
document.getElementById('notif-tab-unread').addEventListener('click', () => { _notifTab = 'unread'; _buildNotifList(); });
document.getElementById('notif-tab-read').addEventListener('click',   () => { _notifTab = 'read';   _buildNotifList(); });
document.getElementById('notif-tab-hints').addEventListener('click', () => { _notifTab = 'hints'; _buildNotifList(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !notifModal.hidden) closeNotifModal(); });

function _goToCollection(filter, id) {
  _pendingScrollToCollection = { filter, id };
  activeTab = 'collection';
  setFabOpen(false);
  renderAll();
}

function _queueDiscovery(ckey) { _pushCreatureNotif('discovery', ckey); }

function zonesFingerprint() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
  const farmParts = getFarmZoneDefs()
    .filter(d => engine.unlockedFarmZones.has(d.name))
    .map(d => `${d.name}:${engine.zoneAcres.get(d.name) ?? 1}:${engine.zoneWorkers.get(d.name) ?? 1}`).join(',');
  // Sample harvested/gold (bucketed) so locked-card criteria bars re-render as progress advances
  const totalHarvested = engine.getTotalCropsHarvested();
  const masteryLevels = Object.values(getCropCatalog())
    .map(crop => `${crop.id}:${engine.getCropMasteryStatus(crop.id).level}`)
    .join(',');
  return `f${engine.unlockedFarmZones.size}|${farmParts}|h${Math.floor(totalHarvested / 10)}|g${Math.floor(lifetimeGold / 10000)}|m:${masteryLevels}`;
}

function gardenFingerprint() {
  const queuedCounts = new Map();
  engine.nativeEstablishQueue.forEach(item => {
    queuedCounts.set(item.plantId, (queuedCounts.get(item.plantId) ?? 0) + 1);
  });

  const trackedPlantIds = new Set([...engine.plantedSpeciesAcres.keys(), ...queuedCounts.keys()]);
  if (engine.activePlantingId) trackedPlantIds.add(engine.activePlantingId);

  const plantParts = Array.from(trackedPlantIds)
    .sort()
    .map(plantId => `${plantId}:${engine.plantedSpeciesAcres.get(plantId) ?? 0}:${queuedCounts.get(plantId) ?? 0}`)
    .join(',');

  return `r:${engine.completedResearch.size}|pts:${Math.floor(engine.researchPoints)}|free:${engine.getFreeAcres()}|active:${engine.activePlantingId ?? ''}|queue:${engine.nativeEstablishQueue.map(item => item.plantId).join(',')}|cm:${cropMasteryFingerprint()}|${plantParts}`;
}

function ranchFingerprint() {
  const ranchParts = RANCH_ANIMAL_LIST
    .filter(animal => engine.unlockedRanchAnimals.has(animal.id))
    .map(animal => {
      const stats = engine.ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
      return `${animal.id}:${engine.ranchAcres.get(animal.id) ?? 0}:${engine.ranchWorkers.get(animal.id) ?? 1}:${Math.floor(stats.produced / 10)}:${Math.floor(stats.lifetimeSales / 1000)}`;
    }).join(',');
  return `u${engine.unlockedRanchAnimals.size}|f${engine.getFreeAcres()}|${ranchParts}`;
}

function collectionFingerprint() {
  const cropPart = cropMasteryFingerprint();
  const plantPart = `${engine.plantedSpecies.size}:${Array.from(engine.plantedSpeciesAcres.values()).reduce((sum, acres) => sum + acres, 0)}`;
  const invasivePart = Array.from(engine.invasiveAcres.entries())
    .map(([id, acres]) => `${id}:${acres}`)
    .join(',');
  return `${collectionFilter}|crops:${cropPart}|plants:${plantPart}|research:${engine.completedResearch.size}|creatures:${engine.discoveredCreatures.size}|birds:${engine.discoveredBirds.size}|invasives:${invasivePart}`;
}

function mapFingerprint() {
  return `${collectionFingerprint()}|alloc:${engine.getAllocatedAcres()}|inv:${engine.getTotalInvadedAcres()}|free:${engine.getFreeAcres()}|bp:${engine.getTotalBiosphereScore()}`;
}

function updateCropActionButtonStates() {
  content.querySelectorAll('.acre-btn[data-zone-alloc]').forEach(btn => {
    const freeAcres = engine.getFreeAcres();
    const qtyAcre = resolveActionQty(getHeaderQtyForTab('crops'), freeAcres);
    const canAllocate = freeAcres >= 1;
    btn.disabled = !canAllocate;
    btn.classList.toggle('disabled', !canAllocate);
    btn.textContent = getCompactAcreAddLabel(qtyAcre, freeAcres);
  });

  content.querySelectorAll('.worker-btn[data-zone-name-w]').forEach(btn => {
    const def = getFarmZoneDef(btn.dataset.zoneNameW);
    if (!def) return;
    const currentWorkers = engine.zoneWorkers.get(def.name) ?? 1;
    const workerCostFn = n => workerUpgradeCost(def, n);
    const qtyWorker = resolveWorkerQty(getHeaderQtyForTab('crops'), workerCostFn, currentWorkers, engine.gold.amount);
    const workerTotalCost = qtyWorker > 0 ? bulkCost(workerCostFn, currentWorkers, qtyWorker) : 0;
    const canAfford = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;
    btn.disabled = !canAfford;
    btn.classList.toggle('disabled', !canAfford);
    btn.textContent = getCompactWorkerLabel(qtyWorker, workerTotalCost);
  });
}

function updateRanchButtonStates() {
  content.querySelectorAll('.acre-btn[data-ranch-animal-id]').forEach(btn => {
    const freeAcres = engine.getFreeAcres();
    const qtyRanchAcre = resolveActionQty(getHeaderQtyForTab('ranch'), freeAcres);
    const canAllocate = freeAcres >= 1;
    btn.disabled = !canAllocate;
    btn.classList.toggle('disabled', !canAllocate);
    btn.textContent = getCompactAcreAddLabel(qtyRanchAcre, freeAcres);
  });

  content.querySelectorAll('.worker-btn[data-ranch-animal-id-w]').forEach(btn => {
    const animalId = btn.dataset.ranchAnimalIdW;
    const animal = RANCH_ANIMALS[animalId];
    if (!animal) return;
    const workers = engine.ranchWorkers.get(animalId) ?? 1;
    const workerCostFn = n => workerUpgradeCost({ cost: animal.baseCost }, n);
    const qtyWorker = resolveWorkerQty(getHeaderQtyForTab('ranch'), workerCostFn, workers, engine.gold.amount);
    const workerTotalCost = qtyWorker > 0 ? bulkCost(workerCostFn, workers, qtyWorker) : 0;
    const canAfford = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;
    btn.disabled = !canAfford;
    btn.classList.toggle('disabled', !canAfford);
    btn.textContent = getCompactWorkerLabel(qtyWorker, workerTotalCost);
  });
}

function liveUpdate() {
  // ── Detect new creature discoveries ───────────────────────────────────────
  const _currentDiscovered = engine.discoveredCreatures;
  if (_knownDiscovered === null) {
    _knownDiscovered = new Set(_currentDiscovered);
  } else if (_currentDiscovered.size > _knownDiscovered.size) {
    for (const _ck of _currentDiscovered) {
      if (!_knownDiscovered.has(_ck)) _queueDiscovery(_ck);
    }
    _knownDiscovered = new Set(_currentDiscovered);
  }

  // ── Detect newly unlocked crops ────────────────────────────────────────────
  if (_knownUnlockedCrops === null) {
    _knownUnlockedCrops = new Set(Object.keys(getCropCatalog()).filter(id => getCrop(id)?.isUnlocked(engine.cropStats)));
  } else {
    for (const [id, ct] of Object.entries(getCropCatalog())) {
      if (!_knownUnlockedCrops.has(id) && ct.isUnlocked(engine.cropStats)) {
        _knownUnlockedCrops.add(id);
        _pushNotif({ type: 'crop', cropId: id, cropType: ct });
      }
    }
  }

  // ── Detect newly unlocked ranch animals ───────────────────────────────────
  if (ENABLE_RANCH) {
    if (_knownUnlockedRanch === null) {
      _knownUnlockedRanch = new Set(engine.unlockedRanchAnimals);
    } else {
      for (const animal of RANCH_ANIMAL_LIST) {
        if (!_knownUnlockedRanch.has(animal.id) && engine.unlockedRanchAnimals.has(animal.id)) {
          _knownUnlockedRanch.add(animal.id);
          _pushNotif({ type: 'ranch', animalId: animal.id, animal });
        }
      }
    }
  }

  // ── Detect newly established native plants ────────────────────────────────
  if (_knownPlantedSpecies === null) {
    _knownPlantedSpecies = new Set(engine.plantedSpecies);
  } else {
    for (const plantId of engine.plantedSpecies) {
      if (!_knownPlantedSpecies.has(plantId)) {
        _knownPlantedSpecies.add(plantId);
        const plant = ALL_PLANTS.find(p => p.id === plantId);
        if (plant) _pushNotif({ type: 'plant', plantId, plant });
      }
    }
  }

  // ── Detect newly completed research ───────────────────────────────────────
  if (_knownCompletedResearch === null) {
    _knownCompletedResearch = new Set(engine.completedResearch);
  } else {
    for (const rid of engine.completedResearch) {
      if (!_knownCompletedResearch.has(rid)) {
        _knownCompletedResearch.add(rid);
        const project = RESEARCH.find(r => r.id === rid);
        if (project) _pushNotif({ type: 'research', researchId: rid, project });
      }
    }
  }

  updateHeader();
  if (activeTab === 'crops') {
    const fp = zonesFingerprint();
    if (fp !== lastZonesFingerprint) {
      lastZonesFingerprint = fp;
      renderAll();
    } else {
      updateZoneProgressBars();
      updateCropActionButtonStates();
    }
  } else if (ENABLE_RANCH && activeTab === 'ranch') {
    const rfp = ranchFingerprint();
    if (rfp !== lastRanchFingerprint) {
      lastRanchFingerprint = rfp;
      renderAll();
    } else {
      updateRanchButtonStates();
    }
  } else if (activeTab === 'research') {
    // Re-render fully when completions, pts, or active project change
    const _rSlots = engine.researchSlots;
    const rfp = researchFingerprint();
    if (rfp !== lastResearchFingerprint) {
      lastResearchFingerprint = rfp;
      renderAll();
    } else if (_rSlots.length > 0) {
      // In-place: update progress bars and time remaining for all active slots
      const activeCards = content.querySelectorAll('.research-active-card');
      _rSlots.forEach((slot, i) => {
        const card = activeCards[i];
        if (!card) return;
        const project = RESEARCH.find(r => r.id === slot.id);
        if (!project) return;
        const pct       = Math.min(100, Math.round(slot.timer / project.duration * 100));
        const remaining = Math.max(0, project.duration - slot.timer);
        const fill    = card.querySelector('.research-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
        const timeEl  = card.querySelector('.research-active-time');
        if (timeEl) timeEl.textContent = `${fmtDays(remaining)} remaining`;
        const pctEl   = card.querySelector('.research-active-pct');
        if (pctEl) pctEl.textContent = `${pct}% complete`;
      });
    }
  } else if (activeTab === 'garden') {
    const gfp = gardenFingerprint();
    if (gfp !== lastGardenFingerprint) {
      lastGardenFingerprint = gfp;
      renderAll();
    } else {
      updateGardenOperationCard();
    }
  } else if (activeTab === 'map') {
    const mfp = mapFingerprint();
    if (mfp !== lastLandFingerprint) {
      lastLandFingerprint = mfp;
      renderAll();
    }
  } else if (activeTab === 'collection') {
    const cfp = collectionFingerprint();
    if (cfp !== lastCollectionFingerprint) {
      lastCollectionFingerprint = cfp;
      renderAll();
    }
  }
}

function updateZoneProgressBars(nowMs = getNowMs()) {
  if (activeTab !== 'crops') return;

  content.querySelectorAll('.zone-card:not(.locked)').forEach(card => {
    const zoneDef  = getFarmZoneDef(card.dataset.zone);
    if (!zoneDef) return;
    const instance = engine.zoneCrops.get(zoneDef.name);
    if (!instance) return;
    const wm2 = workerMultiplier(engine.zoneWorkers.get(zoneDef.name) ?? 1);
    const progressState = getCropProgressState(instance, wm2, nowMs);
    applyCropProgressIndicator(card.querySelector('.crop-progress-ring'), progressState);
    card.classList.toggle('zone-ready', progressState.isReady);
  });
}

function animateCropProgressRings(nowMs) {
  if (!document.hidden && activeTab === 'crops') {
    updateZoneProgressBars(nowMs);
  }
  window.requestAnimationFrame(animateCropProgressRings);
}

// Initial render + live update every engine tick
renderAll();
setInterval(liveUpdate, ENGINE_TICK_INTERVAL_MS);
window.requestAnimationFrame(animateCropProgressRings);

if (localStorage.getItem(TUTORIAL_SEEN_KEY) !== 'true') {
  setTimeout(() => startTutorial(), 350);
}

