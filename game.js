// game.js — pure game engine for the text-UI version of Idle Ecologist
// No DOM access. Exports createEngine() and zone definition arrays.

import { CROPS, CropInstance } from './crops.js';
import { WORK_ACTIVITIES }     from './activityRegistry.js';

// ── Constants ─────────────────────────────────────────────────────────────────
export const DAY_REAL_SECS = 240; // 4 real minutes = 1 in-game day
const SAVE_KEY             = 'idle-ecologist-text-v1';

// ── Zone definitions (no Tiled map needed) ────────────────────────────────────
export const BASE_ZONE_ACRES   = 1;
export const BASE_ZONE_WORKERS = 1;

/** Speed multiplier for a zone with w workers: 1× at 1 worker, 2× at 10. */
export function workerMultiplier(w) { return 1 + (w - 1) / 9; }

/** Cost to hire the next worker.
 *  Cheap for the first 10 (0.4 × n), then quadratic (0.04 × n²) so early
 *  progress feels snappy while late-game scaling stays meaningful.
 */
export function workerUpgradeCost(def, currentWorkers) {
  const base  = Math.max(3000, Math.round(def.cost * 0.2));
  const scale = currentWorkers <= 10
    ? 0.4  * currentWorkers
    : 0.04 * currentWorkers * currentWorkers;
  return Math.round(base * scale);
}

export const FARM_ZONE_DEFS = [
  { name: 'Strawberry Glen',    cropId: 'strawberry',   cost:          0 }, // starter
  { name: 'Scallion Strip',     cropId: 'greenOnion',   cost:      10000 },
  { name: 'Spud Furrows',       cropId: 'potato',       cost:      20000 },
  { name: 'Onion Dell',         cropId: 'onion',        cost:      30000 },
  { name: 'Carrot Hollow',      cropId: 'carrot',       cost:      50000 },
  { name: 'Blueberry Thicket',  cropId: 'blueberry',    cost:      70000 },
  { name: 'Parsnip Heath',      cropId: 'parsnip',      cost:     100000 },
  { name: 'Lettuce Glade',      cropId: 'lettuce',      cost:     150000 },
  { name: 'Cauliflower Terrace',cropId: 'cauliflower',  cost:     200000 },
  { name: 'Rice Paddies',       cropId: 'rice',         cost:     300000 },
  { name: 'Broccoli Stand',     cropId: 'broccoli',     cost:     500000 },
  { name: 'Asparagus Spire',    cropId: 'asparagus',    cost:     750000 },
];

/** Cost to buy one extra acre in a given zone.
 *  Cheap for the first 10 (0.4 × n), then quadratic (0.04 × n²) so early
 *  progress feels snappy while late-game scaling stays meaningful.
 */
export function acreUpgradeCost(def, currentAcres) {
  const base  = Math.max(1500, Math.round(def.cost * 0.1));
  const scale = currentAcres <= 10
    ? 0.4  * currentAcres
    : 0.04 * currentAcres * currentAcres;
  return Math.round(base * scale);
}

export const ARTISAN_ZONE_DEFS = [
  { name: 'The Berry Press',      cropId: 'strawberry',   cost:        75000 },
  { name: 'The Pickle House',     cropId: 'greenOnion',   cost:       225000 },
  { name: 'The Root Cellar',      cropId: 'potato',       cost:       675000 },
  { name: 'The Brine Works',      cropId: 'onion',        cost:      2025000 },
  { name: 'The Carrot Dryer',     cropId: 'carrot',       cost:      6075000 },
  { name: 'The Berry Winery',     cropId: 'blueberry',    cost:     18225000 },
  { name: 'The Parsnip Still',    cropId: 'parsnip',      cost:     54675000 },
  { name: 'The Leaf Works',       cropId: 'lettuce',      cost:    164025000 },
  { name: 'The Floret House',     cropId: 'cauliflower',  cost:    492075000 },
  { name: 'The Rice Mill',        cropId: 'rice',         cost:   1476225000 },
  { name: 'The Brassica Works',   cropId: 'broccoli',     cost:   4428675000 },
  { name: 'The Asparagus Cellar', cropId: 'asparagus',    cost:  13286025000 },
];

