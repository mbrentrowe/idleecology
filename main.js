// main.js — UI layer and entry point for Idle Ecologist Text UI
import { createEngine, shortNumber, FARM_ZONE_DEFS, ARTISAN_ZONE_DEFS, DAY_REAL_SECS, acreUpgradeCost, workerUpgradeCost, workerMultiplier } from './game.js';
import { CROPS } from './crops.js';

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
    }
  }
}

setInterval(() => engine.tick(), 250);
setInterval(() => engine.save(), 10000);

// ── Wake Lock ───────────────────────────────────────────────────────────
let _wakeLock = null;
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch (_) { /* denied or unavailable */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquireWakeLock();
});
acquireWakeLock();

// ── Tab state ─────────────────────────────────────────────────────────────────
const TABS = ['crops', 'artisan', 'market', 'stats', 'settings'];
let activeTab = 'crops';

// ── UI Construction ───────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Header
const header = document.getElementById('header');
const goldEl    = el('span', 'gold-amount');
const gpsEl     = el('span', 'gps');
const dayEl     = el('span', 'day-counter');
const nextCropEl = el('div', 'next-crop-bar');
[goldEl, gpsEl, dayEl].forEach(e => header.appendChild(e));
header.appendChild(nextCropEl);

// Tabs
const tabBar = document.getElementById('tab-bar');
const TAB_LABELS = { crops: '🌾 Crops', artisan: '🏺 Artisan', market: '💰 Market', stats: '📊 Stats', settings: '⚙️ Settings' };
TABS.forEach(tab => {
  const btn = el('button', 'tab-btn', TAB_LABELS[tab] ?? (tab.charAt(0).toUpperCase() + tab.slice(1)));
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
    case 'crops':    lastZonesFingerprint = zonesFingerprint(); renderCrops();    break;
    case 'artisan':  lastZonesFingerprint = zonesFingerprint(); renderArtisan();  break;
    case 'market':   renderMarket();   break;
    case 'stats':    renderStats();    break;
    case 'settings': renderSettings(); break;
  }
}

// ── Header update ─────────────────────────────────────────────────────────────
function updateHeader() {
  goldEl.textContent = `🪙 ${shortNumber(engine.gold.amount)}`;
  gpsEl.textContent  = `+${shortNumber(engine.getTotalGPS() * engine.gameSpeed)}/s`;
  dayEl.textContent  = `Day ${engine.inGameDay}`;

  // Next crop unlock progress
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
  const nextCrop = Object.values(CROPS).find(ct => !ct.isUnlocked(engine.cropStats, lifetimeGold));
  if (!nextCrop || !nextCrop.unlockCriteria) {
    nextCropEl.textContent = '🏆 All crops unlocked!';
    nextCropEl.className   = 'next-crop-bar all-unlocked';
  } else {
    const { cropId, cropSold, goldEarned } = nextCrop.unlockCriteria;
    const soldNow  = engine.cropStats.get(cropId)?.sold ?? 0;
    const soldPct  = Math.min(1, soldNow / cropSold);
    const goldPct  = Math.min(1, lifetimeGold / goldEarned);
    const srcEmoji = cropIconHtml(CROP_ICON_GID[cropId], 16);
    const dstEmoji = cropIconHtml(CROP_ICON_GID[nextCrop.id], 16);
    nextCropEl.className = 'next-crop-bar';
    nextCropEl.innerHTML = `
      <span class="next-label">🔜 ${dstEmoji} ${nextCrop.name}</span>
      <span class="next-req">
        ${srcEmoji} ${shortNumber(soldNow)}<span class="next-sep">/</span>${shortNumber(cropSold)} sold
        <span class="next-mini-bar"><span class="next-mini-fill" style="width:${Math.round(soldPct*100)}%"></span></span>
      </span>
      <span class="next-req">
        🪙 ${shortNumber(lifetimeGold)}<span class="next-sep">/</span>${shortNumber(goldEarned)}
        <span class="next-mini-bar"><span class="next-mini-fill gold" style="width:${Math.round(goldPct*100)}%"></span></span>
      </span>
    `;
  }
}

