// main.js — UI layer and entry point for Idle Ecologist Text UI
import { createEngine, shortNumber, FARM_ZONE_DEFS, DAY_REAL_SECS, YEAR_REAL_SECS, CALENDAR_MONTHS, SEASONS, calendarDate, acreUpgradeCost, workerUpgradeCost, workerMultiplier, STARTING_LAND_ACRES, ESTABLISH_DAYS, LAND_MARKET_INTERVAL_DAYS, ENABLE_RANCH } from './game.js';
import { CROPS } from './crops.js';
import { RESEARCH, RESEARCH_CATEGORIES } from './research.js';
import { ECOREGIONS, WILDLIFE_TYPE_ICONS } from './ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST } from './ranch.js';
import { BIRDS, BIRD_LIST } from './birds.js';

// Module-level cache for the full plant list (avoid repeated flatMap across renders)
const ALL_PLANTS = ECOREGIONS.flatMap(e => e.plants);

// ── Crop emoji map ────────────────────────────────────────────────────────────
// Used only in <select> option text (HTML not supported there)
const CROP_EMOJI = {
  strawberry:  '🍓', greenOnion: '🌿', potato:     '🥔', onion:      '🧅',
  carrot:      '🥕', blueberry:  '🫐', parsnip:    '🟤', lettuce:    '🥬',
  cauliflower: '🥦', rice:       '🍚', broccoli:   '🌾', asparagus:  '🌱',
};

// Tileset GIDs → CSS sprite icons (marketIconGID from canvas crops.js)
// Sheet: 125 cols × 16 px tiles, 2000 × 1568 px
const CROP_ICON_GID = {
  strawberry:  4486, greenOnion: 4736, potato:     4986, onion:      5236,
  carrot:      5486, blueberry:  5736, parsnip:    5986, lettuce:    6236,
  cauliflower: 6486, rice:       6736, broccoli:   6986, asparagus:  7236,
};
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
const engine = createEngine();
const saved  = engine.loadSave();
if (saved) {
  engine.applyState(saved);
  if (saved.savedAt) {
    const offSecs = (Date.now() - saved.savedAt) / 1000;
    if (offSecs > 5) {
      const result = engine.simulateOffline(offSecs);
      showOfflineToast(result, offSecs);
      // Render before the first tick fires so the paused state is visible immediately
      // (deferred to after DOMContentLoaded / module evaluation completes)
      setTimeout(() => renderAll(), 0);
    }
  }
}

setInterval(() => engine.tick(), 250);
setInterval(() => engine.save(), 10000);

// ── iNaturalist photo cache ───────────────────────────────────────────────────
const INAT_CACHE_KEY = 'inat-photo-cache-v2';
const inatPhotoCache = (() => {
  try { return JSON.parse(localStorage.getItem(INAT_CACHE_KEY) || '{}'); } catch { return {}; }
})();

