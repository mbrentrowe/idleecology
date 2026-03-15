// main.js — UI layer and entry point for Idle Ecologist Text UI
import { createEngine, shortNumber, FARM_ZONE_DEFS, ARTISAN_ZONE_DEFS, DAY_REAL_SECS } from './game.js';
import { CROPS } from './crops.js';

// ── Crop emoji map ────────────────────────────────────────────────────────────
const CROP_EMOJI = {
  strawberry:  '🍓', greenOnion: '🌿', potato:     '🥔', onion:      '🧅',
  carrot:      '🥕', blueberry:  '🫐', parsnip:    '🟤', lettuce:    '🥬',
  cauliflower: '🥦', rice:       '🍚', broccoli:   '🌾', asparagus:  '🌱',
};

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
    }
  }
}

setInterval(() => engine.tick(), 250);
setInterval(() => engine.save(), 10000);

// ── Tab state ─────────────────────────────────────────────────────────────────
const TABS = ['zones', 'market', 'stats', 'schedule', 'settings'];
let activeTab = 'zones';

// ── UI Construction ───────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Header
const header = document.getElementById('header');
const goldEl = el('span', 'gold-amount');
const gpsEl  = el('span', 'gps');
const dayEl  = el('span', 'day-counter');
const actEl  = el('span', 'activity-badge');
[goldEl, gpsEl, dayEl, actEl].forEach(e => header.appendChild(e));

// Tabs
const tabBar = document.getElementById('tab-bar');
TABS.forEach(tab => {
  const btn = el('button', 'tab-btn', tab.charAt(0).toUpperCase() + tab.slice(1));
  btn.dataset.tab = tab;
  btn.addEventListener('click', () => { activeTab = tab; renderAll(); });
  tabBar.appendChild(btn);
});

const content = document.getElementById('content');

// ── Render dispatcher ─────────────────────────────────────────────────────────
function renderAll() {
  // Tab button active state
  tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  content.innerHTML = '';
  switch (activeTab) {
    case 'zones':    renderZones();    break;
    case 'market':   renderMarket();   break;
    case 'stats':    renderStats();    break;
    case 'schedule': renderSchedule(); break;
    case 'settings': renderSettings(); break;
  }
}

// ── Header update ─────────────────────────────────────────────────────────────
function updateHeader() {
  goldEl.textContent = `🪙 ${shortNumber(engine.gold.amount)}`;
  gpsEl.textContent  = `+${shortNumber(engine.getTotalGPS() * engine.gameSpeed)}/s`;
  dayEl.textContent  = `Day ${engine.inGameDay}`;
  const act = engine.isFarmingTime()     ? '🌾 Farming'
            : engine.isSocializingTime() ? '💬 Socializing'
            : '😴 Sleeping';
  actEl.textContent = act;
}