// ── CROPS TAB ────────────────────────────────────────────────────────────────
function renderCrops() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);

  // ── Farm Zones ──
  const farmHeader = el('h2', 'section-header', '🌾 Farm Zones');
  content.appendChild(farmHeader);

  // "Set all farms" chip row — only when 2+ zones are unlocked
  const unlockedFarmDefs = FARM_ZONE_DEFS.filter(d => engine.unlockedFarmZones.has(d.name));
  if (unlockedFarmDefs.length > 1) {
    const availCrops = Object.values(CROPS).filter(c => c.isUnlocked(engine.cropStats, lifetimeGold));
    const setAllWrap = el('div', 'set-all-picker');
    setAllWrap.appendChild(el('span', 'set-all-label', 'Set all farms:'));
    const chips = el('div', 'set-all-chips');
    // Highlight chip if all unlocked farms share the same crop
    const farmCropIds = unlockedFarmDefs.map(d => engine.zoneCrops.get(d.name)?.cropType?.id ?? null);
    const activeFarmCrop = farmCropIds.every(id => id && id === farmCropIds[0]) ? farmCropIds[0] : null;
    availCrops.forEach(ct => {
      const chip = el('button', `set-all-chip${ct.id === activeFarmCrop ? ' active' : ''}`);
      chip.innerHTML = cropIconHtml(CROP_ICON_GID[ct.id], 20) + `<span>${ct.name}</span>`;
      chip.addEventListener('click', () => { unlockedFarmDefs.forEach(d => engine.assignCrop(d.name, ct.id)); renderAll(); });
      chips.appendChild(chip);
    });
    setAllWrap.appendChild(chips);
    content.appendChild(setAllWrap);
  }

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
      const cropIconEl = ct ? cropIconHtml(CROP_ICON_GID[ct.id]) : '<span style="color:#666;font-size:18px">—</span>';

      // Top row: icon + name + tiles + GPS
      const topRow = el('div', 'zone-top-row');
      topRow.innerHTML = `
        ${cropIconEl}
        <span class="zone-name">${def.name}</span>
        <span class="zone-meta">${ct?.name ?? '—'} · ${engine.zoneAcres.get(def.name) ?? 4} acres</span>
        <span class="zone-gps">🪙 ${shortNumber((ct?.yieldGold ?? 0) * (engine.zoneAcres.get(def.name) ?? 4))} / harvest</span>
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
        ? instance.isFullyGrown
          ? `✅ Ready to harvest`
          : `Growing — stage ${instance.phase + 1} of ${ct.totalPhases}`
        : '';
      card.appendChild(phaseRow);

      // Crop selector chips
      const availCropsZone = Object.values(CROPS).filter(c => c.isUnlocked(engine.cropStats, lifetimeGold));
      const cropPickerWrap = el('div', 'zone-chip-picker');
      const cropChips = el('div', 'set-all-chips');
      availCropsZone.forEach(c => {
        const chip = el('button', `set-all-chip${c.id === ct?.id ? ' active' : ''}`);
        chip.innerHTML = cropIconHtml(CROP_ICON_GID[c.id], 18) + `<span>${c.name}</span>`;
        chip.addEventListener('click', () => { engine.assignCrop(def.name, c.id); renderAll(); });
        cropChips.appendChild(chip);
      });
      cropPickerWrap.appendChild(cropChips);
      card.appendChild(cropPickerWrap);

      // Acre upgrade row
      const currentAcres = engine.zoneAcres.get(def.name) ?? 1;
      const acreRow = el('div', 'acre-upgrade-row');
      const acreCost = acreUpgradeCost(def, currentAcres);
      acreRow.innerHTML = `<span class="acre-label">Acres: <strong>${currentAcres}</strong></span>`;
      const acreBtn = el('button', 'buy-btn acre-btn', `+1 acre \u2014 \ud83e\ude99 ${shortNumber(acreCost)}`);
      acreBtn.disabled = engine.gold.amount < acreCost;
      acreBtn.dataset.zoneName = def.name;
      acreBtn.addEventListener('click', () => { engine.upgradeZoneAcres(def.name); renderAll(); });
      acreRow.appendChild(acreBtn);
      card.appendChild(acreRow);

      // Worker upgrade row
      const currentWorkers = engine.zoneWorkers.get(def.name) ?? 1;
      const workerRow  = el('div', 'acre-upgrade-row');
      const workerCost = workerUpgradeCost(def, currentWorkers);
      const mult       = workerMultiplier(currentWorkers);
      workerRow.innerHTML = `<span class="acre-label">Workers: <strong>${currentWorkers}</strong> <span style="color:#aaa;font-size:11px">(${mult.toFixed(2)}\u00d7 speed)</span></span>`;
      const wBtn = el('button', 'buy-btn acre-btn worker-btn', `+1 worker \u2014 \ud83e\ude99 ${shortNumber(workerCost)}`);
      wBtn.disabled = engine.gold.amount < workerCost;
      wBtn.dataset.zoneNameW = def.name;
      wBtn.addEventListener('click', () => { engine.upgradeZoneWorkers(def.name); renderAll(); });
      workerRow.appendChild(wBtn);
      card.appendChild(workerRow);
    }

    content.appendChild(card);
  });
}

// ── ARTISAN TAB ─────────────────────────────────────────────────────
function renderArtisan() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);

  // ── Artisan Workshops ──
  const artHeader = el('h2', 'section-header', '🏺 Artisan Workshops');
  content.appendChild(artHeader);

  // "Set all workshops" chip row — only when 2+ are unlocked
  const unlockedArtisanDefs = ARTISAN_ZONE_DEFS.filter(d => engine.artisanWS.unlockedSet.has(d.name));
  if (unlockedArtisanDefs.length > 1) {
    const availArtisanCrops = Object.values(CROPS).filter(c => c.artisanProduct && c.isUnlocked(engine.cropStats, lifetimeGold));
    const artSetAllWrap = el('div', 'set-all-picker');
    artSetAllWrap.appendChild(el('span', 'set-all-label', 'Set all workshops:'));
    const artChips = el('div', 'set-all-chips');
    // Highlight chip if all unlocked workshops share the same product
    const artProductIds = unlockedArtisanDefs.map(d => engine.artisanWS.zoneProductMap.get(d.name) ?? null);
    const activeArtProduct = artProductIds.every(id => id && id === artProductIds[0]) ? artProductIds[0] : null;
    availArtisanCrops.forEach(ct => {
      const chip = el('button', `set-all-chip${ct.id === activeArtProduct ? ' active' : ''}`);
      chip.innerHTML = cropIconHtml(CROP_ICON_GID[ct.id], 20) + `<span>${ct.artisanProduct.name}</span>`;
      chip.addEventListener('click', () => { unlockedArtisanDefs.forEach(d => engine.assignArtisanProduct(d.name, ct.id)); renderAll(); });
      artChips.appendChild(chip);
    });
    artSetAllWrap.appendChild(artChips);
    content.appendChild(artSetAllWrap);
  }

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
      const artProgress = (engine.artisanTimers.get(def.name) ?? 0) / engine.artisanWS.act.productionIntervalSecs;
      const artWorkers  = engine.artisanWorkers.get(def.name) ?? 1;
      const artMult     = workerMultiplier(artWorkers);

      const topRow = el('div', 'zone-top-row');
      topRow.innerHTML = `
        ${cropId && apUnlocked ? cropIconHtml(CROP_ICON_GID[cropId]) : '<span class="zone-emoji">🏺</span>'}
        <span class="zone-name">${def.name}</span>
        <span class="zone-meta">${apUnlocked ? ap.name : (ap ? '⏳ Unlocking…' : '— unassigned —')}</span>
        ${apUnlocked ? `<span class="zone-gps">🪙 ${shortNumber(ap.goldValue)} / batch</span>` : ''}
      `;
      card.appendChild(topRow);

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

      const artisanCrops = Object.values(CROPS).filter(c =>
        c.artisanProduct && c.isUnlocked(engine.cropStats, lifetimeGold));
      const artPickerWrap = el('div', 'zone-chip-picker');
      const artChipsEl = el('div', 'set-all-chips');
      artisanCrops.forEach(c => {
        const chip = el('button', `set-all-chip${c.id === cropId ? ' active' : ''}`);
        chip.innerHTML = cropIconHtml(CROP_ICON_GID[c.id], 18) + `<span>${c.artisanProduct.name}</span>`;
        chip.addEventListener('click', () => { engine.assignArtisanProduct(def.name, c.id); renderAll(); });
        artChipsEl.appendChild(chip);
      });
      artPickerWrap.appendChild(artChipsEl);
      card.appendChild(artPickerWrap);

      // Worker upgrade row
      const artWorkerCost  = workerUpgradeCost(def, artWorkers);
      const artWorkerRow   = el('div', 'acre-upgrade-row');
      artWorkerRow.innerHTML = `<span class="acre-label">Workers: <strong>${artWorkers}</strong> <span style="color:#aaa;font-size:11px">(${artMult.toFixed(2)}× speed)</span></span>`;
      const wBtn = el('button', 'buy-btn acre-btn worker-btn', `+1 worker — 🪙 ${shortNumber(artWorkerCost)}`);
      wBtn.disabled = engine.gold.amount < artWorkerCost;
      wBtn.dataset.artZoneNameW = def.name;
      wBtn.addEventListener('click', () => { engine.upgradeArtisanWorkers(def.name); renderAll(); });
      artWorkerRow.appendChild(wBtn);
      card.appendChild(artWorkerRow);
    }

    content.appendChild(card);
  });
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
      <td>${cropIconHtml(CROP_ICON_GID[ct.id], 20)} ${ct.name}</td>
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

  // ── Crop History ──
  content.appendChild(el('h2', 'section-header', '🌾 Crop History'));
  const table = el('table', 'data-table');
  table.innerHTML = `<thead><tr><th>Crop</th><th>Grown</th><th>Sold</th><th>Lifetime Gold</th></tr></thead>`;
  const tbody = el('tbody');

  Object.values(CROPS).forEach(ct => {
    const unlocked = ct.isUnlocked(engine.cropStats, lifetimeGold);
    const s        = engine.cropStats.get(ct.id);
    const row      = el('tr');

    if (unlocked) {
      row.innerHTML = `
        <td>${cropIconHtml(CROP_ICON_GID[ct.id], 20)} ${ct.name}</td>
        <td>${shortNumber(s?.grown ?? 0)}</td>
        <td>${shortNumber(s?.sold  ?? 0)}</td>
        <td>🪙 ${shortNumber(s?.lifetimeSales ?? 0)}</td>
      `;
    } else {
      // Show unlock requirements with mini progress bars
      const { cropId, cropSold, goldEarned } = ct.unlockCriteria;
      const soldNow  = engine.cropStats.get(cropId)?.sold ?? 0;
      const soldPct  = Math.min(100, Math.round(soldNow / cropSold * 100));
      const goldPct  = Math.min(100, Math.round(lifetimeGold / goldEarned * 100));
      const srcEmoji = cropIconHtml(CROP_ICON_GID[cropId], 16);
      row.classList.add('locked-row');
      row.innerHTML = `
        <td>🔒 <span style="color:#666">${ct.name}</span></td>
        <td colspan="3">
          <div class="unlock-reqs">
            <span class="unlock-req">
              ${srcEmoji} ${shortNumber(soldNow)}<span class="next-sep">/</span>${shortNumber(cropSold)} sold
              <span class="next-mini-bar"><span class="next-mini-fill" style="width:${soldPct}%"></span></span>
            </span>
            <span class="unlock-req">
              🪙 ${shortNumber(lifetimeGold)}<span class="next-sep">/</span>${shortNumber(goldEarned)} earned
              <span class="next-mini-bar"><span class="next-mini-fill gold" style="width:${goldPct}%"></span></span>
            </span>
          </div>
        </td>
      `;
    }
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  content.appendChild(table);

  // ── Artisan History ──
  content.appendChild(el('h2', 'section-header', '🏺 Artisan Products'));
  const artTable = el('table', 'data-table');
  artTable.innerHTML = `<thead><tr><th>Product</th><th>Crafted</th><th>Sold</th><th>Lifetime Gold</th></tr></thead>`;
  const atbody = el('tbody');

  Object.values(CROPS).forEach(ct => {
    const ap = ct.artisanProduct;
    if (!ap) return;
    const key      = `${ct.id}_artisan`;
    const soldCount = engine.cropStats.get(ct.id)?.sold ?? 0;
    const apUnlocked = soldCount >= ap.unlockCropSold;
    const row = el('tr');

    if (apUnlocked) {
      const s = engine.artisanWS.productStats.get(key) ?? { crafted: 0, sold: 0, lifetimeSales: 0 };
      row.innerHTML = `
        <td>🏺 ${ap.name}</td>
        <td>${shortNumber(s.crafted)}</td>
        <td>${shortNumber(s.sold)}</td>
        <td>🪙 ${shortNumber(s.lifetimeSales)}</td>
      `;
    } else {
      const pct = Math.min(100, Math.round(soldCount / ap.unlockCropSold * 100));
      const emoji = cropIconHtml(CROP_ICON_GID[ct.id], 16);
      row.classList.add('locked-row');
      row.innerHTML = `
        <td>🔒 <span style="color:#666">${ap.name}</span></td>
        <td colspan="3">
          <div class="unlock-reqs">
            <span class="unlock-req">
              ${emoji} ${shortNumber(soldCount)}<span class="next-sep">/</span>${shortNumber(ap.unlockCropSold)} ${ct.name} sold
              <span class="next-mini-bar"><span class="next-mini-fill" style="width:${pct}%"></span></span>
            </span>
          </div>
        </td>
      `;
    }
    atbody.appendChild(row);
  });

  artTable.appendChild(atbody);
  content.appendChild(artTable);

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
    btn.addEventListener('click', () => { engine.setGameSpeed(spd); renderAll(); });
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
  apBtn.addEventListener('click', () => { engine.setAutoPilot(!engine.autoPilot); renderAll(); });
  apSection.appendChild(apBtn);
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
let lastZonesFingerprint = '';

function zonesFingerprint() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
  const unlockedCropCount = Object.values(CROPS).filter(c => c.isUnlocked(engine.cropStats, lifetimeGold)).length;
  const farmParts = FARM_ZONE_DEFS
    .filter(d => engine.unlockedFarmZones.has(d.name))
    .map(d => `${d.name}:${engine.zoneAcres.get(d.name) ?? 1}:${engine.zoneWorkers.get(d.name) ?? 1}`).join(',');
  const artParts = ARTISAN_ZONE_DEFS
    .filter(d => engine.artisanWS.unlockedSet.has(d.name))
    .map(d => `${d.name}:${engine.artisanWorkers.get(d.name) ?? 1}`).join(',');
  return `f${engine.unlockedFarmZones.size}|a${engine.artisanWS.unlockedSet.size}|c${unlockedCropCount}|${farmParts}|${artParts}`;
}

function liveUpdate() {
  updateHeader();
  if (activeTab === 'crops' || activeTab === 'artisan') {
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
        btn.disabled = engine.gold.amount < workerUpgradeCost(def, cur);
      });
      content.querySelectorAll('.worker-btn[data-art-zone-name-w]').forEach(btn => {
        const def = ARTISAN_ZONE_DEFS.find(d => d.name === btn.dataset.artZoneNameW);
        if (!def) return;
        const cur = engine.artisanWorkers.get(def.name) ?? 1;
        btn.disabled = engine.gold.amount < workerUpgradeCost(def, cur);
      });
    }
  }
}

function updateZoneProgressBars() {
  content.querySelectorAll('.zone-card:not(.locked)').forEach((card, i) => {
    const bar   = card.querySelector('.progress-bar');
    const pctEl = card.querySelector('.progress-pct');
    if (!bar || !pctEl) return;

    if (activeTab === 'crops') {
      const zoneDef  = FARM_ZONE_DEFS.filter(d => engine.unlockedFarmZones.has(d.name))[i];
      if (!zoneDef) return;
      const instance = engine.zoneCrops.get(zoneDef.name);
      if (!instance)  return;
      const prog = instance.overallProgress;
      bar.style.width = `${Math.round(prog * 100)}%`;
      bar.className   = 'progress-bar ' + (instance.isFullyGrown ? 'ready' : 'growing');
      pctEl.textContent = instance.isFullyGrown ? 'Ready!' : `${Math.round(prog * 100)}%`;
      const phaseEl = card.querySelector('.phase-row');
      if (phaseEl) {
        phaseEl.textContent = instance.isFullyGrown
          ? '\u2705 Ready to harvest'
          : `Growing \u2014 stage ${instance.phase + 1} of ${instance.cropType.totalPhases}`;
      }
    } else if (activeTab === 'artisan') {
      const def = ARTISAN_ZONE_DEFS.filter(d => engine.artisanWS.unlockedSet.has(d.name))[i];
      if (!def) return;
      const cropId  = engine.artisanWS.zoneProductMap.get(def.name);
      const ap      = cropId ? CROPS[cropId]?.artisanProduct : null;
      const apUnlocked = ap && (engine.cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold;
      const artProgress = (engine.artisanTimers.get(def.name) ?? 0) / engine.artisanWS.act.productionIntervalSecs;
      bar.style.width = apUnlocked ? `${Math.round(artProgress * 100)}%` : '0%';
      if (apUnlocked) {
        const inv = engine.artisanWS.productInventory.get(`${cropId}_artisan`) || 0;
        pctEl.textContent = `${Math.round(artProgress * 100)}% \u00b7 Inv: ${inv}`;
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