/** Maps old flavour-only zone names → new crop-matching names for save migration. */
export const ZONE_NAME_MIGRATION = {
  // Farm zones
  'Sunflower Patch':           'Strawberry Glen',
  'Clover Corner':             'Scallion Strip',
  'Buttercup Field':           'Spud Furrows',
  'Willowbrook Plot':          'Onion Dell',
  'Mossy Hollow':              'Carrot Hollow',
  'Foxglove Run':              'Blueberry Thicket',
  'Hawthorn Strip':            'Parsnip Heath',
  'Ember Meadow':              'Lettuce Glade',
  'Brackenfold':               'Cauliflower Terrace',
  'Ironwood Terrace':          'Rice Paddies',
  'Stonegate Field':           'Broccoli Stand',
  'Copperleaf Plot':           'Asparagus Spire',
  // Artisan zones
  'The Potting Shed':          'The Berry Press',
  'Oakwood Workshop':          'The Pickle House',
  'Hearthside Cellar':         'The Root Cellar',
  'Millstone Hall':            'The Brine Works',
  'The Smokehouse':            'The Carrot Dryer',
  'Coppergate Works':          'The Berry Winery',
  'Ironbell Distillery':       'The Parsnip Still',
  'Harvestmoon Press':         'The Leaf Works',
  'The Grand Cooperage':       'The Floret House',
  "Elder & Sons Manufactory":  'The Rice Mill',
  'Stonebridge Fermentary':    'The Brassica Works',
  'The Celestial Vault':       'The Asparagus Cellar',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export function shortNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'k';
  return Math.floor(n).toString();
}

class Gold {
  constructor(initial) { this.amount = initial; }
  add(n) { this.amount += n; }
}