// ── ZONES TAB ─────────────────────────────────────────────────────────────────
function renderZones() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);

  // ── Farm Zones ──
  const farmHeader = el('h2', 'section-header', '🌾 Farm Zones');
  content.appendChild(farmHeader);

  FARM_ZONE_DEFS.forEach(def => {
    const unlocked = engine.unlockedFarmZones.has(def.name);
    const card = el('div', `zone-card${unlocked ? '' : ' locked'}`);

    if (!unlocked) {
      const costSpan = el('div', 'lock-row');
      costSpan.innerHTML = `<span class="lock-icon">🔒</span><span class="zone-name">${def.name}</span><span class="lock-cost">🪙 ${shortNumber(def.cost)}</span>`;
      const buyBtn = el('button', 'buy-btn', 'Unlock');
      buyBtn.disabled = engine.gold.amount < def.cost;
      buyBtn.addEventListener('click', () => { engine.unlockFarmZone(def.name); renderAll(); });
      costSpan.appendChild(buyBtn);
      card.appendChild(costSpan);
    } else {
      const instance = engine.zoneCrops.get(def.name);
      const ct       = instance?.cropType;
      const progress = instance?.overallProgress ?? 0;
      const emoji    = ct ? (CROP_EMOJI[ct.id] ?? '🌱') : '—';

      // Top row: emoji + name + tiles + GPS
      const topRow = el('div', 'zone-top-row');
      topRow.innerHTML = `
        <span class="zone-emoji">${emoji}</span>
        <span class="zone-name">${def.name}</span>
        <span class="zone-meta">${ct?.name ?? '—'} · ${def.tileCount} tiles</span>
        <span class="zone-gps">🪙 ${shortNumber((ct?.yieldGold ?? 0) * def.tileCount)} / harvest</span>
      `;
      card.appendChild(topRow);

      // Progress bar
      const barWrap = el('div', 'progress-wrap');
      const bar     = el('div', 'progress-bar');
      bar.style.width = `${Math.round(progress * 100)}%`;
      bar.classList.add(instance?.isFullyGrown ? 'ready' : 'growing');
      barWrap.appendChild(bar);
      const pctLabel = el('span', 'progress-pct', instance?.isFullyGrown ? 'Ready!' : `${Math.round(progress * 100)}%`);
      barWrap.appendChild(pctLabel);
      card.appendChild(barWrap);

      // Phase info
      const phaseRow = el('div', 'phase-row');
      phaseRow.textContent = ct
        ? `Phase ${instance.phase + 1} / ${ct.totalPhases}`
        : '';
      card.appendChild(phaseRow);

      // Crop selector
      const sel = makeSelect(
        Object.values(CROPS).filter(c => c.isUnlocked(engine.cropStats, lifetimeGold)),
        ct?.id,
        cropId => { engine.assignCrop(def.name, cropId); renderAll(); }
      );
      card.appendChild(sel);
    }

    content.appendChild(card);
  });

  // ── Artisan Workshops ──
  const artHeader = el('h2', 'section-header', '🏺 Artisan Workshops');
  content.appendChild(artHeader);

  const artProgress = engine.artisanWS.tickTimer / engine.artisanWS.act.productionIntervalSecs;

  ARTISAN_ZONE_DEFS.forEach(def => {
    const unlocked  = engine.artisanWS.unlockedSet.has(def.name);
    const card = el('div', `zone-card${unlocked ? '' : ' locked'}`);

    if (!unlocked) {
      const costRow = el('div', 'lock-row');
      costRow.innerHTML = `<span class="lock-icon">🔒</span><span class="zone-name">${def.name}</span><span class="lock-cost">🪙 ${shortNumber(def.cost)}</span>`;
      const buyBtn = el('button', 'buy-btn', 'Unlock');
      buyBtn.disabled = engine.gold.amount < def.cost;
      buyBtn.addEventListener('click', () => { engine.unlockArtisanZone(def.name); renderAll(); });
      costRow.appendChild(buyBtn);
      card.appendChild(costRow);
    } else {
      const cropId      = engine.artisanWS.zoneProductMap.get(def.name);
      const ct          = cropId ? CROPS[cropId] : null;
      const ap          = ct?.artisanProduct ?? null;
      const apUnlocked  = ap && (engine.cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold;

      const topRow = el('div', 'zone-top-row');
      topRow.innerHTML = `
        <span class="zone-emoji">🏺</span>
        <span class="zone-name">${def.name}</span>
        <span class="zone-meta">${apUnlocked ? ap.name : (ap ? '⏳ Unlocking…' : '— unassigned —')}</span>
        ${apUnlocked ? `<span class="zone-gps">🪙 ${shortNumber(ap.goldValue)} / batch</span>` : ''}
      `;
      card.appendChild(topRow);

      // Progress bar (always render track; fill only if unlocked)
      const barWrap = el('div', 'progress-wrap');
      const bar     = el('div', 'progress-bar amber');
      bar.style.width = apUnlocked ? `${Math.round(artProgress * 100)}%` : '0%';
      barWrap.appendChild(bar);

      if (!apUnlocked && ap) {
        const sold     = engine.cropStats.get(cropId)?.sold ?? 0;
        const pctLabel = el('span', 'progress-pct', `${shortNumber(sold)} / ${shortNumber(ap.unlockCropSold)} sold`);
        barWrap.appendChild(pctLabel);
      } else if (apUnlocked) {
        const inv = engine.artisanWS.productInventory.get(`${cropId}_artisan`) || 0;
        const pctLabel = el('span', 'progress-pct', `${Math.round(artProgress * 100)}% · Inv: ${inv}`);
        barWrap.appendChild(pctLabel);
      }
      card.appendChild(barWrap);

      // Product selector (only crops with artisan products that are unlocked)
      const artisanCrops = Object.values(CROPS).filter(c =>
        c.artisanProduct && c.isUnlocked(engine.cropStats, lifetimeGold));
      const sel = makeSelect(
        artisanCrops,
        cropId,
        id => { engine.assignArtisanProduct(def.name, id); renderAll(); }
      );
      card.appendChild(sel);
    }

    content.appendChild(card);
  });
}