const INAT_DESC_CACHE_KEY = 'inat-desc-cache-v1';
const inatDescCache = (() => {
  try { return JSON.parse(localStorage.getItem(INAT_DESC_CACHE_KEY) || '{}'); } catch { return {}; }
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
    if (url !== null) {
      inatPhotoCache[sciName] = url;
      localStorage.setItem(INAT_CACHE_KEY, JSON.stringify(inatPhotoCache));
    }
    if (desc !== null) {
      inatDescCache[sciName] = desc;
      localStorage.setItem(INAT_DESC_CACHE_KEY, JSON.stringify(inatDescCache));
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
  else if (!_resetting) engine.save(); // save immediately when tab goes to background
});
acquireWakeLock();

// ── Tab state ─────────────────────────────────────────────────────────────────
const TABS = ENABLE_RANCH
  ? ['crops', 'ranch', 'research', 'garden', 'land', 'collection', 'settings']
  : ['crops', 'research', 'garden', 'land', 'collection', 'settings'];
let activeTab = 'crops';
let cropBuyQty = 1; // 1 | 5 | 10 | 25 | 'max'

// ── In-game tutorial state ───────────────────────────────────────────────────
const TUTORIAL_SEEN_KEY = 'idle-ecologist-tutorial-seen-v1';
const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Idle Ecologist',
    body: 'This tutorial walks you through the core loop: grow crops, sell for gold, expand your farm, and build biodiversity.',
    focusSelector: '#header',
  },
  {
    title: 'Step 1: Grow and Harvest Crops',
    body: 'In Crops, each unlocked zone grows over time. Harvested yields sell for gold, and gold funds more acres and workers for faster output.',
    tab: 'crops',
    focusSelector: '#content',
  },
  {
    title: 'Step 2: Expand Land Capacity',
    body: ENABLE_RANCH
      ? 'In Land, buy more parcels and establish acres. Land is your shared capacity for crops, ranch animals, and native plants.'
      : 'In Land, buy more parcels and establish acres. Land is your shared capacity for crops and native plants.',
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
    focusSelector: '#notif-wrap',
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
let hideCompletedGarden   = localStorage.getItem('hideCompletedGarden')   === 'true';
let hideLockedGarden      = localStorage.getItem('hideLockedGarden')      === 'true';
const collapsedGardenCards = new Set(); // plant IDs currently collapsed

// ── UI Construction ───────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Header
const header = document.getElementById('header');
// Row 1: economic stats
const hudRow1      = el('div', 'hud-row hud-row-stats');
const goldEl       = el('span', 'gold-amount');
const gpsEl        = el('span', 'gps');
const bioHeaderEl  = el('span', 'bio-header');
const rpHeaderEl   = el('span', 'rp-header');
const acresEl      = el('span', 'acres-header');
[goldEl, gpsEl, bioHeaderEl, rpHeaderEl].forEach(e => hudRow1.appendChild(e));
// Row 2: calendar / time (acres merged in here)
const hudRow2      = el('div', 'hud-row hud-row-time');
const seasonEl     = el('span', 'season-badge-hud');
const dayEl        = el('span', 'day-counter');
const timeEl       = el('span', 'time-display');
const nextSeasonEl = el('span', 'next-season-hud');
[acresEl, seasonEl, dayEl, timeEl, nextSeasonEl].forEach(e => hudRow2.appendChild(e));
[hudRow1, hudRow2].forEach(e => header.appendChild(e));

// ── Bottom Tab Navigation ─────────────────────────────────────────────────────
const TAB_LABELS = {
  crops: '🌾 Crops',
  ...(ENABLE_RANCH ? { ranch: '🐄 Ranch' } : {}),
  research: '🌱 Conservation',
  garden: '🌿 Native Garden',
  land: '🗺️ Land',
  collection: '📚 Collection',
  settings: '⚙️ Settings',
};
const TAB_ICONS  = {
  crops: '🌾',
  ...(ENABLE_RANCH ? { ranch: '🐄' } : {}),
  research: '🌱',
  garden: '🌿',
  land: '🗺️',
  collection: '📚',
  settings: '⚙️',
};

const tabButtonsEl = document.getElementById('tab-buttons');
const tabBarEl = document.getElementById('tab-bar');
let fabOpen = false;

const tabBtns = {};
const COMPACT_TAB_MAX_WIDTH = 390;
const COMPACT_TAB_PRIORITY = ['crops', 'research', 'garden', 'land'];

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
  const labelText = TAB_LABELS[tab].split(' ').slice(1).join(' ') || TAB_LABELS[tab];
  const iconEl  = btn.querySelector('.tab-btn-icon');
  const labelEl = btn.querySelector('.tab-btn-label');
  const alertEl = btn.querySelector('.tab-btn-alert');
  if (iconEl) iconEl.textContent = TAB_ICONS[tab] ?? '•';
  if (labelEl) labelEl.textContent = labelText;
  if (alertEl) {
    alertEl.textContent = hasAlert ? '❗' : '';
    alertEl.hidden = !hasAlert;
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
  const isCompact = window.matchMedia(`(max-width: ${COMPACT_TAB_MAX_WIDTH}px)`).matches;
  tabButtonsEl.classList.toggle('compact', isCompact);

  const orderedTabs = [...TABS];
  let visibleTabs = orderedTabs;
  if (isCompact) {
    visibleTabs = COMPACT_TAB_PRIORITY.filter(t => orderedTabs.includes(t)).slice(0, 4);
    if (!visibleTabs.includes(activeTab) && orderedTabs.includes(activeTab)) {
      if (visibleTabs.length === 0) visibleTabs.push(activeTab);
      else visibleTabs[visibleTabs.length - 1] = activeTab;
    }
    visibleTabs = [...new Set(visibleTabs)];
  }

  const overflowTabs = orderedTabs.filter(t => !visibleTabs.includes(t));
  for (const tab of orderedTabs) tabBtns[tab].hidden = !visibleTabs.includes(tab);

  const showOverflow = isCompact && overflowTabs.length > 0;
  tabOverflowBtn.hidden = !showOverflow;
  if (!showOverflow) {
    setFabOpen(false);
  } else {
    _renderOverflowTabs(overflowTabs);
    tabOverflowBtn.classList.toggle('active', overflowTabs.includes(activeTab));
  }
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
  content.innerHTML = '';
  switch (activeTab) {
    case 'crops':    lastZonesFingerprint = zonesFingerprint(); renderCrops();    break;
    case 'ranch':    renderRanch();    break;
    case 'research':   renderResearch();   break;
    case 'garden':     renderGarden();     break;
    case 'land':       renderLand();       break;
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
  if (tutorialState.open) {
    updateTutorialModal();
    syncTutorialFocus();
  }
}

// ── Header update ─────────────────────────────────────────────────────────────
function updateHeader() {
  goldEl.textContent = `🪙 ${shortNumber(engine.gold.amount)}`;
  gpsEl.textContent  = `+${shortNumber(engine.getTotalGPS() * engine.gameSpeed)}/s`;

  // Calendar date
  const cal = calendarDate(engine.inGameDay);
  document.body.dataset.season = cal.season.name;

  // Time of day derived from calendarAccum (0 → midnight, 1.0 → next midnight)
  const fracOfDay  = engine.calendarAccum / DAY_REAL_SECS;
  const totalMins  = Math.floor(fracOfDay * 24 * 60);
  const hr24       = Math.floor(totalMins / 60);
  const min        = totalMins % 60;
  const ampm       = hr24 < 12 ? 'AM' : 'PM';
  const hr12       = hr24 % 12 || 12;
  const timeStr    = `${hr12}:${String(min).padStart(2, '0')} ${ampm}`;
  const timeIcon   = hr24 < 5 || hr24 >= 21 ? '🌙'
                   : hr24 < 8               ? '🌅'
                   : hr24 < 18              ? '☀️'
                   :                          '🌇';
  seasonEl.textContent    = `${cal.season.emoji} ${cal.season.name}`;
  dayEl.textContent       = `${cal.month.abbr} ${cal.day}, Yr ${cal.year}`;
  timeEl.textContent      = `${timeIcon} ${timeStr}`;
  const _curSeasonIdx     = SEASONS.findIndex(s => s.name === cal.season.name);
  const _nxtSeason        = SEASONS[(_curSeasonIdx + 1) % SEASONS.length];
  const _daysToNxt        = _nxtSeason.startDoy > cal.dayOfYear
    ? _nxtSeason.startDoy - cal.dayOfYear
    : 365 - cal.dayOfYear + _nxtSeason.startDoy;
  nextSeasonEl.textContent = `${_daysToNxt}d → ${_nxtSeason.emoji} ${_nxtSeason.name}`;

  // Biosphere score + gold multiplier (combined badge)
  bioHeaderEl.textContent = `🌍 ${engine.getTotalBiosphereScore()} BP = ×${engine.getGoldMultiplier().toFixed(2)} 💰`;

  // Acres in use
  const _totalAcres     = engine.totalLandAcres;
  const _allocatedAcres = _totalAcres - engine.getFreeAcres();
  const _acresFull      = _allocatedAcres >= _totalAcres;
  acresEl.textContent   = `🗺️ ${_allocatedAcres}/${_totalAcres} acres`;
  acresEl.title         = _acresFull ? 'All acres allocated' : `${engine.getFreeAcres()} acres free`;
  acresEl.classList.toggle('acres-full', _acresFull);

  // Research points
  const pts = engine.researchPoints;

  // Check if any research project is affordable & available
  const _completedR = engine.completedResearch;
  const _activeR    = engine.activeResearchId;
  const hasAffordableResearch = RESEARCH.some(r =>
    !_completedR.has(r.id) && r.id !== _activeR &&
    r.requires.every(req => _completedR.has(req)) &&
    pts >= r.cost
  );

  // Check if any garden plant is affordable & not yet planted/active
  const _planted  = engine.plantedSpecies;
  const _activeP  = engine.activePlantingId;
  const hasAffordableGarden = ECOREGIONS.some(eco =>
    eco.plants.some(p =>
      !_planted.has(p.id) && p.id !== _activeP &&
      (p.requiresResearch ?? []).every(rid => _completedR.has(rid)) &&
      pts >= p.cost
    )
  );

  const rpAlert = (hasAffordableResearch && !engine.activeResearchId) || (hasAffordableGarden && !engine.activePlantingId && engine.nativeEstablishQueue.length === 0);
  const _rpPerDay = engine.unlockedFarmZones.size;
  rpHeaderEl.textContent = `🌱 ${shortNumber(pts)} CP (+${_rpPerDay}/day)${rpAlert ? ' ❗' : ''}`;

  // Update tab button labels with ❗ when relevant tab has affordable items
  const _gardenBusy = !!engine.activePlantingId || engine.nativeEstablishQueue.length > 0;
  _setTabBtnText('research', hasAffordableResearch && !engine.activeResearchId);
  _setTabBtnText('garden', hasAffordableGarden && !_gardenBusy);
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

/** Returns the next SEASONS entry in which the given CropType is active (wraps around the year). */
function nextSeasonFor(ct) {
  const cur = SEASONS.findIndex(s => s.name === engine.currentSeasonName);
  for (let i = 1; i <= 4; i++) {
    const s = SEASONS[(cur + i) % 4];
    if (ct.isInSeason(s.name)) return s;
  }
  return null;
}

/** Generate an iNaturalist taxa-search URL for a scientific name. */
function inatUrl(sci) {
  return `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(sci)}`;
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

// ── CROPS TAB ────────────────────────────────────────────────────────────────
function renderCrops() {
  // ── Top bar: buy qty + speed/pause ──
  const topBar = el('div', 'crops-top-bar');

  const qtyBar = el('div', 'buy-qty-bar');
  for (const qty of [1, 5, 10, 25, 'max']) {
    const btn = el('button', `buy-qty-btn${cropBuyQty === qty ? ' active' : ''}`, qty === 'max' ? 'Max' : `×${qty}`);
    btn.title = qty === 'max' ? 'Buy as many as you can afford' : `Buy ${qty} at a time`;
    btn.addEventListener('click', () => { cropBuyQty = qty; renderAll(); });
    qtyBar.appendChild(btn);
  }
  topBar.appendChild(qtyBar);

  const speedBar = el('div', 'crops-speed-bar');
  const pauseIconBtn = el('button', `crops-speed-btn${engine.gamePaused ? ' active' : ''}`, engine.gamePaused ? '▶' : '⏸');
  pauseIconBtn.title = engine.gamePaused ? 'Resume' : 'Pause';
  pauseIconBtn.addEventListener('click', () => { engine.setPaused(!engine.gamePaused); renderAll(); });
  speedBar.appendChild(pauseIconBtn);
  for (const spd of [1, 3, 6, 12]) {
    const sBtn = el('button', `crops-speed-btn${engine.gameSpeed === spd ? ' active' : ''}`, `${spd}×`);
    sBtn.title = `${spd}× speed`;
    sBtn.addEventListener('click', () => { engine.setGameSpeed(spd); renderAll(); });
    speedBar.appendChild(sBtn);
  }
  topBar.appendChild(speedBar);

  content.appendChild(topBar);

  // ── Farm Zones ──
  const farmHeader = el('h2', 'section-header', '🌾 Farm Zones');
  content.appendChild(farmHeader);

  // Sort: active (unlocked + in-season) first, dormant second, locked last
  const _cur = engine.currentSeasonName;
  const _sortedDefs = [...FARM_ZONE_DEFS].sort((a, b) => {
    const rank = d => {
      if (!engine.unlockedFarmZones.has(d.name)) return 2;          // locked
      if (!CROPS[d.cropId]?.isInSeason(_cur))    return 1;          // dormant
      return 0;                                                      // active
    };
    return rank(a) - rank(b);
  });

  _sortedDefs.forEach(def => {
    const unlocked = engine.unlockedFarmZones.has(def.name);
    if (unlocked) {
      const _ct = CROPS[def.cropId];
      if (_ct && !_ct.isInSeason(engine.currentSeasonName)) {
        // ── Compact dormant card with acre controls ──
        const dormCard = el('div', 'zone-card dormant-zone');
        const ns = nextSeasonFor(_ct);
        const dormTop = el('div', 'zone-top-row');
        dormTop.innerHTML = `
          ${_ct.sciName ? inatThumbHtml(_ct.sciName, 'zone-thumb', _ct.name) : ''}
          <div class="zone-name-meta">
            <span class="zone-name">${_ct.name}</span>
            <span class="zone-meta zone-dormant-season">💤 Dormant · Returns ${ns?.emoji ?? ''} ${ns?.name ?? ''} · 🪙 ${shortNumber(_ct.yieldGold)}/acre</span>
          </div>
        `;
        dormCard.appendChild(dormTop);
        dormCard.appendChild(el('div', 'zone-dormant-bar'));
        const currentAcres = engine.zoneAcres.get(def.name) ?? 0;
        const freeAcres    = engine.getFreeAcres();
        const dormAcreRow  = el('div', 'acre-upgrade-row');
        dormAcreRow.innerHTML = `<span class="acre-label">Acres: <strong>${currentAcres}</strong></span>`;
        if (currentAcres > 0) {
          const removeQty = cropBuyQty === 'max' ? currentAcres : Math.min(cropBuyQty, currentAcres);
          const removeBtn = el('button', 'buy-btn acre-btn danger-btn',
            removeQty > 1 ? `−${removeQty} acres` : '−1 acre');
          removeBtn.addEventListener('click', () => {
            for (let i = 0; i < removeQty; i++) engine.deallocateCropAcre(def.name);
            renderAll();
          });
          dormAcreRow.appendChild(removeBtn);
        }
        if (freeAcres >= 1) {
          const allocBtn = el('button', 'buy-btn acre-btn', `+1 acre (${freeAcres} free)`);
          allocBtn.addEventListener('click', () => { engine.queueCropAcre(def.name, 1); renderAll(); });
          dormAcreRow.appendChild(allocBtn);
        }
        dormCard.appendChild(dormAcreRow);

        const dormStats = engine.cropStats.get(_ct.id) ?? { grown: 0, sold: 0, lifetimeSales: 0 };
        const dormStatsRow = el('div', 'ranch-stats-row');
        dormStatsRow.innerHTML = `
          <span>🌾 Grown: <strong>${shortNumber(dormStats.grown)}</strong></span>
          <span>💰 Sold: <strong>${shortNumber(dormStats.sold)}</strong></span>
          <span>🪙 Earned: <strong>${shortNumber(dormStats.lifetimeSales)}g</strong></span>
        `;
        dormCard.appendChild(dormStatsRow);

        dormCard.dataset.zone = def.name;
        content.appendChild(dormCard);
        return;
      }
    }
    const card = el('div', `zone-card${unlocked ? '' : ' locked'}`);
    card.dataset.zone = def.name;

    if (!unlocked) {
      const boundCrop = CROPS[def.cropId];
      const lockRow = el('div', 'lock-row');
      lockRow.innerHTML = `
        <span class="lock-icon">🔒</span>
        ${boundCrop?.sciName ? inatThumbHtml(boundCrop.sciName, 'lock-thumb', boundCrop.name) : ''}
        <span class="zone-name">${boundCrop?.name ?? def.cropId}</span>
      `;
      card.appendChild(lockRow);
      if (boundCrop?.seasons) {
        const lockedSeasons = el('div', 'zone-seasons');
        lockedSeasons.innerHTML = boundCrop.seasons.map(s => {
          const sObj = SEASONS.find(x => x.name === s);
          return `<span class="zone-season-badge${s === engine.currentSeasonName ? ' active' : ''}">${sObj?.emoji ?? ''} ${s}</span>`;
        }).join('');
        card.appendChild(lockedSeasons);
      }
      if (boundCrop?.unlockCriteria) {
        const { totalSold: required } = boundCrop.unlockCriteria;
        const soldNow = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);
        const soldPct = Math.min(100, Math.round(soldNow / required * 100));
        const reqsEl  = el('div', 'unlock-reqs');
        reqsEl.innerHTML = `
          <span class="unlock-req">${shortNumber(soldNow)}<span class="next-sep">/</span>${shortNumber(required)} total crops sold
            <span class="next-mini-bar"><span class="next-mini-fill" style="width:${soldPct}%"></span></span>
          </span>
        `;
        card.appendChild(reqsEl);
      }
    } else {
      const instance = engine.zoneCrops.get(def.name);
      const ct       = instance?.cropType;
      const progress = instance?.overallProgress ?? 0;
      const currentSeason = engine.currentSeasonName;

      // Top row: iNat photo + crop name/sci meta + GPS
      const topRow = el('div', 'zone-top-row');
      const _wm  = workerMultiplier(engine.zoneWorkers.get(def.name) ?? 1);
      const _cyc = ct ? ct.totalGrowthTime / (engine.gameSpeed * _wm * 4) : 0;
      topRow.innerHTML = `
        ${ct?.sciName ? inatThumbHtml(ct.sciName, 'zone-thumb', ct.name) : ''}
        <div class="zone-name-meta">
          <span class="zone-name">${ct?.name ?? '—'}</span>
          <span class="zone-meta">${ct?.sciName ? `<em>${ct.sciName}</em> · ` : ''}${engine.zoneAcres.get(def.name) ?? 0} acres${ct ? ` · ⏱ ${fmtDur(_cyc)}` : ''}${ct ? ` · 🪙 ${shortNumber(ct.yieldGold)}/acre` : ''}</span>
        </div>
        <span class="zone-gps">🪙 ${shortNumber((ct?.yieldGold ?? 0) * (engine.zoneAcres.get(def.name) ?? 0))} / harvest</span>
      `;
      card.appendChild(topRow);
      if (ct) {
        const cropInfoBtn = el('button', 'zone-info-btn', 'ℹ️');
        cropInfoBtn.title = 'View in Collection';
        cropInfoBtn.addEventListener('click', e => { e.stopPropagation(); _goToCollection('crops', ct.id); });
        topRow.appendChild(cropInfoBtn);
      }

      // Season badges
      if (ct) {
        const seasonBadges = el('div', 'zone-seasons');
        seasonBadges.innerHTML = ct.seasons.map(s => {
          const sObj = SEASONS.find(x => x.name === s);
          return `<span class="zone-season-badge${s === currentSeason ? ' active' : ''}">${sObj?.emoji ?? ''} ${s}</span>`;
        }).join('');
        card.appendChild(seasonBadges);
      }

      // Progress bar
      const barWrap = el('div', 'progress-wrap');
      const bar     = el('div', 'progress-bar');
      const _remGame  = (instance && ct && !instance.isFullyGrown)
        ? ((ct.totalPhases - instance.phase) * ct.growthTimePerPhase - instance.timer)
        : 0;
      const _nearHarvest = instance && !instance.isFullyGrown && (_remGame / (engine.gameSpeed * _wm * 4)) <= 5;
      if (_nearHarvest) {
        bar.style.transition = 'none';
        bar.style.width = '100%';
      } else {
        bar.style.width = `${(progress * 100).toFixed(3)}%`;
      }
      bar.classList.add(instance?.isFullyGrown ? 'ready' : _nearHarvest ? 'near-harvest' : 'growing');
      if (_nearHarvest) barWrap.classList.add('near-harvest');
      barWrap.appendChild(bar);
      // Phase milestone ticks on the bar
      if (ct?.growthPhaseNames?.length > 0) {
        const _totalSteps = ct.totalPhases - 1;
        ct.growthPhaseNames.forEach((_, _ti) => {
          if (_ti === 0) return; // skip left edge
          const _pct = (_ti / _totalSteps) * 100;
          const _passed = instance?.isFullyGrown || (instance && _ti <= instance.phase);
          const _tick = el('div', 'phase-tick' + (_nearHarvest ? ' near-harvest' : _passed ? ' passed' : ''));
          _tick.style.left = `${_pct}%`;
          barWrap.appendChild(_tick);
        });
      }
      const pctLabel = el('span', 'progress-pct', instance?.isFullyGrown ? 'Ready!' : _nearHarvest ? 'Actively growing' : `${Math.round(progress * 100)}%`);
      barWrap.appendChild(pctLabel);
      card.appendChild(barWrap);

      // Phase labels row
      if (ct?.growthPhaseNames?.length > 0) {
        const _labelsRow = el('div', 'phase-labels-row');
        const _totalSteps2 = ct.totalPhases - 1;
        ct.growthPhaseNames.forEach((phaseName, _li) => {
          const _pct2 = (_li / _totalSteps2) * 100;
          const _isCur = instance && !instance.isFullyGrown && _li === instance.phase;
          const _isPast = instance?.isFullyGrown || (instance && _li < instance.phase);
          const _lbl = el('span', 'phase-label' + (_nearHarvest ? ' near-harvest' : _isCur ? ' active' : _isPast ? ' passed' : ''));
          _lbl.textContent = phaseName;
          _lbl.style.left = `${_pct2}%`;
          _lbl.style.transform = _li === 0 ? 'translateX(0)' : 'translateX(-50%)';
          _labelsRow.appendChild(_lbl);
        });
        card.appendChild(_labelsRow);
        // Compact single-line status for narrow screens (hidden on desktop via CSS)
        const _curPhaseName = instance?.isFullyGrown
          ? '✅ Ready to harvest'
          : ct.growthPhaseNames[instance?.phase ?? 0] ?? '';
        const _phaseNum = (instance?.phase ?? 0) + 1;
        const _statusEl = el('div', 'phase-status-compact',
          instance?.isFullyGrown ? '✅ Ready to harvest' : `▶ ${_curPhaseName} (${_phaseNum} / ${ct.totalPhases})`);
        card.appendChild(_statusEl);
      } else {
        const phaseRow = el('div', 'phase-row');
        phaseRow.textContent = ct
          ? instance.isFullyGrown
            ? `✅ Ready to harvest`
            : `Growing — stage ${instance.phase + 1} of ${ct.totalPhases}`
          : '';
        card.appendChild(phaseRow);
      }

      // Acre allocation row (land pool – no gold cost)
      const currentAcres = engine.zoneAcres.get(def.name) ?? 0;
      const freeAcres    = engine.getFreeAcres();
      const acreRow = el('div', 'acre-upgrade-row');
      acreRow.innerHTML = `<span class="acre-label">Acres: <strong>${currentAcres}</strong></span>`;
      
      // Buy land button (always present to prevent layout shift)
      const goLandBtn = el('button', `buy-btn${freeAcres >= 1 ? ' disabled' : ''}`, '🗺️ Buy land');
      goLandBtn.disabled = freeAcres >= 1;
      goLandBtn.addEventListener('click', () => { activeTab = 'land'; renderAll(); });
      acreRow.appendChild(goLandBtn);
      
      const qtyAcre = cropBuyQty === 'max' ? Math.max(0, freeAcres) : cropBuyQty;
      const qtyRemoveAcre = cropBuyQty === 'max' ? currentAcres : Math.min(cropBuyQty, currentAcres);
      const canAllocate = freeAcres >= 1;
      const canRemove   = currentAcres > 0;
      if (canRemove) {
        const removeBtn = el('button', 'buy-btn acre-btn danger-btn',
          qtyRemoveAcre > 1 ? `−${qtyRemoveAcre} acres` : '−1 acre');
        removeBtn.addEventListener('click', () => {
          for (let i = 0; i < qtyRemoveAcre; i++) engine.deallocateCropAcre(def.name);
          renderAll();
        });
        acreRow.appendChild(removeBtn);
      }
      const allocBtn = el('button', `buy-btn acre-btn${canAllocate ? '' : ' disabled'}`,
        qtyAcre > 1 ? `+${Math.min(qtyAcre, freeAcres)} acre${Math.min(qtyAcre, freeAcres) !== 1 ? 's' : ''} (${freeAcres} free)` : canAllocate ? `+1 acre (${freeAcres} free)` : 'No free acres');
      allocBtn.disabled = !canAllocate;
      if (canAllocate) {
        allocBtn.addEventListener('click', () => {
          engine.queueCropAcre(def.name, qtyAcre === 'max' ? freeAcres : qtyAcre);
          renderAll();
        });
      }
      acreRow.appendChild(allocBtn);
      card.appendChild(acreRow);

      // Worker upgrade row
      const currentWorkers   = engine.zoneWorkers.get(def.name) ?? 1;
      const workerCostFn     = n => workerUpgradeCost(def, n);
      const qtyWorker        = cropBuyQty === 'max'
        ? maxAffordableCount(workerCostFn, currentWorkers, engine.gold.amount)
        : cropBuyQty;
      const workerTotalCost  = qtyWorker > 0 ? bulkCost(workerCostFn, currentWorkers, qtyWorker) : 0;
      const canAffordWorkers = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;
      const mult             = workerMultiplier(currentWorkers);
      const workerRow  = el('div', 'acre-upgrade-row');
      workerRow.innerHTML = `<span class="acre-label">Workers: <strong>${currentWorkers}</strong> <span style="color:#aaa;font-size:11px">(${mult.toFixed(2)}\u00d7 speed)</span></span>`;
      const wBtnLabel = qtyWorker > 0
        ? `+${qtyWorker} worker${qtyWorker !== 1 ? 's' : ''} \u2014 \ud83e\ude99 ${shortNumber(workerTotalCost)}`
        : '+workers \u2014 can\'t afford';
      const wBtn = el('button', `buy-btn acre-btn worker-btn${canAffordWorkers ? '' : ' disabled'}`, wBtnLabel);
      wBtn.disabled = !canAffordWorkers;
      wBtn.dataset.zoneNameW = def.name;
      if (canAffordWorkers) {
        wBtn.addEventListener('click', () => {
          for (let i = 0; i < qtyWorker; i++) engine.upgradeZoneWorkers(def.name);
          renderAll();
        });
      }
      workerRow.appendChild(wBtn);
      if (!canAffordWorkers && qtyWorker > 0) {
        const workerTta = timeToUnlock(workerTotalCost);
        if (workerTta) workerRow.appendChild(el('span', 'tta-label', workerTta));
      }
      card.appendChild(workerRow);

      const cropStatsRow = engine.cropStats.get(ct?.id) ?? { grown: 0, sold: 0, lifetimeSales: 0 };
      const statsEl = el('div', 'ranch-stats-row');
      statsEl.innerHTML = `
        <span>🌾 Grown: <strong>${shortNumber(cropStatsRow.grown)}</strong></span>
        <span>💰 Sold: <strong>${shortNumber(cropStatsRow.sold)}</strong></span>
        <span>🪙 Earned: <strong>${shortNumber(cropStatsRow.lifetimeSales)}g</strong></span>
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
  const totalSoldAllCrops = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);

  const topBar = el('div', 'crops-top-bar');
  const qtyBar = el('div', 'buy-qty-bar');
  for (const qty of [1, 5, 10, 25, 'max']) {
    const btn = el('button', `buy-qty-btn${cropBuyQty === qty ? ' active' : ''}`, qty === 'max' ? 'Max' : `×${qty}`);
    btn.title = qty === 'max' ? 'Use max quantity when possible' : `Use ${qty} at a time`;
    btn.addEventListener('click', () => { cropBuyQty = qty; renderAll(); });
    qtyBar.appendChild(btn);
  }
  topBar.appendChild(qtyBar);
  content.appendChild(topBar);

  const header = el('div', 'ranch-header');
  header.innerHTML = `
    <h2 class="ranch-title">🐄 Ranch</h2>
    <p class="ranch-subtitle">Unlock farm animals by selling crops. Each animal produces gold passively — expand with more acreage and hire workers to increase output.</p>
  `;
  content.appendChild(header);

  for (const animal of RANCH_ANIMAL_LIST) {
    const isUnlocked = unlocked.has(animal.id);

    if (!isUnlocked) {
      // ── Locked animal card ─────────────────────────────────────────────────
      const required = animal.unlockCriteria.totalSold;
      const pct      = Math.min(100, Math.round(totalSoldAllCrops / required * 100));
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
            🌾 ${shortNumber(totalSoldAllCrops)}<span class="next-sep">/</span>${shortNumber(required)} total crops sold
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

    const workerCostFn = n => workerUpgradeCost({ cost: animal.baseCost }, n);
    const qtyWorker = cropBuyQty === 'max'
      ? maxAffordableCount(workerCostFn, workers, engine.gold.amount)
      : cropBuyQty;
    const workerTotalCost = qtyWorker > 0 ? bulkCost(workerCostFn, workers, qtyWorker) : 0;
    const canAffordWorker = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;

    const card = el('div', 'ranch-card ranch-card-unlocked');

    // Header row
    const cardHead = el('div', 'ranch-card-head');
    cardHead.innerHTML = `
      ${inatThumbHtml(animal.sci, 'ranch-thumb', animal.name)}
      <div class="ranch-animal-names">
        <span class="ranch-animal-name">${animal.name}</span>
        <a class="ranch-animal-sci inat-link" href="${inatUrl(animal.sci)}" target="_blank" rel="noopener noreferrer">${animal.sci} ↗</a>
        <span class="ranch-product-label">📦 ${animal.product}</span>
      </div>
      <div class="ranch-gps">+${shortNumber(gps)}<span class="ranch-gps-unit">/s</span></div>
    `;
    card.appendChild(cardHead);
    const ranchInfoBtn = el('button', 'zone-info-btn', 'ℹ️');
    ranchInfoBtn.title = 'View in Collection';
    ranchInfoBtn.addEventListener('click', () => _goToCollection('ranch', animal.id));
    cardHead.appendChild(ranchInfoBtn);

    // Acre allocation row (matches crops layout)
    const freeAcresForRanch = engine.getFreeAcres();
    const qtyRanchAcre = cropBuyQty === 'max' ? freeAcresForRanch : Math.min(cropBuyQty, freeAcresForRanch);
    const qtyRemoveRanchAcre = cropBuyQty === 'max' ? acres : Math.min(cropBuyQty, acres);
    const acreRow = el('div', 'acre-upgrade-row');
    acreRow.innerHTML = `<span class="acre-label">Acres: <strong>${acres}</strong></span>`;
    const canAllocateRanch = freeAcresForRanch >= 1;
    const canRemoveRanch   = acres > 0;
    if (canRemoveRanch) {
      const ranchRemoveBtn = el('button', 'buy-btn acre-btn danger-btn',
        qtyRemoveRanchAcre > 1 ? `−${qtyRemoveRanchAcre} acres` : '−1 acre');
      ranchRemoveBtn.addEventListener('click', () => {
        for (let i = 0; i < qtyRemoveRanchAcre; i++) engine.deallocateRanchAcre(animal.id);
        renderAll();
      });
      acreRow.appendChild(ranchRemoveBtn);
    }
    const ranchAllocBtn = el('button', `buy-btn acre-btn${canAllocateRanch ? '' : ' disabled'}`,
      canAllocateRanch
        ? qtyRanchAcre > 1
          ? `+${qtyRanchAcre} acres (${freeAcresForRanch} free)`
          : `+1 acre (${freeAcresForRanch} free)`
        : 'No free acres');
    ranchAllocBtn.dataset.ranchAnimalId = animal.id;
    if (canAllocateRanch) {
      ranchAllocBtn.addEventListener('click', () => {
        engine.queueRanchAcre(animal.id, qtyRanchAcre);
        renderAll();
      });
    } else {
      ranchAllocBtn.disabled = true;
    }
    acreRow.appendChild(ranchAllocBtn);
    const goLandBtnR = el('button', 'buy-btn', '🗺️ Buy land');
    goLandBtnR.dataset.ranchBuyLand = animal.id;
    goLandBtnR.hidden = canAllocateRanch;
    goLandBtnR.addEventListener('click', () => { activeTab = 'land'; renderAll(); });
    acreRow.appendChild(goLandBtnR);
    card.appendChild(acreRow);

    // Worker upgrade row (matches crops layout)
    const workerRow = el('div', 'acre-upgrade-row');
    workerRow.innerHTML = `<span class="acre-label">Workers: <strong>${workers}</strong> <span style="color:#aaa;font-size:11px">(${wm.toFixed(2)}× speed)</span></span>`;
    const workerBtn = el('button', `buy-btn acre-btn worker-btn${canAffordWorker ? '' : ' disabled'}`,
      qtyWorker > 0
        ? `+${qtyWorker} worker${qtyWorker !== 1 ? 's' : ''} — 🪙 ${shortNumber(workerTotalCost)}`
        : '+workers — can\'t afford');
    workerBtn.dataset.ranchAnimalIdW = animal.id;
    if (canAffordWorker) {
      workerBtn.addEventListener('click', () => {
        for (let i = 0; i < qtyWorker; i++) engine.upgradeRanchWorkers(animal.id);
        renderAll();
      });
    } else {
      workerBtn.disabled = true;
      if (qtyWorker > 0) {
        const workerTtaLabel = timeToUnlock(workerTotalCost);
        if (workerTtaLabel) workerRow.appendChild(el('span', 'tta-label', workerTtaLabel));
      }
    }
    workerRow.appendChild(workerBtn);
    card.appendChild(workerRow);

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

// ── RESEARCH TAB ─────────────────────────────────────────────────────────────
function renderResearch() {
  const completed  = engine.completedResearch;
  const activeId   = engine.activeResearchId;
  const activeTimer= engine.activeResearchTimer;
  const pts        = engine.researchPoints;
  const planted    = engine.plantedSpecies;
  const biosphere    = engine.getBiosphereScore();
  const gardenBio    = engine.getGardenBiosphereScore();
  const creatureBio  = engine.getCreatureBiosphereScore();
  const totalBio     = biosphere + gardenBio + creatureBio;
  const maxBiosphere = RESEARCH.reduce((s, r) => s + (r.effect?.biosphereBonus ?? 0), 0);
  const maxGardenBio = ALL_PLANTS.reduce((s, p) => s + (p.biosphereBonus ?? 0), 0);
  const maxCreatureBio = ALL_PLANTS.reduce((s, p) => s + (p.insectsHosted?.length ?? 0), 0);
  const maxTotal     = maxBiosphere + maxGardenBio + maxCreatureBio;
  const goldMult     = engine.getGoldMultiplier();

  // ── Biosphere Score banner ──────────────────────────────────────────────────
  const banner = el('div', 'research-banner');
  const bioPct    = Math.round(totalBio / maxTotal * 100);
  const gardenPct = maxGardenBio > 0 ? Math.round(gardenBio / maxGardenBio * 100) : 0;
  banner.innerHTML = `
    <div class="research-banner-row">
      <span class="bio-label">🌍 Biosphere Score</span>
      <span class="bio-score">${totalBio} <span class="bio-max">/ ${maxTotal}</span></span>
      <span class="research-pts">🌱 ${pts} CP</span>
    </div>
    <div class="bio-bar-track"><div class="bio-bar-fill" style="width:${bioPct}%"></div></div>
    <div class="bio-breakdown">
      <span>🌱 Conservation: <strong>${biosphere}</strong></span>
      <span>🌿 Garden: <strong>${gardenBio}</strong> / ${maxGardenBio} &nbsp;<span style="color:#aaa;font-size:11px">(${gardenPct}%)</span></span>
      <span>🦋 Creatures: <strong>${creatureBio}</strong> / ${maxCreatureBio}</span>
      <span>💰 Gold Bonus: <strong>${goldMult.toFixed(2)}×</strong></span>
    </div>
    <p class="research-hint">Conservation points are earned passively — ${engine.unlockedFarmZones.size} CP/day from your ${engine.unlockedFarmZones.size} unlocked farm zone${engine.unlockedFarmZones.size !== 1 ? 's' : ''}. Plant native species in the 🌿 Garden tab to add more.</p>
  `;
  content.appendChild(banner);

  // ── Active research card ────────────────────────────────────────────────────
  if (activeId) {
    const project = RESEARCH.find(r => r.id === activeId);
    const pct     = project ? Math.min(100, Math.round(activeTimer / project.duration * 100)) : 0;
    const remaining = project ? Math.max(0, project.duration - activeTimer) : 0;

    const activeCard = el('div', 'research-active-card');
    activeCard.innerHTML = `
      <div class="research-active-header">
        <span class="research-active-icon">${project?.icon ?? '🌱'}</span>
        <span class="research-active-name">${project?.name ?? activeId}</span>
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
    activeCard.querySelector('.research-cancel-btn').addEventListener('click', () => {
      engine.cancelResearch();
      renderAll();
    });
    content.appendChild(activeCard);
  } else {
    const idleNote = el('p', 'research-idle-note', '— No project in progress. Start one below. —');
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
  content.appendChild(researchToggleBar);

  // ── Category sections ──────────────────────────────────────────────────────
  for (const cat of Object.values(RESEARCH_CATEGORIES)) {
    const catProjects = RESEARCH.filter(r => r.category === cat.id);
    const section = el('div', 'research-section');

    const catHeader = el('h2', 'section-header', cat.label);
    section.appendChild(catHeader);

    const catDesc = el('p', 'research-cat-desc', cat.desc);
    section.appendChild(catDesc);

    for (const project of catProjects) {
      const isDone   = completed.has(project.id);
      if (hideCompletedResearch && isDone) continue;
      const isActive = activeId === project.id;
      const prereqsMet = project.requires.every(req => completed.has(req));
      const canAfford  = pts >= project.cost;
      const canStart   = prereqsMet && canAfford && !isDone && !activeId;

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
        badge.textContent = '🔒 Locked';
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
      meta.innerHTML = `<span class="research-effect">✨ ${project.effect.label}</span>`;
      if (project.requires.length > 0) {
        const reqNames = project.requires.map(req => {
          const r = RESEARCH.find(p => p.id === req);
          const met = completed.has(req);
          return `<span class="research-req${met ? ' met' : ''}">${met ? '✅' : '🔒'} ${r?.name ?? req}</span>`;
        });
        meta.innerHTML += `&nbsp;·&nbsp; Requires: ${reqNames.join(', ')}`;
      }

      // Plants unlocked by this research
      const unlockedByThis = ALL_PLANTS.filter(p =>
        (p.requiresResearch ?? []).includes(project.id)
      );
      if (unlockedByThis.length > 0) {
        const plantNames = unlockedByThis.map(p => {
          const isPlanted = planted.has(p.id);
          return `<span class="research-unlocks-plant${isPlanted ? ' planted' : ''}">${p.icon ?? '🌿'} ${p.name}${isPlanted ? ' ✅' : ''}</span>`;
        }).join(', ');
        meta.innerHTML += `<br><span class="research-unlocks-label">🌿 Unlocks plants:</span> ${plantNames}`;
      }

      card.appendChild(meta);

      // Action button
      if (!isDone && !isActive) {
        const btnRow = el('div', 'btn-row');
        const btn = el('button', `action-btn${canStart ? '' : ' disabled'}`, canStart ? '▶ Start Project' : (!prereqsMet ? '🔒 Prerequisites needed' : `🌱 Need ${project.cost - pts} more CP`));
        if (canStart) {
          btn.addEventListener('click', () => { engine.startResearch(project.id); renderAll(); });
        } else {
          btn.disabled = true;
        }
        btnRow.appendChild(btn);
        card.appendChild(btnRow);
      }

      section.appendChild(card);
    }

    content.appendChild(section);
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
    !(p.requiresResearch ?? []).every(rid => completedResearch.has(rid))
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

    // ── Active planting card (legacy migration progress display) ─────────────────
    const activePlant = activePId ? ecoregion.plants.find(p => p.id === activePId) : null;
    if (activePlant) {
      const pct       = Math.min(100, Math.round(activePTimer / activePlant.duration * 100));
      const remaining = Math.max(0, activePlant.duration - activePTimer);
      const activeCard = el('div', 'research-active-card garden-active-card');
      activeCard.innerHTML = `
        <div class="research-active-header">
          <span class="research-active-icon">${activePlant.icon}</span>
          <span class="research-active-name">Establishing ${activePlant.name}… (legacy)</span>
          <span class="research-active-time">${fmtDays(remaining)} remaining</span>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill garden-progress" style="width:${pct}%"></div>
        </div>
        <div class="research-active-footer">
          <span class="research-active-pct">${pct}% established</span>
          <button class="action-btn danger research-cancel-btn">✕ Cancel</button>
        </div>
      `;
      activeCard.querySelector('.research-cancel-btn').addEventListener('click', () => {
        engine.cancelPlanting();
        renderAll();
      });
      content.appendChild(activeCard);
    }
    // Queue status for this ecoregion's plants
    const queuedInEco = engine.nativeEstablishQueue.filter(i =>
      ecoregion.plants.some(p => p.id === i.plantId)
    );
    if (queuedInEco.length > 0) {
      const firstItem = queuedInEco[0];
      const firstPlant = ecoregion.plants.find(p => p.id === firstItem.plantId);
      const estTimer   = engine.nativeEstablishTimer;
      const ESTABLISH_SECS = ESTABLISH_DAYS * DAY_REAL_SECS;
      const pct        = Math.min(100, Math.round(estTimer / ESTABLISH_SECS * 100));
      const remaining  = Math.max(0, (ESTABLISH_SECS - estTimer) / DAY_REAL_SECS);
      const activeCard = el('div', 'research-active-card garden-active-card');
      activeCard.innerHTML = `
        <div class="research-active-header">
          <span class="research-active-icon">${firstPlant?.icon ?? '🌱'}</span>
          <span class="research-active-name">Establishing ${firstPlant?.name ?? firstItem.plantId}…</span>
          <span class="research-active-time">${fmtDays(remaining)} remaining</span>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill garden-progress" style="width:${pct}%"></div>
        </div>
        <div class="research-active-footer">
          <span class="research-active-pct">${pct}% · ${queuedInEco.length} in queue</span>
        </div>
      `;
      content.appendChild(activeCard);
    }

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
        const isUnlocked = (plant.requiresResearch ?? []).every(rid => completedResearch.has(rid));

        // ── Locked card (research prerequisite not met) ───────────────────────────
        if (!isUnlocked) {
          if (hideLockedGarden) continue;
          const lockedReqs = (plant.requiresResearch ?? []).filter(rid => !completedResearch.has(rid));
          const reqNames   = lockedReqs.map(rid => researchById[rid]?.name ?? rid).join(', ');
          const lockedCard = el('div', 'garden-card garden-card-locked');
          lockedCard.innerHTML = `
            <div class="garden-card-head">
              <span class="garden-plant-icon">🔒</span>
              ${inatThumbHtml(plant.sci, 'garden-thumb', plant.name)}
              <div class="garden-plant-names">
                <span class="garden-plant-name">${plant.name}</span>
                <a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>
              </div>
              <div class="garden-badges">
                <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
                ${plant.insectsHosted?.length ? `<span class="garden-hosted-badge">${plant.insectsHosted.length} species hosted</span>` : ''}
              </div>
            </div>
            <p class="garden-locked-msg">🌱 Requires project: <strong>${reqNames}</strong></p>
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
          <div class="garden-plant-names">
            <span class="garden-plant-name">${plant.name}</span>
            <a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>
          </div>
          <div class="garden-badges">
            <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
            ${plant.insectsHosted?.length ? `<span class="garden-hosted-badge">${plant.insectsHosted.length} species hosted</span>` : ''}
            ${establishedAcres > 0 ? `<span class="garden-status-badge planted">✅ ${establishedAcres} acre${establishedAcres !== 1 ? 's' : ''}</span>` : ''}
            ${isActive && establishedAcres === 0 ? '<span class="garden-status-badge active">🌱 Establishing…</span>' : ''}
          </div>
          <button class="garden-collapse-btn" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '▶' : '▼'}</button>
        `;
        // Toggle on header click (but not on inat link clicks)
        cardHead.addEventListener('click', e => {
          if (e.target.closest('.inat-link')) return;
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
            const removeAcreBtn = el('button', 'action-btn danger', '−1 acre');
            removeAcreBtn.addEventListener('click', () => { engine.deallocateNativeAcre(plant.id, 1); renderAll(); });
            actionRow.appendChild(removeAcreBtn);
          }
          const addAcreBtn = el('button', `action-btn garden-plant-btn${canAddMore ? '' : ' disabled'}`,
            canAddMore ? `+1 acre (${freeAcresNative} free)` : 'No free acres');
          if (canAddMore) {
            addAcreBtn.addEventListener('click', () => {
              engine.queueNativeAcre(plant.id, 1);
              renderAll();
            });
          } else {
            addAcreBtn.disabled = true;
          }
          actionRow.appendChild(addAcreBtn);
        } else {
          // First planting — button deducts CP + queues 1 acre
          const canAfford  = pts >= plant.cost;
          const canPlant   = canAfford && freeAcresNative >= 1;
          const btn = el('button',
            `action-btn${canPlant ? ' garden-plant-btn' : ' disabled'}`,
            isActive ? `🌱 Establishing… ${fmtDays(Math.max(0, plant.duration - activePTimer))}`
            : canPlant ? `🌱 Establish — ${plant.cost} CP · ${fmtDays(ESTABLISH_DAYS)}`
            : !canAfford ? `🌱 Need ${plant.cost - pts} more CP`
            : 'No free acres — go to Land tab'
          );
          if (canPlant) {
            btn.addEventListener('click', () => {
              const result = engine.queueNativeAcre(plant.id, 1);
              if (result.ok) renderAll();
            });
          } else {
            btn.disabled = true;
          }
          actionRow.appendChild(btn);
          if (!canAfford && freeAcresNative < 1) {
            // Show both issues
          } else if (freeAcresNative < 1 && canAfford) {
            const goLandBtnG = el('button', 'action-btn', '🗺️ Buy land');
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
  const freeAcres     = engine.getFreeAcres();
  const market        = engine.landMarket;
  const nativeQ       = engine.nativeEstablishQueue;
  const nativeTimer   = engine.nativeEstablishTimer;
  const ESTABLISH_SECS = ESTABLISH_DAYS * DAY_REAL_SECS;

  // ── Summary banner ──────────────────────────────────────────────────────────
  const banner = el('div', 'land-banner');
  banner.innerHTML = `
    <div class="land-banner-row">
      <span class="land-stat"><span class="land-stat-num">${totalAcres}</span> Total Acres</span>
      <span class="land-stat"><span class="land-stat-num">${allocAcres}</span> Allocated</span>
      <span class="land-stat land-stat-free"><span class="land-stat-num">${freeAcres}</span> Free</span>
    </div>
    <div class="bio-bar-track land-bar-track">
      <div class="bio-bar-fill land-bar-fill" style="width:${totalAcres > 0 ? Math.round(allocAcres / totalAcres * 100) : 0}%"></div>
    </div>
  `;
  content.appendChild(banner);

  // ── Establish queues ────────────────────────────────────────────────────────
  if (nativeQ.length > 0) {
    const qSect = el('div', 'land-section');
    qSect.innerHTML = '<h2 class="land-section-header">⏳ Establishing</h2>';

    function queueBlock(queue, timer, typeLabel, getLabel) {
      if (queue.length === 0) return;
      const pct    = Math.min(100, Math.round((timer / ESTABLISH_SECS) * 100));
      const remain = Math.max(0, ESTABLISH_DAYS - timer / DAY_REAL_SECS);
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

    queueBlock(nativeQ, nativeTimer, '🌿 Native', i => {
      const r = engine.findPlant(i.plantId);
      return r ? r.plant.name : i.plantId;
    });

    content.appendChild(qSect);
  }

  // ── Land market ─────────────────────────────────────────────────────────────
  const marketSect = el('div', 'land-section');
  marketSect.innerHTML = '<h2 class="land-section-header">🏪 Land Market</h2>';
  if (market.length === 0) {
    const nextDrip = engine.nextMarketDripDay - engine.inGameDay;
    marketSect.innerHTML += `<p class="land-empty-note">No parcels available right now. Next parcel in ${nextDrip > 0 ? `~${fmtDays(nextDrip)}` : 'soon'}.</p>`;
  } else {
    for (const parcel of market) {
      const canAfford = engine.gold.amount >= parcel.cost;
      const card = el('div', 'land-market-card');
      card.innerHTML = `
        <div class="land-market-row">
          <span class="land-market-acres">🌲 ${parcel.acres} acre${parcel.acres !== 1 ? 's' : ''}</span>
          <span class="land-market-cost">🪙 ${shortNumber(parcel.cost)}</span>
          <button class="action-btn land-buy-btn${canAfford ? '' : ' disabled'}"
            ${canAfford ? '' : 'disabled'}>
            Buy
          </button>
        </div>
      `;
      card.querySelector('.land-buy-btn').addEventListener('click', () => {
        if (engine.buyLandParcel(parcel.id)) renderAll();
      });
      marketSect.appendChild(card);
    }
  }
  content.appendChild(marketSect);

  // ── Land grid (all allocated acres visualized) ──────────────────────────────
  const gridSect = el('div', 'land-section');
  gridSect.innerHTML = '<h2 class="land-section-header">🗺️ Your Land</h2>';
  const grid = el('div', 'land-grid');

  // Crop zone tiles
  for (const [zoneName, acres] of engine.zoneAcres) {
    const def = FARM_ZONE_DEFS.find(d => d.name === zoneName);
    if (!def) continue;
    const crop = CROPS[def.cropId];
    for (let i = 0; i < acres; i++) {
      const tile = el('div', 'land-tile land-tile-crop');
      tile.title = crop?.name ?? zoneName;
      tile.innerHTML = inatThumbHtml(crop?.sciName, 'land-tile-thumb', crop?.name ?? zoneName);
      grid.appendChild(tile);
    }
  }
  // Ranch animal tiles
  if (ENABLE_RANCH) {
    for (const [animalId, acres] of engine.ranchAcres) {
      const animal = RANCH_ANIMALS[animalId];
      for (let i = 0; i < acres; i++) {
        const tile = el('div', 'land-tile land-tile-ranch');
        tile.title = animal?.name ?? animalId;
        tile.innerHTML = inatThumbHtml(animal?.sci, 'land-tile-thumb', animal?.name ?? animalId);
        grid.appendChild(tile);
      }
    }
  }
  // Native plant tiles
  for (const [plantId, acres] of engine.plantedSpeciesAcres) {
    const result = engine.findPlant(plantId);
    const plant  = result?.plant;
    for (let i = 0; i < acres; i++) {
      const tile = el('div', 'land-tile land-tile-native');
      tile.title = plant?.name ?? plantId;
      tile.innerHTML = inatThumbHtml(plant?.sci, 'land-tile-thumb', plant?.name ?? plantId);
      grid.appendChild(tile);
    }
  }
  // Queued native tiles
  for (const { plantId } of nativeQ) {
    const result = engine.findPlant(plantId);
    const tile = el('div', 'land-tile land-tile-native land-tile-establishing');
    tile.title = `${result?.plant?.name ?? plantId} (establishing…)`;
    tile.innerHTML = `<span class="land-tile-icon">⏳</span>`;
    grid.appendChild(tile);
  }
  // Free acres
  for (let i = 0; i < freeAcres; i++) {
    const tile = el('div', 'land-tile land-tile-free');
    tile.title = 'Free acre';
    tile.innerHTML = `<span class="land-tile-icon">＋</span>`;
    grid.appendChild(tile);
  }

  gridSect.appendChild(grid);
  content.appendChild(gridSect);
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
  const totalCreatures  = creatureMap.size;
  const discoveredCount = [...discovered].filter(k => creatureMap.has(k)).length;
  const unlockedCrops        = Object.values(CROPS).filter(ct => ct.isUnlocked(engine.cropStats));
  const unlockedRanchAnimals = engine.unlockedRanchAnimals;

  // ── Biosphere banner ────────────────────────────────────────────────────────
  const researchBio      = engine.getBiosphereScore();
  const gardenBio        = engine.getGardenBiosphereScore();
  const creatureBio      = engine.getCreatureBiosphereScore();
  const maxResearchBio   = RESEARCH.reduce((s, r) => s + (r.effect?.biosphereBonus ?? 0), 0);
  const maxGardenBio     = ALL_PLANTS.reduce((s, p) => s + (p.biosphereBonus ?? 0), 0);
  const birdBio          = engine.discoveredBirds.size;
  const totalBio         = researchBio + gardenBio + creatureBio + birdBio;
  const maxTotal         = maxResearchBio + maxGardenBio + totalCreatures + BIRD_LIST.length;
  const goldMult         = engine.getGoldMultiplier();
  const bioPct           = maxTotal > 0 ? Math.round(totalBio / maxTotal * 100) : 0;
  const completedResearchCount = engine.completedResearch.size;
  const totalResearchCount     = RESEARCH.length;
  const plantedCount           = planted.size;
  const totalPlantCount        = ALL_PLANTS.length;

  const banner = el('div', 'research-banner');
  banner.innerHTML = `
    <div class="research-banner-row">
      <span class="bio-label">🌍 Biosphere Score</span>
      <span class="bio-score">${totalBio} <span class="bio-max">/ ${maxTotal}</span></span>
    </div>
    <div class="bio-bar-track"><div class="bio-bar-fill" style="width:${bioPct}%"></div></div>
    <div class="bio-breakdown">
      <span>🌱 Conservation: <strong>${completedResearchCount}</strong> / ${totalResearchCount}</span>
      <span>🌿 Plants: <strong>${plantedCount}</strong> / ${totalPlantCount}</span>
      <span>🦋 Creatures: <strong>${discoveredCount}</strong> / ${totalCreatures}</span>
      <span>🐦 Birds: <strong>${engine.discoveredBirds.size}</strong> / ${BIRD_LIST.length}</span>
      <span>💰 Gold Bonus: <strong>${goldMult.toFixed(2)}×</strong></span>
    </div>
  `;
  content.appendChild(banner);

  const showCrops     = collectionFilter === 'all' || collectionFilter === 'crops';
  const showPlants    = collectionFilter === 'all' || collectionFilter === 'plants';
  const showCreatures = collectionFilter === 'all' || collectionFilter === 'creatures';
  const showRanch     = ENABLE_RANCH && (collectionFilter === 'all' || collectionFilter === 'ranch');
  const showHistory   = collectionFilter === 'history';
  const showBirds     = collectionFilter === 'all' || collectionFilter === 'birds';

  // ── Filter bar ──────────────────────────────────────────────────────────────
  const filterBar = el('div', 'collection-filter-bar');
  const filterDefs = [
    { key: 'all',       label: 'All'                                                                              },
    { key: 'crops',     label: `🌾 Crops (${unlockedCrops.length} / ${Object.keys(CROPS).length})`              },
    { key: 'plants',    label: `🌿 Native Plants (${planted.size} / ${totalPlantCount})`                         },
    { key: 'creatures', label: `🦋 Creatures (${discoveredCount} / ${totalCreatures})`                           },
    { key: 'birds',     label: `🐦 Birds (${engine.discoveredBirds.size} / ${BIRD_LIST.length})`                 },
    ...(ENABLE_RANCH ? [{ key: 'ranch', label: `🐄 Ranch Animals (${unlockedRanchAnimals.size} / ${RANCH_ANIMAL_LIST.length})` }] : []),
    { key: 'history',   label: `📊 History (${discoveredCount} / ${totalCreatures})` },
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

  content.appendChild(filterBar);

  // ── Crops ───────────────────────────────────────────────────────────────────
  if (showCrops) {
    content.appendChild(el('h2', 'section-header', `🌾 Crops — ${unlockedCrops.length} of ${Object.keys(CROPS).length} unlocked`));
    if (unlockedCrops.length === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Sell crops in the 🌾 Crops tab to unlock new varieties. —'));
    }
    for (const ct of unlockedCrops) {
      const stats = engine.cropStats.get(ct.id) ?? { grown: 0, sold: 0, lifetimeSales: 0 };
      const card = el('div', 'collection-crop-card');
      card.dataset.collectionid = ct.id;
      const cardHead = el('div', 'collection-crop-head');
      const seasonHtml = ct.seasons.map(s => {
        const sObj = SEASONS.find(x => x.name === s);
        return `<span class="zone-season-badge active">${sObj?.emoji ?? ''} ${s}</span>`;
      }).join('');
      cardHead.innerHTML = `
        ${ct.sciName ? inatThumbHtml(ct.sciName, 'collection-crop-thumb', ct.name) : ''}
        <div class="collection-crop-names">
          <span class="collection-plant-name">${ct.name}</span>
          ${ct.sciName ? `<a class="garden-plant-sci inat-link" href="${inatUrl(ct.sciName)}" target="_blank" rel="noopener noreferrer">${ct.sciName} ↗</a>` : ''}
          <div class="collection-crop-seasons">${seasonHtml}</div>
        </div>
        <div class="collection-crop-stats">
          <span class="collection-crop-stat">🌾 Harvested: <strong>${shortNumber(stats.grown)}</strong></span>
          <span class="collection-crop-stat">💰 Sold: <strong>${shortNumber(stats.sold)}</strong></span>
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
      content.appendChild(card);
    }
  }

  // ── Ranch Animals ──────────────────────────────────────────────────────────
  if (showRanch) {
    content.appendChild(el('h2', 'section-header', `🐄 Ranch Animals — ${unlockedRanchAnimals.size} of ${RANCH_ANIMAL_LIST.length} unlocked`));
    if (unlockedRanchAnimals.size === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Sell crops in the 🌾 Crops tab to unlock ranch animals. —'));
    }
    for (const animal of RANCH_ANIMAL_LIST) {
      if (!unlockedRanchAnimals.has(animal.id)) continue;
      const stats = engine.ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
      const card = el('div', 'collection-crop-card');
      card.dataset.collectionid = animal.id;
      const cardHead = el('div', 'collection-crop-head');
      cardHead.innerHTML = `
        ${animal.sci ? inatThumbHtml(animal.sci, 'collection-crop-thumb', animal.name) : `<span style="font-size:48px;flex-shrink:0">${animal.icon}</span>`}
        <div class="collection-crop-names">
          <span class="collection-plant-name">${animal.name}</span>
          ${animal.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(animal.sci)}" target="_blank" rel="noopener noreferrer">${animal.sci} ↗</a>` : ''}
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
            <a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>
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
        content.appendChild(card);
      }
    }
  }

  // ── Discovered creatures index ──────────────────────────────────────────────
  if (showCreatures) {
    if (discoveredCount > 0) {
      content.appendChild(el('h2', 'section-header', `🦋 Observed Creatures — ${discoveredCount} of ${totalCreatures}`));

      const byType = new Map();
      for (const ckey of discovered) {
        const entry = creatureMap.get(ckey);
        if (!entry) continue;
        const { creature } = entry;
        if (!byType.has(creature.type)) byType.set(creature.type, []);
        byType.get(creature.type).push({ ckey, ...entry });
      }

      const typeOrder = ['butterfly', 'moth', 'bee', 'wasp', 'fly', 'beetle', 'bird', 'mammal'];
      for (const type of typeOrder) {
        if (!byType.has(type)) continue;
        const entries  = byType.get(type);
        const typeInfo = CREATURE_TYPE_META[type] ?? { label: type, icon: '🐞', plural: type };

        content.appendChild(el('h3', 'collection-type-header', `${typeInfo.icon} ${typeInfo.plural} (${entries.length})`));

        const grid = el('div', 'collection-creature-grid');
        for (const { creature, hostPlants } of entries) {
          const hostNames = hostPlants.map(h => h.plant.name).join(', ');
          const ccard = el('div', 'collection-creature-card');
          ccard.innerHTML = `
            ${creature.sci ? inatThumbHtml(creature.sci, 'collection-creature-card-thumb', creature.name) : `<span class="collection-creature-card-thumb-icon">${typeInfo.icon}</span>`}
            <div class="collection-creature-card-body">
              <div class="collection-creature-head">
                <span class="collection-creature-name">${creature.name}</span>
                <span class="collection-creature-type-badge type-${type}">${typeInfo.icon}</span>
              </div>
              ${creature.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(creature.sci)}" target="_blank" rel="noopener noreferrer">${creature.sci} ↗</a>` : ''}
              <span class="collection-host-label">Host: <strong>${hostNames}</strong></span>
              <span class="collection-creature-role">${creature.role}</span>
              <p class="collection-creature-note">${creature.note}</p>
              <span class="collection-creature-bp">+1 🌍 BP</span>
            </div>
          `;
          grid.appendChild(ccard);
        }
        content.appendChild(grid);
      }
    } else {
      content.appendChild(el('h2', 'section-header', '🦋 Observed Creatures — none yet'));
      content.appendChild(el('p', 'research-idle-note', '— Establish native plants to attract insects and wildlife. —'));
    }
  }

  // ── Attracted birds ─────────────────────────────────────────────────────────
  if (showBirds) {
    const attractedBirds = engine.discoveredBirds;
    const birdMetrics    = engine.getBirdMetrics();
    content.appendChild(el('h2', 'section-header', `🐦 Birds Attracted — ${attractedBirds.size} of ${BIRD_LIST.length}`));
    if (attractedBirds.size === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Build insect diversity and establish fruiting native plants to attract native bird visitors. —'));
    }
    const birdGrid = el('div', 'collection-creature-grid');
    for (const bird of BIRD_LIST) {
      const isAttracted = attractedBirds.has(bird.id);
      const card = el('div', `collection-creature-card${isAttracted ? '' : ' collection-bird-locked'}`);
      if (isAttracted) {
        card.innerHTML = `
          ${inatThumbHtml(bird.sci, 'collection-creature-card-thumb', bird.name)}
          <div class="collection-creature-card-body">
            <div class="collection-creature-head">
              <span class="collection-creature-name">${bird.name}</span>
              <span class="collection-creature-type-badge type-bird">🐦</span>
            </div>
            <a class="garden-plant-sci inat-link" href="${inatUrl(bird.sci)}" target="_blank" rel="noopener noreferrer">${bird.sci} ↗</a>
            <span class="collection-creature-role">${bird.role}</span>
            <p class="collection-creature-note">${bird.note}</p>
            <div class="collection-host-label">Attracted by: <strong>${bird.attractedBy}</strong></div>
            <span class="collection-creature-bp">+1 🌍 BP</span>
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

  // ── Discovery history ──────────────────────────────────────────────
  if (showHistory) {

    content.appendChild(el('h2', 'section-header', `📊 Discovery Log — ${discoveredCount} creature${discoveredCount !== 1 ? 's' : ''} observed`));

    if (discoveredCount === 0) {
      content.appendChild(el('p', 'research-idle-note', '— No discoveries yet. Establish native plants in the 🌿 Garden tab to begin. —'));
    } else {
      // Build sorted entries: ascending by discovery day
      const discoveryLog = engine.creatureDiscoveryLog;
      const historyEntries = [];
      for (const ckey of discovered) {
        const entry = creatureMap.get(ckey);
        if (!entry) continue;
        historyEntries.push({ ckey, ...entry, day: discoveryLog.get(ckey) ?? 0 });
      }
      historyEntries.sort((a, b) => a.day - b.day);

      const historyList = el('ol', 'discovery-history-list');
      historyEntries.forEach(({ creature, hostPlants, day }, idx) => {
        const typeInfo = CREATURE_TYPE_META[creature.type] ?? { label: creature.type, icon: '🐞' };
        const hostNames = hostPlants.map(h => h.plant.name).join(', ');
        const cal = day > 0 ? calendarDate(day) : null;
        const dateStr = cal ? `${cal.month.abbr} ${cal.day}, Year ${cal.year}` : 'Year 1 (legacy)';
        const row = el('li', 'discovery-history-row');
        row.innerHTML = `
          <span class="dh-num">${idx + 1}</span>
          <span class="dh-icon">${typeInfo.icon}</span>
          <div class="dh-details">
            <span class="dh-name">${creature.name}</span>
            ${creature.sci ? `<span class="dh-sci">${creature.sci}</span>` : ''}
            <span class="dh-host">Host: ${hostNames}</span>
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
const LOADOUT_SAVE_KEY = 'idle-ecologist-loadouts-v1';
const LOADOUT_SLOTS = ['a', 'b', 'c'];
const SEASONS_LIST = ['Spring', 'Summer', 'Fall', 'Winter'];

function _getLoadoutKey(season, slot) {
  return `${season}:${slot}`;
}

function saveLoadout(season, slot) {
  const loadout = {};
  for (const def of FARM_ZONE_DEFS) {
    const acres = engine.zoneAcres.get(def.name) ?? 0;
    if (acres > 0) {
      loadout[def.name] = acres;
    }
  }

  const allLoadouts = JSON.parse(localStorage.getItem(LOADOUT_SAVE_KEY) || '{}');
  const key = _getLoadoutKey(season, slot);
  allLoadouts[key] = loadout;
  try {
    localStorage.setItem(LOADOUT_SAVE_KEY, JSON.stringify(allLoadouts));
    return true;
  } catch {
    console.warn('Failed to save loadout');
    return false;
  }
}

function getLoadout(season, slot) {
  const allLoadouts = JSON.parse(localStorage.getItem(LOADOUT_SAVE_KEY) || '{}');
  const key = _getLoadoutKey(season, slot);
  return allLoadouts[key] || null;
}

function isLoadoutEmpty(season, slot) {
  const loadout = getLoadout(season, slot);
  return !loadout || Object.keys(loadout).length === 0;
}

function loadLoadout(season, slot) {
  const loadout = getLoadout(season, slot);
  if (!loadout) return false;

  // Calculate total acres needed
  let totalNeeded = 0;
  for (const def of FARM_ZONE_DEFS) {
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
  for (const def of FARM_ZONE_DEFS) {
    const acres = engine.zoneAcres.get(def.name) ?? 0;
    if (acres > 0) {
      const cropType = CROPS[def.cropId];
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
  for (const def of FARM_ZONE_DEFS) {
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
  saveBtn.addEventListener('click', () => { engine.save(); saveBtn.textContent = '✅ Saved!'; setTimeout(() => { saveBtn.textContent = '💾 Save Now'; }, 1500); });
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      _resetting = true;
      engine.clearSave();
      location.reload();
    }
  });
  const btnRow = el('div', 'btn-row');
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(resetBtn);
  saveSection.appendChild(btnRow);
  content.appendChild(saveSection);

  // Crop Loadouts
  const loadoutSection = el('div', 'settings-section');
  loadoutSection.appendChild(el('div', 'settings-label', '🌾 Seasonal Crop Loadouts'));
  loadoutSection.appendChild(el('p', 'settings-desc', 'Save your current crop setup as a loadout for this season. When the season returns, load it back to restore your layout. Each season has 3 slots (A, B, C). Native plants are never removed.'));

  const currentSeason = engine.currentSeasonName;

  LOADOUT_SLOTS.forEach(slot => {
    const slotRow = el('div', 'loadout-slot-row');
    const isEmpty = isLoadoutEmpty(currentSeason, slot);

    const slotLabel = el('span', 'loadout-slot-label', `${currentSeason} slot ${slot.toUpperCase()}: ${isEmpty ? '(empty)' : '✓ saved'}`);
    slotRow.appendChild(slotLabel);

    const btnContainer = el('div', 'loadout-btn-group');

    const saveBtn = el('button', 'action-btn loadout-save-btn', `Save ${slot.toUpperCase()}`);
    saveBtn.addEventListener('click', () => {
      const success = saveLoadout(currentSeason, slot);
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
        const success = loadLoadout(currentSeason, slot);
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
function showOfflineToast(result, realSecs) {
  const fmt = s => s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
                 : s >= 60   ? `${Math.floor(s/60)}m ${s%60}s`
                 : `${s}s`;

  const cap       = result.capped ? ' (capped at 2h)' : '';
  const daysLine  = result.daysAdvanced > 0
    ? `<div style="color:#aaa;font-size:12px;margin-top:2px">⏩ ${result.daysAdvanced} in-game day${result.daysAdvanced !== 1 ? 's' : ''} simulated</div>`
    : '';
  const seasonLine = result.pausedAtSeasonEve
    ? `<div class="offline-season-eve">⏸ Stopping at the eve of ${result.nextSeasonEmoji} ${result.nextSeason} — review your farm, then resume when ready.</div>`
    : `<div class="offline-season-eve" style="color:#aaa">Game paused. Press Resume when ready to continue.</div>`;

  const toast = el('div', 'offline-toast');
  toast.innerHTML = `
    <div class="offline-title">Welcome back!</div>
    <div>Away for ${fmt(Math.floor(realSecs))}${cap}</div>
    <div style="color:#ffd700;margin-top:6px">🪙 +${shortNumber(result.goldEarned)} earned</div>
    ${daysLine}
    ${seasonLine}
    <div class="offline-toast-btns">
      <button class="offline-resume">▶ Resume</button>
      <button class="offline-close">Stay paused</button>
    </div>
  `;
  toast.querySelector('.offline-resume').addEventListener('click', () => {
    engine.setPaused(false);
    renderAll();
    toast.remove();
  });
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
let collectionFilter = 'all'; // 'all' | 'crops' | 'plants' | 'creatures' | 'birds' | 'history'
let collectionCreaturesCollapsed = new Set(); // plant IDs whose creature list is collapsed
let collectionAllCollapsed = false;

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
        const cropType = CROPS[n.cropId];
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

const notifWrap  = document.getElementById('notif-wrap');
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

engine.onSeasonChange = (oldSeason, newSeason) => {
  // Auto-load slot A for the new season if it exists
  if (!isLoadoutEmpty(newSeason, 'a')) {
    loadLoadout(newSeason, 'a');
  }
};

function _pushBirdNotif(birdId) {
  const bird = BIRDS[birdId];
  if (!bird) return;
  _pushNotif({ type: 'bird_attracted', birdId, bird });
}

engine.onBirdAttracted = birdId => _pushBirdNotif(birdId);

_loadNotifs();
updateNotifBadge();

let _notifTab = 'unread'; // 'unread' | 'read'

function updateNotifBadge() {
  const unread = _notifLog.filter(n => !n.read).length;
  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn) notifBtn.classList.toggle('has-unread', unread > 0);
  const badge = document.getElementById('notif-badge');
  if (badge) badge.textContent = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '';
}

function _buildNotifList() {
  // Sync tab button states
  const tabUnreadBtn = document.getElementById('notif-tab-unread');
  const tabReadBtn   = document.getElementById('notif-tab-read');
  if (tabUnreadBtn) tabUnreadBtn.classList.toggle('active', _notifTab === 'unread');
  if (tabReadBtn)   tabReadBtn.classList.toggle('active',   _notifTab === 'read');
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
        + (creature.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(creature.sci)}" target="_blank" rel="noopener noreferrer">${creature.sci} ↗</a>` : '');
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
      const cropStatsRow = engine.cropStats.get(cropType.id) ?? { grown: 0, sold: 0, lifetimeSales: 0 };
      const seasonText = (cropType.seasons ?? []).map(s => {
        const sObj = SEASONS.find(x => x.name === s);
        return `${sObj?.emoji ?? ''} ${s}`.trim();
      }).join(' · ');
      const thumbSrc = STATIC_INAT_PHOTOS[cropType.sciName] || inatPhotoCache[cropType.sciName] || BLANK_GIF;
      thumbHtml = cropType.sciName
        ? `<img class="inat-thumb notif-thumb" data-sci="${cropType.sciName}" src="${thumbSrc}" alt="${cropType.name}">`
        : `<span class="notif-type-icon">🌾</span>`;
      badgeClass = 'notif-badge-crop';
      badgeLabel = '🌾 Crop Unlocked';
      nameHtml = `<div class="notif-entry-name">${cropType.name}</div>`
        + (cropType.sciName ? `<a class="garden-plant-sci inat-link" href="${inatUrl(cropType.sciName)}" target="_blank" rel="noopener noreferrer">${cropType.sciName} ↗</a>` : '');
      const _cropDescCached = cropType.sciName ? (inatDescCache[cropType.sciName] ?? null) : null;
      subHtml = `
        <div class="notif-entry-host">Now available in 🌾 Crops</div>
        ${seasonText ? `<div class="notif-entry-host">Seasons: <strong>${seasonText}</strong></div>` : ''}
        <div class="notif-entry-host">🌾 Harvested: <strong>${shortNumber(cropStatsRow.grown)}</strong> · 💰 Sold: <strong>${shortNumber(cropStatsRow.sold)}</strong> · 🪙 Earned: <strong>${shortNumber(cropStatsRow.lifetimeSales)}g</strong></div>
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
        + (animal.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(animal.sci)}" target="_blank" rel="noopener noreferrer">${animal.sci} ↗</a>` : '');
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
        + `<a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>`;
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
        + `<a class="garden-plant-sci inat-link" href="${inatUrl(bird.sci)}" target="_blank" rel="noopener noreferrer">${bird.sci} ↗</a>`;
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
      <div class="notif-entry-actions">
        ${gotoHandler ? `<button class="notif-icon-btn notif-goto" title="View" aria-label="View">ℹ️</button>` : ''}
        <button class="notif-icon-btn notif-dismiss" aria-label="Dismiss">×</button>
      </div>
    `;
    entry.querySelector('.notif-dismiss').addEventListener('click', () => {
      if (_notifTab === 'unread') {
        notif.read = true;
      } else {
        const idx = _notifLog.findIndex(n => n.id === notif.id);
        if (idx >= 0) _notifLog.splice(idx, 1);
      }
      _saveNotifs();
      updateNotifBadge();
      _buildNotifList();
    });
    if (gotoHandler) entry.querySelector('.notif-goto')?.addEventListener('click', gotoHandler);
    notifList.appendChild(entry);
  }
  loadInatDescs(notifList);
}

function openNotifModal() {
  if (_notifLog.some(n => !n.read)) _notifTab = 'unread';
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
  const farmParts = FARM_ZONE_DEFS
    .filter(d => engine.unlockedFarmZones.has(d.name))
    .map(d => `${d.name}:${engine.zoneAcres.get(d.name) ?? 1}:${engine.zoneWorkers.get(d.name) ?? 1}`).join(',');
  // Sample sold/gold (bucketed) so locked-card criteria bars re-render as progress advances
  const totalSold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);
  return `f${engine.unlockedFarmZones.size}|${farmParts}|s${Math.floor(totalSold / 10)}|g${Math.floor(lifetimeGold / 10000)}|season:${engine.currentSeasonName}`;
}

function ranchFingerprint() {
  const ranchParts = RANCH_ANIMAL_LIST
    .filter(animal => engine.unlockedRanchAnimals.has(animal.id))
    .map(animal => {
      const stats = engine.ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
      return `${animal.id}:${engine.ranchAcres.get(animal.id) ?? 0}:${engine.ranchWorkers.get(animal.id) ?? 1}:${Math.floor(stats.produced / 10)}:${Math.floor(stats.lifetimeSales / 1000)}`;
    }).join(',');
  return `u${engine.unlockedRanchAnimals.size}|f${engine.getFreeAcres()}|${ranchParts}|q:${cropBuyQty}`;
}

function updateRanchButtonStates() {
  content.querySelectorAll('.acre-btn[data-ranch-animal-id]').forEach(btn => {
    const freeAcres = engine.getFreeAcres();
    const qtyRanchAcre = cropBuyQty === 'max' ? freeAcres : Math.min(cropBuyQty, freeAcres);
    const canAllocate = freeAcres >= 1;
    btn.disabled = !canAllocate;
    btn.classList.toggle('disabled', !canAllocate);
    btn.textContent = canAllocate
      ? qtyRanchAcre > 1
        ? `+${qtyRanchAcre} acres (${freeAcres} free)`
        : `+1 acre (${freeAcres} free)`
      : 'No free acres';
  });

  content.querySelectorAll('.worker-btn[data-ranch-animal-id-w]').forEach(btn => {
    const animalId = btn.dataset.ranchAnimalIdW;
    const animal = RANCH_ANIMALS[animalId];
    if (!animal) return;
    const workers = engine.ranchWorkers.get(animalId) ?? 1;
    const workerCostFn = n => workerUpgradeCost({ cost: animal.baseCost }, n);
    const qtyWorker = cropBuyQty === 'max'
      ? maxAffordableCount(workerCostFn, workers, engine.gold.amount)
      : cropBuyQty;
    const workerTotalCost = qtyWorker > 0 ? bulkCost(workerCostFn, workers, qtyWorker) : 0;
    const canAfford = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;
    btn.disabled = !canAfford;
    btn.classList.toggle('disabled', !canAfford);
    btn.textContent = qtyWorker > 0
      ? `+${qtyWorker} worker${qtyWorker !== 1 ? 's' : ''} — 🪙 ${shortNumber(workerTotalCost)}`
      : '+workers — can\'t afford';
  });

  content.querySelectorAll('button[data-ranch-buy-land]').forEach(btn => {
    btn.hidden = engine.getFreeAcres() >= 1;
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
    _knownUnlockedCrops = new Set(Object.keys(CROPS).filter(id => CROPS[id].isUnlocked(engine.cropStats)));
  } else {
    for (const [id, ct] of Object.entries(CROPS)) {
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
      // Patch upgrade button disabled states as gold changes
      content.querySelectorAll('.acre-btn[data-zone-name]').forEach(btn => {
        const def = FARM_ZONE_DEFS.find(d => d.name === btn.dataset.zoneName);
        if (!def) return;
        const cur = engine.zoneAcres.get(def.name) ?? 1;
        btn.disabled = engine.gold.amount < acreUpgradeCost(def, cur);
      });
      content.querySelectorAll('.worker-btn[data-zone-name-w]').forEach(btn => {
        const def = FARM_ZONE_DEFS.find(d => d.name === btn.dataset.zoneNameW);
        if (!def) return;
        const cur = engine.zoneWorkers.get(def.name) ?? 1;
        const workerCostFn = n => workerUpgradeCost(def, n);
        const qtyWorker = cropBuyQty === 'max'
          ? maxAffordableCount(workerCostFn, cur, engine.gold.amount)
          : cropBuyQty;
        const workerTotalCost = qtyWorker > 0 ? bulkCost(workerCostFn, cur, qtyWorker) : 0;
        const canAfford = qtyWorker > 0 && engine.gold.amount >= workerTotalCost;
        btn.disabled = !canAfford;
        btn.classList.toggle('disabled', !canAfford);
      });
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
    const rfp = `${engine.completedResearch.size}|${engine.activeResearchId}|${Math.floor(engine.researchPoints)}`;
    if (rfp !== lastResearchFingerprint) {
      lastResearchFingerprint = rfp;
      renderAll();
    } else if (engine.activeResearchId) {
      // In-place: update progress bar and time remaining
      const project = RESEARCH.find(r => r.id === engine.activeResearchId);
      if (project) {
        const pct       = Math.min(100, Math.round(engine.activeResearchTimer / project.duration * 100));
        const remaining = Math.max(0, project.duration - engine.activeResearchTimer);
        const fill    = content.querySelector('.research-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
        const timeEl  = content.querySelector('.research-active-time');
        if (timeEl) timeEl.textContent = `${fmtDays(remaining)} remaining`;
        const pctEl   = content.querySelector('.research-active-pct');
        if (pctEl) pctEl.textContent = `${pct}% complete`;
      }
    }
  } else if (activeTab === 'garden') {
    // Re-render fully when planted set or active plant changes
    const gfp = `${engine.plantedSpecies.size}|${engine.activePlantingId}`;
    if (gfp !== lastGardenFingerprint) {
      lastGardenFingerprint = gfp;
      renderAll();
    } else if (engine.activePlantingId) {
      // In-place: update planting progress bar and time remaining
      let plantDuration = null;
      for (const region of ECOREGIONS) {
        const p = region.plants.find(pl => pl.id === engine.activePlantingId);
        if (p) { plantDuration = p.duration; break; }
      }
      if (plantDuration) {
        const pct       = Math.min(100, Math.round(engine.activePlantingTimer / plantDuration * 100));
        const remaining = Math.max(0, plantDuration - engine.activePlantingTimer);
        const fill    = content.querySelector('.garden-progress');
        if (fill) fill.style.width = `${pct}%`;
        const timeEl  = content.querySelector('.research-active-time');
        if (timeEl) timeEl.textContent = `${fmtDays(remaining)} remaining`;
        const pctEl   = content.querySelector('.research-active-pct');
        if (pctEl) pctEl.textContent = `${pct}% established`;
      }
    }
  }
}

function updateZoneProgressBars() {
  content.querySelectorAll('.zone-card:not(.locked)').forEach((card, i) => {
    const bar   = card.querySelector('.progress-bar');
    const pctEl = card.querySelector('.progress-pct');
    if (!bar || !pctEl) return;

    if (activeTab === 'crops') {
      const zoneDef  = FARM_ZONE_DEFS.find(d => d.name === card.dataset.zone);
      if (!zoneDef) return;
      const instance = engine.zoneCrops.get(zoneDef.name);
      if (!instance)  return;
      if (!instance.cropType.isInSeason(engine.currentSeasonName)) return; // dormant — static
      const prog = instance.overallProgress;
      const ct2      = instance.cropType;
      const wm2      = workerMultiplier(engine.zoneWorkers.get(zoneDef.name) ?? 1);
      const remGame  = instance.isFullyGrown ? 0
        : ((ct2.totalPhases - instance.phase) * ct2.growthTimePerPhase - instance.timer);
      const nearHarvest = !instance.isFullyGrown && (remGame / (engine.gameSpeed * wm2 * 4)) <= 5;
      if (nearHarvest) {
        // Snap to 100% and freeze
        if (!bar.classList.contains('near-harvest')) {
          bar.style.transition = 'none';
          bar.style.width = '100%';
        }
      } else {
        bar.style.width = `${(prog * 100).toFixed(3)}%`;
      }
      bar.className = 'progress-bar ' + (instance.isFullyGrown ? 'ready' : nearHarvest ? 'near-harvest' : 'growing');
      const wrap = bar.parentElement;
      if (wrap) wrap.classList.toggle('near-harvest', nearHarvest);
      pctEl.textContent = instance.isFullyGrown ? 'Ready!' : nearHarvest ? 'Actively growing' : `${Math.round(prog * 100)}%`;
      // Update phase tick and label classes
      const _phase2 = instance.phase;
      const _grown2 = instance.isFullyGrown;
      card.querySelectorAll('.phase-tick').forEach((_tick2, _ti2) => {
        const _passed2 = _grown2 || _phase2 > _ti2;
        _tick2.className = 'phase-tick' + (nearHarvest ? ' near-harvest' : _passed2 ? ' passed' : '');
      });
      card.querySelectorAll('.phase-label').forEach((_lbl2, _li2) => {
        const _isCur2  = !_grown2 && _li2 === _phase2;
        const _isPast2 = _grown2 || _li2 < _phase2;
        _lbl2.className = 'phase-label' + (nearHarvest ? ' near-harvest' : _isCur2 ? ' active' : _isPast2 ? ' passed' : '');
      });
      const _phaseEl = card.querySelector('.phase-row');
      if (_phaseEl) {
        _phaseEl.textContent = _grown2
          ? '\u2705 Ready to harvest'
          : nearHarvest ? 'Actively growing'
          : instance.cropType.growthPhaseNames?.[_phase2] ?? `Growing \u2014 stage ${_phase2 + 1} of ${instance.cropType.totalPhases}`;
      }
      const _compactEl = card.querySelector('.phase-status-compact');
      if (_compactEl) {
        const _phaseName = instance.cropType.growthPhaseNames?.[_phase2] ?? `Stage ${_phase2 + 1}`;
        _compactEl.textContent = _grown2
          ? '\u2705 Ready to harvest'
          : nearHarvest ? 'Actively growing'
          : `\u25b6 ${_phaseName} (${_phase2 + 1} / ${instance.cropType.totalPhases})`;
      }
    }
  });
}

// Initial render + live update every 250ms (matches tick rate)
renderAll();
setInterval(liveUpdate, 250);

if (localStorage.getItem(TUTORIAL_SEEN_KEY) !== 'true') {
  setTimeout(() => startTutorial(), 350);
}