// ── Engine factory ────────────────────────────────────────────────────────────
export function createEngine() {

  // ── Core state ──────────────────────────────────────────────────────────────
  const gold         = new Gold(5000);
  let   gameSpeed    = 1;
  let   autoPilot    = false;
  let   gamePaused   = false;
  let   calendarAccum = 0;
  let   inGameDay    = 1;

  // ── Farm zones ──────────────────────────────────────────────────────────────
  const unlockedFarmZones = new Set(); // populated by checkAutoUnlocks()
  const zoneCrops   = new Map(); // zoneName → CropInstance
  const zoneAcres   = new Map(); // zoneName → current acres
  const zoneWorkers = new Map(); // zoneName → worker count

  function farmTileCount(zoneName) {
    return zoneAcres.get(zoneName) ?? BASE_ZONE_ACRES;
  }

  // ── Artisan workState ───────────────────────────────────────────────────────
  const artisanAct = WORK_ACTIVITIES.find(a => a.key === 'artisan');
  const artisanWS = {
    act:              artisanAct,
    zones:            ARTISAN_ZONE_DEFS.map(d => ({ name: d.name })),
    unlockedSet:      new Set(),
    costMap:          new Map(ARTISAN_ZONE_DEFS.map(d => [d.name, d.cost])),
    zoneProductMap:   new Map(),
    productStats:     artisanAct.initProductStats(CROPS),
    productInventory: new Map(),
  };
  const artisanWorkers = new Map(); // zoneName → worker count
  const artisanTimers  = new Map(); // zoneName → production timer

  // ── Crop state ──────────────────────────────────────────────────────────────
  const cropInventory = new Map();
  const autoSellSet   = new Set(Object.keys(CROPS));
  const cropStats     = new Map();
  Object.keys(CROPS).forEach(id => cropStats.set(id, { grown: 0, sold: 0, lifetimeSales: 0 }));

  // ── Artisan context builder ─────────────────────────────────────────────────
  function buildArtisanCtx() {
    return {
      zoneProductMap:        artisanWS.zoneProductMap,
      cropInventory, cropStats,
      productStats:          artisanWS.productStats,
      productInventory:      artisanWS.productInventory,
      autoSellSet, gold, CROPS,
      gameSpeed,
      productionIntervalSecs: artisanAct.productionIntervalSecs,
    };
  }

  // ── Auto-unlock: criteria-based zone activation ──────────────────────────────
  function checkAutoUnlocks() {
    const lifetimeGold = Array.from(cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
    for (const def of FARM_ZONE_DEFS) {
      if (unlockedFarmZones.has(def.name)) continue;
      const crop = CROPS[def.cropId];
      if (!crop) continue;
      if (crop.isUnlocked(cropStats, lifetimeGold)) {
        unlockedFarmZones.add(def.name);
        if (!zoneAcres.has(def.name))   zoneAcres.set(def.name, BASE_ZONE_ACRES);
        if (!zoneWorkers.has(def.name)) zoneWorkers.set(def.name, BASE_ZONE_WORKERS);
        if (!zoneCrops.has(def.name))   zoneCrops.set(def.name, new CropInstance(crop));
      }
    }
    for (const def of ARTISAN_ZONE_DEFS) {
      const crop = CROPS[def.cropId];
      if (!crop?.artisanProduct) continue;
      if (artisanWS.unlockedSet.has(def.name)) {
        // Zone already unlocked — keep product map correct after load/migration
        artisanWS.zoneProductMap.set(def.name, def.cropId);
      } else if ((cropStats.get(def.cropId)?.sold ?? 0) >= crop.artisanProduct.unlockCropSold) {
        artisanWS.unlockedSet.add(def.name);
        artisanWS.zoneProductMap.set(def.name, def.cropId);
        if (!artisanWorkers.has(def.name)) artisanWorkers.set(def.name, BASE_ZONE_WORKERS);
      }
    }
  }
  checkAutoUnlocks(); // unlock starter zone (strawberry has no criteria)

  // ── GPS helpers ─────────────────────────────────────────────────────────────
  /** Current GPS for one crop (respects artisan routing). */
  function cropEffectiveGPS(cropId) {
    const ct = CROPS[cropId];
    if (!ct) return 0;
    const cycleTime = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
    if (cycleTime <= 0) return 0;
    const ap = ct.artisanProduct;
    if (ap) {
      const hasWorkshop = [...artisanWS.unlockedSet].some(zn => artisanWS.zoneProductMap.get(zn) === cropId);
      if (hasWorkshop && (cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold) {
        return (ap.goldValue / ap.cropInputCount) / cycleTime;
      }
    }
    return ct.yieldGold / cycleTime;
  }

  /** Total gold-per-second across all zones (used in header). */
  function getTotalGPS() {
    let gps = 0;
    for (const [zoneName, instance] of zoneCrops) {
      if (!unlockedFarmZones.has(zoneName)) continue;
      const ct  = instance.cropType;
      const ap  = ct.artisanProduct;
      const cyc = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
      if (cyc <= 0) continue;
      const tc = farmTileCount(zoneName);
      const holdRaw = ap
        && (cropStats.get(ct.id)?.sold ?? 0) >= ap.unlockCropSold
        && [...artisanWS.unlockedSet].some(zn => artisanWS.zoneProductMap.get(zn) === ct.id);
      if (!holdRaw && autoSellSet.has(ct.id)) gps += (ct.yieldGold * tc) / cyc;
    }
    for (const zn of artisanWS.unlockedSet) {
      gps += artisanAct.getGPS(
        { name: zn },
        { zoneProductMap: artisanWS.zoneProductMap, cropStats, autoSellSet, gameSpeed, CROPS,
          productionIntervalSecs: artisanAct.productionIntervalSecs }
      );
    }
    return gps;
  }

  // ── Auto-pilot ──────────────────────────────────────────────────────────────
  function runAutoPilot() {
    if (!autoPilot) return;

    // 1. SELL ROUTING — route crop to artisan when its workshop is unlocked
    for (const cropId of Object.keys(CROPS)) {
      const ap   = CROPS[cropId]?.artisanProduct;
      const aKey = ap ? `${cropId}_artisan` : null;
      const hasUnlockedWorkshop = ARTISAN_ZONE_DEFS.some(
        d => d.cropId === cropId && artisanWS.unlockedSet.has(d.name));
      const apUnlocked = ap && (cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold;
      if (hasUnlockedWorkshop && apUnlocked) {
        autoSellSet.delete(cropId);
        if (aKey) autoSellSet.add(aKey);
      } else {
        autoSellSet.add(cropId);
        if (aKey) autoSellSet.delete(aKey);
      }
    }

    // 2. AUTO-BUY — cheapest available upgrade (acres and workers only)
    const candidates = [];
    for (const def of FARM_ZONE_DEFS) {
      if (!unlockedFarmZones.has(def.name)) continue;
      const curAcres = zoneAcres.get(def.name) ?? BASE_ZONE_ACRES;
      candidates.push({ type: 'acre',       name: def.name, cost: acreUpgradeCost(def, curAcres) });
      const curFW = zoneWorkers.get(def.name) ?? BASE_ZONE_WORKERS;
      candidates.push({ type: 'farmWorker', name: def.name, cost: workerUpgradeCost(def, curFW) });
    }
    for (const def of ARTISAN_ZONE_DEFS) {
      if (!artisanWS.unlockedSet.has(def.name)) continue;
      const curAW = artisanWorkers.get(def.name) ?? BASE_ZONE_WORKERS;
      candidates.push({ type: 'artisanWorker', name: def.name, cost: workerUpgradeCost(def, curAW) });
    }
    if (candidates.length > 0) {
      const cheapest = candidates.reduce((a, b) => a.cost < b.cost ? a : b);
      if (gold.amount >= cheapest.cost) {
        gold.add(-cheapest.cost);
        if (cheapest.type === 'acre') {
          zoneAcres.set(cheapest.name, (zoneAcres.get(cheapest.name) ?? BASE_ZONE_ACRES) + 1);
        } else if (cheapest.type === 'farmWorker') {
          zoneWorkers.set(cheapest.name, (zoneWorkers.get(cheapest.name) ?? BASE_ZONE_WORKERS) + 1);
        } else {
          artisanWorkers.set(cheapest.name, (artisanWorkers.get(cheapest.name) ?? BASE_ZONE_WORKERS) + 1);
        }
      }
    }
  }

  // ── Main tick ───────────────────────────────────────────────────────────────
  function tick() {
    if (gamePaused) return;

    calendarAccum += gameSpeed;
    if (calendarAccum >= DAY_REAL_SECS) { calendarAccum -= DAY_REAL_SECS; inGameDay++; }

    // Crop growth
    {
      for (const [zoneName, instance] of zoneCrops) {
        if (!unlockedFarmZones.has(zoneName)) continue;
        const wm = workerMultiplier(zoneWorkers.get(zoneName) ?? BASE_ZONE_WORKERS);
        instance.tick(gameSpeed * wm);
        if (instance.isFullyGrown) {
          const id    = instance.cropType.id;
          const tc    = farmTileCount(zoneName);
          const s     = cropStats.get(id);
          s.grown    += tc;
          if (autoSellSet.has(id)) {
            const earned = instance.cropType.yieldGold * tc;
            gold.add(earned);
            s.sold          += tc;
            s.lifetimeSales += earned;
          } else {
            cropInventory.set(id, (cropInventory.get(id) || 0) + tc);
          }
          instance.harvest();
        }
      }
    }

    // Artisan production (per-zone timers + worker multiplier)
    {
      const ctx = buildArtisanCtx();
      for (const zn of artisanWS.unlockedSet) {
        const wm = workerMultiplier(artisanWorkers.get(zn) ?? BASE_ZONE_WORKERS);
        let t = (artisanTimers.get(zn) ?? 0) + gameSpeed * wm;
        while (t >= artisanAct.productionIntervalSecs) {
          t -= artisanAct.productionIntervalSecs;
          artisanAct.produce({ name: zn }, ctx);
        }
        artisanTimers.set(zn, t);
      }
    }

    runAutoPilot();
    checkAutoUnlocks();
  }

  // ── Offline simulation ──────────────────────────────────────────────────────
  function simulateOffline(realSecs) {
    const MAX_SECS  = 7200;
    const simSecs   = Math.min(realSecs, MAX_SECS);
    const goldBefore = gold.amount;
    const simTimers = new Map(artisanTimers);
    let t = 0;
    while (t < simSecs) {
      t++;
      calendarAccum = (calendarAccum + 1) % DAY_REAL_SECS;
      {
        for (const [zoneName, instance] of zoneCrops) {
          if (!unlockedFarmZones.has(zoneName)) continue;
          const wm = workerMultiplier(zoneWorkers.get(zoneName) ?? BASE_ZONE_WORKERS);
          instance.tick(wm);
          if (instance.isFullyGrown) {
            const id = instance.cropType.id;
            const tc = farmTileCount(zoneName);
            const s  = cropStats.get(id);
            s.grown += tc;
            if (autoSellSet.has(id)) {
              const earned = instance.cropType.yieldGold * tc;
              gold.add(earned);
              s.sold += tc; s.lifetimeSales += earned;
            } else {
              cropInventory.set(id, (cropInventory.get(id) || 0) + tc);
            }
            instance.harvest();
          }
        }
      }
      const ctx = buildArtisanCtx();
      for (const zn of artisanWS.unlockedSet) {
        const wm = workerMultiplier(artisanWorkers.get(zn) ?? BASE_ZONE_WORKERS);
        let acc = (simTimers.get(zn) ?? 0) + wm;
        while (acc >= artisanAct.productionIntervalSecs) {
          acc -= artisanAct.productionIntervalSecs;
          artisanAct.produce({ name: zn }, ctx);
        }
        simTimers.set(zn, acc);
      }
    }
    for (const [k, v] of simTimers) artisanTimers.set(k, v);
    return { goldEarned: gold.amount - goldBefore, simSecs, capped: realSecs > MAX_SECS };
  }

  // ── Save / Load ─────────────────────────────────────────────────────────────
  function getState() {
    return {
      gold: gold.amount, gameSpeed, autoPilot,
      calendarAccum, inGameDay,
      unlockedFarmZones: [...unlockedFarmZones],
      zoneAcres:   Object.fromEntries(zoneAcres),
      zoneWorkers: Object.fromEntries(zoneWorkers),
      unlockedArtisanZones: [...artisanWS.unlockedSet],
      artisanWorkers: Object.fromEntries(artisanWorkers),
      artisanTimers:  Object.fromEntries(artisanTimers),
      zoneCrops: Object.fromEntries([...zoneCrops].map(([k, v]) => [k, { cropId: v.cropType.id, phase: v.phase, timer: v.timer }])),
      cropInventory: Object.fromEntries(cropInventory),
      autoSellSet: [...autoSellSet],
      cropStats: Object.fromEntries([...cropStats].map(([k, v]) => [k, { ...v }])),
      artisanProductMap: Object.fromEntries(artisanWS.zoneProductMap),
      artisanProductStats: Object.fromEntries(artisanWS.productStats),
      artisanInventory: Object.fromEntries(artisanWS.productInventory),
      savedAt: Date.now(),
    };
  }

  function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(getState())); }

  function loadSave() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function applyState(s) {
    // ── Zone-name migration: remap saves made before zones were renamed to match crops ──
    const _rA = a => Array.isArray(a) ? a.map(n => ZONE_NAME_MIGRATION[n] ?? n) : a;
    const _rO = o => !o ? o : Object.fromEntries(Object.entries(o).map(([k,v]) => [ZONE_NAME_MIGRATION[k] ?? k, v]));
    s = { ...s,
      unlockedFarmZones:    _rA(s.unlockedFarmZones),
      zoneAcres:            _rO(s.zoneAcres),
      zoneWorkers:          _rO(s.zoneWorkers),
      zoneCrops:            _rO(s.zoneCrops),
      unlockedArtisanZones: _rA(s.unlockedArtisanZones),
      artisanWorkers:       _rO(s.artisanWorkers),
      artisanTimers:        _rO(s.artisanTimers),
      artisanProductMap:    _rO(s.artisanProductMap),
    };
    if (typeof s.gold         === 'number')  gold.amount   = s.gold;
    if (typeof s.gameSpeed    === 'number')  gameSpeed     = s.gameSpeed;
    if (typeof s.autoPilot    === 'boolean') autoPilot     = s.autoPilot;
    if (typeof s.calendarAccum === 'number') calendarAccum = s.calendarAccum;
    if (typeof s.inGameDay    === 'number')  inGameDay     = s.inGameDay;

    if (Array.isArray(s.unlockedFarmZones)) {
      unlockedFarmZones.clear();
      s.unlockedFarmZones.forEach(n => unlockedFarmZones.add(n));
    }
    if (s.zoneAcres) {
      zoneAcres.clear();
      Object.entries(s.zoneAcres).forEach(([k, v]) => zoneAcres.set(k, v));
      for (const n of unlockedFarmZones) {
        if (!zoneAcres.has(n)) zoneAcres.set(n, BASE_ZONE_ACRES);
      }
    }
    if (s.zoneWorkers) {
      zoneWorkers.clear();
      Object.entries(s.zoneWorkers).forEach(([k, v]) => zoneWorkers.set(k, v));
      for (const n of unlockedFarmZones) {
        if (!zoneWorkers.has(n)) zoneWorkers.set(n, BASE_ZONE_WORKERS);
      }
    }
    if (Array.isArray(s.unlockedArtisanZones)) {
      artisanWS.unlockedSet.clear();
      s.unlockedArtisanZones.forEach(n => artisanWS.unlockedSet.add(n));
    }
    if (s.artisanWorkers) {
      artisanWorkers.clear();
      Object.entries(s.artisanWorkers).forEach(([k, v]) => artisanWorkers.set(k, v));
      for (const n of artisanWS.unlockedSet) {
        if (!artisanWorkers.has(n)) artisanWorkers.set(n, BASE_ZONE_WORKERS);
      }
    }
    if (s.artisanTimers) {
      artisanTimers.clear();
      Object.entries(s.artisanTimers).forEach(([k, v]) => artisanTimers.set(k, v));
    }
    if (s.zoneCrops) {
      zoneCrops.clear();
      Object.entries(s.zoneCrops).forEach(([name, zc]) => {
        const def = FARM_ZONE_DEFS.find(d => d.name === name);
        const ct  = CROPS[def?.cropId ?? zc.cropId]; // always use zone's bound crop
        if (!ct) return;
        const inst = new CropInstance(ct);
        inst.phase = zc.phase ?? 0;
        inst.timer = zc.timer ?? 0;
        zoneCrops.set(name, inst);
      });
    }
    if (s.cropInventory)    { cropInventory.clear();    Object.entries(s.cropInventory).forEach(([k, v])    => cropInventory.set(k, v)); }
    if (Array.isArray(s.autoSellSet)) { autoSellSet.clear(); s.autoSellSet.forEach(k => autoSellSet.add(k)); }
    if (s.cropStats)         Object.entries(s.cropStats).forEach(([id, cs])   => { if (cropStats.has(id))               Object.assign(cropStats.get(id), cs); });
    if (s.artisanProductStats) Object.entries(s.artisanProductStats).forEach(([k, v]) => { if (artisanWS.productStats.has(k)) Object.assign(artisanWS.productStats.get(k), v); });
    if (s.artisanInventory)  { artisanWS.productInventory.clear(); Object.entries(s.artisanInventory).forEach(([k, v])  => artisanWS.productInventory.set(k, v)); }
    checkAutoUnlocks(); // re-derive zoneProductMap and catch any new unlocks
  }

  function clearSave() { localStorage.removeItem(SAVE_KEY); }

  // ── Exposed API ─────────────────────────────────────────────────────────────
  return {
    // Live state (read-only references)
    gold,
    get gameSpeed()    { return gameSpeed;    },
    get autoPilot()    { return autoPilot;    },
    get calendarAccum(){ return calendarAccum; },
    get inGameDay()    { return inGameDay;     },
    CROPS,
    FARM_ZONE_DEFS,
    ARTISAN_ZONE_DEFS,
    unlockedFarmZones,
    zoneAcres,
    zoneWorkers,
    MAX_ZONE_ACRES:   Infinity,
    MAX_ZONE_WORKERS: Infinity,
    acreUpgradeCost,
    workerUpgradeCost,
    workerMultiplier,
    artisanWS,
    artisanWorkers,
    artisanTimers,
    zoneCrops,
    cropInventory,
    autoSellSet,
    cropStats,

    // Computed
    getTotalGPS,
    cropEffectiveGPS,
    // Mutations (called from UI)
    upgradeZoneAcres(name) {
      const def     = FARM_ZONE_DEFS.find(d => d.name === name);
      const current = zoneAcres.get(name) ?? BASE_ZONE_ACRES;
      if (!def || !unlockedFarmZones.has(name)) return false;
      const cost = acreUpgradeCost(def, current);
      if (gold.amount < cost) return false;
      gold.add(-cost);
      zoneAcres.set(name, current + 1);
      return true;
    },
    upgradeZoneWorkers(name) {
      const def     = FARM_ZONE_DEFS.find(d => d.name === name);
      const current = zoneWorkers.get(name) ?? BASE_ZONE_WORKERS;
      if (!def || !unlockedFarmZones.has(name)) return false;
      const cost = workerUpgradeCost(def, current);
      if (gold.amount < cost) return false;
      gold.add(-cost);
      zoneWorkers.set(name, current + 1);
      return true;
    },
    upgradeArtisanWorkers(name) {
      const def     = ARTISAN_ZONE_DEFS.find(d => d.name === name);
      const current = artisanWorkers.get(name) ?? BASE_ZONE_WORKERS;
      if (!def || !artisanWS.unlockedSet.has(name)) return false;
      const cost = workerUpgradeCost(def, current);
      if (gold.amount < cost) return false;
      gold.add(-cost);
      artisanWorkers.set(name, current + 1);
      return true;
    },
    setAutoSell(key, value)  { if (value) autoSellSet.add(key); else autoSellSet.delete(key); },

    /**
     * Manually sell items from inventory.
     * key    — a cropId (e.g. 'strawberry') or artisan key (e.g. 'strawberry_artisan')
     * amount — units to sell; omit or pass undefined to sell everything
     * Returns the gold earned.
     */
    sellInventory(key, amount) {
      if (key.endsWith('_artisan')) {
        const inv = artisanWS.productInventory.get(key) || 0;
        if (inv <= 0) return 0;
        const cropId = key.slice(0, -'_artisan'.length);
        const ct = CROPS[cropId];
        if (!ct?.artisanProduct) return 0;
        const qty = (amount == null) ? inv : Math.min(Math.floor(amount), inv);
        if (qty <= 0) return 0;
        const earned = ct.artisanProduct.goldValue * qty;
        gold.add(earned);
        artisanWS.productInventory.set(key, inv - qty);
        const stat = artisanWS.productStats.get(key);
        if (stat) { stat.sold += qty; stat.lifetimeSales += earned; }
        return earned;
      } else {
        const ct = CROPS[key];
        if (!ct) return 0;
        const inv = cropInventory.get(key) || 0;
        if (inv <= 0) return 0;
        const qty = (amount == null) ? inv : Math.min(Math.floor(amount), inv);
        if (qty <= 0) return 0;
        const earned = ct.yieldGold * qty;
        gold.add(earned);
        cropInventory.set(key, inv - qty);
        const s = cropStats.get(key);
        if (s) { s.sold += qty; s.lifetimeSales += earned; }
        return earned;
      }
    },

    setGameSpeed(v)          { gameSpeed = v; },
    setAutoPilot(v)          { autoPilot = v; },

    // Engine lifecycle
    tick,
    save,
    loadSave,
    applyState,
    simulateOffline,
    clearSave,
    getState,
  };
}