function makeSelect(crops, currentId, onChange) {
  const wrap = el('div', 'select-wrap');
  const sel  = document.createElement('select');
  sel.className = 'crop-select';
  if (!currentId) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '— Select —';
    sel.appendChild(opt);
  }
  crops.forEach(ct => {
    const opt = document.createElement('option');
    opt.value       = ct.id;
    opt.textContent = `${CROP_EMOJI[ct.id] ?? '🌱'} ${ct.name}`;
    opt.selected    = ct.id === currentId;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => { if (sel.value) onChange(sel.value); });
  wrap.appendChild(sel);
  return wrap;
}

// ── MARKET TAB ────────────────────────────────────────────────────────────────
function renderMarket() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);

  content.appendChild(el('h2', 'section-header', '🌾 Raw Crops'));
  const cropTable = el('table', 'data-table');
  cropTable.innerHTML = `<thead><tr><th>Crop</th><th>Inventory</th><th>Auto-sell</th><th>GPS</th></tr></thead>`;
  const tbody = el('tbody');
  Object.values(CROPS).forEach(ct => {
    if (!ct.isUnlocked(engine.cropStats, lifetimeGold)) return;
    const inv  = engine.cropInventory.get(ct.id) || 0;
    const gps  = engine.cropEffectiveGPS(ct.id) * engine.gameSpeed;
    const auto = engine.autoSellSet.has(ct.id);
    const row  = el('tr');
    row.innerHTML = `
      <td>${CROP_EMOJI[ct.id] ?? '🌱'} ${ct.name}</td>
      <td>${shortNumber(inv)}</td>
      <td></td>
      <td>${shortNumber(gps)}/s</td>
    `;
    const toggle = document.createElement('input');
    toggle.type = 'checkbox'; toggle.checked = auto;
    toggle.addEventListener('change', () => { engine.setAutoSell(ct.id, toggle.checked); renderAll(); });
    row.children[2].appendChild(toggle);
    tbody.appendChild(row);
  });
  cropTable.appendChild(tbody);
  content.appendChild(cropTable);

  // Artisan products
  content.appendChild(el('h2', 'section-header', '🏺 Artisan Products'));
  const artTable = el('table', 'data-table');
  artTable.innerHTML = `<thead><tr><th>Product</th><th>Inventory</th><th>Auto-sell</th></tr></thead>`;
  const atbody = el('tbody');
  Object.values(CROPS).forEach(ct => {
    const ap = ct.artisanProduct;
    if (!ap) return;
    const soldCount = engine.cropStats.get(ct.id)?.sold ?? 0;
    if (soldCount < ap.unlockCropSold) return;
    const key  = `${ct.id}_artisan`;
    const inv  = engine.artisanWS.productInventory.get(key) || 0;
    const auto = engine.autoSellSet.has(key);
    const row  = el('tr');
    row.innerHTML = `<td>🏺 ${ap.name}</td><td>${shortNumber(inv)}</td><td></td>`;
    const toggle = document.createElement('input');
    toggle.type = 'checkbox'; toggle.checked = auto;
    toggle.addEventListener('change', () => { engine.setAutoSell(key, toggle.checked); renderAll(); });
    row.children[2].appendChild(toggle);
    atbody.appendChild(row);
  });
  if (!atbody.children.length) {
    const row = el('tr');
    row.innerHTML = `<td colspan="3" style="color:#666;text-align:center">No artisan products unlocked yet</td>`;
    atbody.appendChild(row);
  }
  artTable.appendChild(atbody);
  content.appendChild(artTable);
}

// ── STATS TAB ─────────────────────────────────────────────────────────────────
function renderStats() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);

  content.appendChild(el('h2', 'section-header', '🌾 Crop History'));
  const table = el('table', 'data-table');
  table.innerHTML = `<thead><tr><th>Crop</th><th>Grown</th><th>Sold</th><th>Lifetime Gold</th></tr></thead>`;
  const tbody = el('tbody');
  Object.values(CROPS).forEach(ct => {
    const s = engine.cropStats.get(ct.id);
    if (!s || (s.grown === 0 && !ct.isUnlocked(engine.cropStats, lifetimeGold))) return;
    const row = el('tr');
    row.innerHTML = `<td>${CROP_EMOJI[ct.id] ?? '🌱'} ${ct.name}</td><td>${shortNumber(s.grown)}</td><td>${shortNumber(s.sold)}</td><td>🪙 ${shortNumber(s.lifetimeSales)}</td>`;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  content.appendChild(table);

  content.appendChild(el('h2', 'section-header', '🏺 Artisan History'));
  const artTable = el('table', 'data-table');
  artTable.innerHTML = `<thead><tr><th>Product</th><th>Crafted</th><th>Sold</th><th>Lifetime Gold</th></tr></thead>`;
  const atbody = el('tbody');
  for (const [key, s] of engine.artisanWS.productStats) {
    if (s.crafted === 0) continue;
    const cropId = key.replace('_artisan', '');
    const name   = CROPS[cropId]?.artisanProduct?.name ?? key;
    const row    = el('tr');
    row.innerHTML = `<td>🏺 ${name}</td><td>${shortNumber(s.crafted)}</td><td>${shortNumber(s.sold)}</td><td>🪙 ${shortNumber(s.lifetimeSales)}</td>`;
    atbody.appendChild(row);
  }
  if (!atbody.children.length) {
    const row = el('tr');
    row.innerHTML = `<td colspan="4" style="color:#666;text-align:center">Nothing produced yet</td>`;
    atbody.appendChild(row);
  }
  artTable.appendChild(atbody);
  content.appendChild(artTable);

  content.appendChild(el('h2', 'section-header', '⏱ Time Spent'));
  const timeGrid = el('div', 'time-grid');
  [
    ['🌾', 'Farming',     engine.totalFarmingHours,     '#6dbd5a'],
    ['💬', 'Socializing', engine.totalSocializingHours, '#5ab5bd'],
    ['😴', 'Sleeping',    engine.totalSleepingHours,    '#9a7fc7'],
  ].forEach(([icon, label, hours, colour]) => {
    const card = el('div', 'time-card');
    card.style.borderColor = colour + '44';
    card.innerHTML = `<div style="font-size:22px">${icon}</div><div style="color:${colour};font-weight:bold">${label}</div><div style="font-size:18px;font-weight:bold">${hours.toFixed(1)}h</div>`;
    timeGrid.appendChild(card);
  });
  content.appendChild(timeGrid);
}

// ── SCHEDULE TAB ──────────────────────────────────────────────────────────────
function renderSchedule() {
  const TOTAL = 24;
  content.appendChild(el('h2', 'section-header', '📅 Daily Schedule'));

  const desc = el('p', 'schedule-desc', 'Allocate 24 hours across the three daily activities. Crops only grow during Farming hours.');
  content.appendChild(desc);

  const activities = [
    { key: 'farming',     label: 'Farming',     icon: '🌾', color: '#6dbd5a' },
    { key: 'socializing', label: 'Socializing', icon: '💬', color: '#5ab5bd' },
    { key: 'sleeping',    label: 'Sleeping',    icon: '😴', color: '#9a7fc7' },
  ];

  // Visual bar
  const barWrap = el('div', 'sched-bar-wrap');
  activities.forEach(a => {
    const seg = el('div', 'sched-bar-seg');
    seg.style.background = a.color;
    seg.style.width = `${(engine.schedule[a.key] / TOTAL) * 100}%`;
    barWrap.appendChild(seg);
  });
  content.appendChild(barWrap);

  // Sliders
  activities.forEach(a => {
    const row = el('div', 'sched-row');
    row.innerHTML = `<span class="sched-icon">${a.icon}</span><span class="sched-label" style="color:${a.color}">${a.label}</span>`;
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '24'; slider.step = '0.5';
    slider.value = engine.schedule[a.key];
    slider.className = 'sched-slider';

    const valEl = el('span', 'sched-val', `${Math.round(engine.schedule[a.key])}h`);

    slider.addEventListener('input', () => {
      const newVal = parseFloat(slider.value);
      const others = activities.filter(b => b.key !== a.key);
      const oldOtherTotal = others.reduce((s, b) => s + engine.schedule[b.key], 0);
      const remaining = TOTAL - newVal;
      engine.setScheduleHours(a.key, newVal);
      if (remaining <= 0) {
        others.forEach(b => engine.setScheduleHours(b.key, 0));
      } else if (oldOtherTotal <= 0) {
        others.forEach(b => engine.setScheduleHours(b.key, remaining / others.length));
      } else {
        others.forEach(b => engine.setScheduleHours(b.key, (engine.schedule[b.key] / oldOtherTotal) * remaining));
      }
      // Reconcile rounding
      const total = activities.reduce((s, b) => s + engine.schedule[b.key], 0);
      const diff = TOTAL - total;
      if (Math.abs(diff) > 0.001) {
        const last = others[others.length - 1];
        engine.setScheduleHours(last.key, Math.max(0, engine.schedule[last.key] + diff));
      }
      renderSchedule();
    });

    row.appendChild(slider);
    row.appendChild(valEl);
    content.appendChild(row);
  });

  const totalRow = el('p', 'sched-total', `Total: ${activities.reduce((s, a) => s + engine.schedule[a.key], 0).toFixed(1)} / 24h`);
  content.appendChild(totalRow);
}

// ── SETTINGS TAB ─────────────────────────────────────────────────────────────
function renderSettings() {
  content.appendChild(el('h2', 'section-header', '⚙️ Settings'));

  // Game speed
  const speedSection = el('div', 'settings-section');
  speedSection.appendChild(el('div', 'settings-label', 'Game Speed'));
  const speedRow = el('div', 'btn-row');
  [1, 3, 6, 12].forEach(spd => {
    const btn = el('button', `speed-btn${engine.gameSpeed === spd ? ' active' : ''}`, `${spd}×`);
    btn.addEventListener('click', () => { engine.setGameSpeed(spd); renderSettings(); });
    speedRow.appendChild(btn);
  });
  speedSection.appendChild(speedRow);
  content.appendChild(speedSection);

  // Auto-pilot
  const apSection = el('div', 'settings-section');
  apSection.appendChild(el('div', 'settings-label', '🤖 Auto-pilot'));
  apSection.appendChild(el('p', 'settings-desc',
    'Automatically assigns best crops, routes artisan products, and buys the cheapest available upgrade.'));
  const apBtn = el('button', `ap-btn${engine.autoPilot ? ' ap-on' : ''}`,
    engine.autoPilot ? '🤖 ON' : '🤖 OFF');
  apBtn.addEventListener('click', () => { engine.setAutoPilot(!engine.autoPilot); renderSettings(); });
  apSection.appendChild(apBtn);
  content.appendChild(apSection);

  // Save / Reset
  const saveSection = el('div', 'settings-section');
  saveSection.appendChild(el('div', 'settings-label', 'Save Data'));
  const saveBtn  = el('button', 'action-btn', '💾 Save Now');
  const resetBtn = el('button', 'action-btn danger', '🗑 Reset Game');
  saveBtn.addEventListener('click', () => { engine.save(); saveBtn.textContent = '✅ Saved!'; setTimeout(() => { saveBtn.textContent = '💾 Save Now'; }, 1500); });
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      engine.clearSave();
      location.reload();
    }
  });
  const btnRow = el('div', 'btn-row');
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(resetBtn);
  saveSection.appendChild(btnRow);
  content.appendChild(saveSection);
}

// ── Offline toast ─────────────────────────────────────────────────────────────
function showOfflineToast(result, realSecs) {
  const fmt = s => s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
                 : s >= 60   ? `${Math.floor(s/60)}m ${s%60}s`
                 : `${s}s`;

  const toast = el('div', 'offline-toast');
  const cap   = result.capped ? ` (capped at 2h)` : '';
  toast.innerHTML = `
    <div class="offline-title">Welcome back!</div>
    <div>Away for ${fmt(Math.floor(realSecs))}${cap}</div>
    <div style="color:#ffd700;margin-top:6px">🪙 +${shortNumber(result.goldEarned)} earned</div>
    <button class="offline-close">×</button>
  `;
  toast.querySelector('.offline-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

// ── Update loop ───────────────────────────────────────────────────────────────
function liveUpdate() {
  updateHeader();
  // Re-render zones tab progress bars without full rebuild
  if (activeTab === 'zones') {
    updateZoneProgressBars();
  }
}

function updateZoneProgressBars() {
  const artProgress = engine.artisanWS.tickTimer / engine.artisanWS.act.productionIntervalSecs;

  content.querySelectorAll('.zone-card:not(.locked)').forEach((card, i) => {
    const bar    = card.querySelector('.progress-bar');
    const pctEl  = card.querySelector('.progress-pct');
    if (!bar || !pctEl) return;

    // Determine if this is a farm card or artisan card from position
    const allCards = Array.from(content.querySelectorAll('.zone-card'));
    const farmCardCount = FARM_ZONE_DEFS.filter(d => engine.unlockedFarmZones.has(d.name)).length;
    const cardIndex     = allCards.indexOf(card);
    const isFarm        = cardIndex < farmCardCount;

    if (isFarm) {
      const zoneDef  = FARM_ZONE_DEFS.filter(d => engine.unlockedFarmZones.has(d.name))[cardIndex];
      if (!zoneDef) return;
      const instance = engine.zoneCrops.get(zoneDef.name);
      if (!instance)  return;
      const prog = instance.overallProgress;
      bar.style.width = `${Math.round(prog * 100)}%`;
      bar.className   = 'progress-bar ' + (instance.isFullyGrown ? 'ready' : 'growing');
      pctEl.textContent = instance.isFullyGrown ? 'Ready!' : `${Math.round(prog * 100)}%`;
    } else {
      const artIndex  = cardIndex - farmCardCount;
      const artDefs   = ARTISAN_ZONE_DEFS.filter(d => engine.artisanWS.unlockedSet.has(d.name));
      const def = artDefs[artIndex];
      if (!def) return;
      const cropId  = engine.artisanWS.zoneProductMap.get(def.name);
      const ap      = cropId ? CROPS[cropId]?.artisanProduct : null;
      const apUnlocked = ap && (engine.cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold;
      bar.style.width = apUnlocked ? `${Math.round(artProgress * 100)}%` : '0%';
      if (apUnlocked) {
        const inv = engine.artisanWS.productInventory.get(`${cropId}_artisan`) || 0;
        pctEl.textContent = `${Math.round(artProgress * 100)}% · Inv: ${inv}`;
      } else if (ap) {
        const sold = engine.cropStats.get(cropId)?.sold ?? 0;
        pctEl.textContent = `${shortNumber(sold)} / ${shortNumber(ap.unlockCropSold)} sold`;
      }
    }
  });
}

// Initial render + live update every 500ms
renderAll();
setInterval(liveUpdate, 500);
