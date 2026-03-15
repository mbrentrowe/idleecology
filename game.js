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

/** Cost to hire the next worker. Scales with current worker count. */
export function workerUpgradeCost(def, currentWorkers) {
  const base = Math.max(3000, Math.round(def.cost * 0.2));
  return Math.round(base * currentWorkers);
}

export const FARM_ZONE_DEFS = [
  { name: 'Sunflower Patch',    cost:          0 }, // starter, free
  { name: 'Clover Corner',      cost:      10000 },
  { name: 'Buttercup Field',    cost:      20000 },
  { name: 'Willowbrook Plot',   cost:      30000 },
  { name: 'Mossy Hollow',       cost:      50000 },
  { name: 'Foxglove Run',       cost:      70000 },
  { name: 'Hawthorn Strip',     cost:     100000 },
  { name: 'Ember Meadow',       cost:     150000 },
  { name: 'Brackenfold',        cost:     200000 },
  { name: 'Ironwood Terrace',   cost:     300000 },
  { name: 'Stonegate Field',    cost:     500000 },
  { name: 'Copperleaf Plot',    cost:     750000 },
  { name: 'Silverbrook Acre',   cost:    1000000 },
  { name: 'Thornfield Rise',    cost:    1500000 },
  { name: 'The Grand Flat',     cost:    2000000 },
];

/** Cost to buy one extra acre in a given zone. Scales with how many acres already owned. */
export function acreUpgradeCost(def, currentAcres) {
  const base = Math.max(1500, Math.round(def.cost * 0.1));
  return Math.round(base * currentAcres);
}

export const ARTISAN_ZONE_DEFS = [
  { name: 'The Potting Shed',         cost:       75000 },
  { name: 'Oakwood Workshop',         cost:      225000 },
  { name: 'Hearthside Cellar',        cost:      675000 },
  { name: 'Millstone Hall',           cost:     2025000 },
  { name: 'The Smokehouse',           cost:     6075000 },
  { name: 'Coppergate Works',         cost:    18225000 },
  { name: 'Ironbell Distillery',      cost:    54675000 },
  { name: 'Harvestmoon Press',        cost:   164025000 },
  { name: 'The Grand Cooperage',      cost:   492075000 },
  { name: "Elder & Sons Manufactory", cost:  1476225000 },
];

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
  const STARTER_ZONE = FARM_ZONE_DEFS[0].name;
  const unlockedFarmZones = new Set([STARTER_ZONE]);
  const zoneCrops   = new Map(); // zoneName → CropInstance
  const zoneAcres   = new Map(); // zoneName → current acres
  const zoneWorkers = new Map(); // zoneName → worker count
  zoneCrops.set(STARTER_ZONE, new CropInstance(CROPS.strawberry));
  zoneAcres.set(STARTER_ZONE, BASE_ZONE_ACRES);
  zoneWorkers.set(STARTER_ZONE, BASE_ZONE_WORKERS);

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

  /** Projected GPS over 600-second horizon, weighing artisan unlock grind cost. */
  function projectedCropGPS(cropId) {
    const ct = CROPS[cropId];
    if (!ct) return 0;
    const cycleTime = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
    if (cycleTime <= 0) return 0;
    const rawGPS = ct.yieldGold / cycleTime;
    const ap = ct.artisanProduct;
    if (!ap) return rawGPS;
    const hasWorkshop = [...artisanWS.unlockedSet].some(zn => artisanWS.zoneProductMap.get(zn) === cropId);
    if (!hasWorkshop) return rawGPS;
    const soldCount = cropStats.get(cropId)?.sold ?? 0;
    const apGPS = (ap.goldValue / ap.cropInputCount) / cycleTime;
    if (soldCount >= ap.unlockCropSold) return apGPS;
    const totalTiles = FARM_ZONE_DEFS.filter(d => unlockedFarmZones.has(d.name)).reduce((s, d) => s + (zoneAcres.get(d.name) ?? BASE_ZONE_ACRES), 0);
    const soldPerSec = totalTiles / cycleTime;
    if (soldPerSec <= 0) return rawGPS;
    const unlockTime = (ap.unlockCropSold - soldCount) / soldPerSec;
    const HORIZON = 600;
    if (unlockTime >= HORIZON) return rawGPS;
    return (rawGPS * unlockTime + apGPS * (HORIZON - unlockTime)) / HORIZON;
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
  function bestUnlockedCropId() {
    const lifetimeGold = Array.from(cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
    let bestId = null, bestGPS = -1;
    for (const [id, ct] of Object.entries(CROPS)) {
      if (!ct.isUnlocked(cropStats, lifetimeGold)) continue;
      const gps = projectedCropGPS(id);
      if (gps > bestGPS) { bestGPS = gps; bestId = id; }
    }
    return bestId;
  }

  function runAutoPilot() {
    if (!autoPilot) return;
    const bestId = bestUnlockedCropId();

    // 1. SELL ROUTING
    const holdRawSet = new Set();
    for (const zn of artisanWS.unlockedSet) {
      const cid = artisanWS.zoneProductMap.get(zn);
      if (!cid) continue;
      const ap = CROPS[cid]?.artisanProduct;
      if (ap && (cropStats.get(cid)?.sold ?? 0) >= ap.unlockCropSold) holdRawSet.add(cid);
    }
    for (const cropId of Object.keys(CROPS)) {
      const ap   = CROPS[cropId]?.artisanProduct;
      const aKey = ap ? `${cropId}_artisan` : null;
      if (holdRawSet.has(cropId)) {
        autoSellSet.delete(cropId);
        if (aKey) autoSellSet.add(aKey);
      } else {
        autoSellSet.add(cropId);
        if (aKey) autoSellSet.delete(aKey);
      }
    }

    // 2. WORKSHOP ASSIGN
    if (bestId) {
      for (const zn of artisanWS.unlockedSet) {
        artisanWS.zoneProductMap.set(zn, bestId);
      }
    }

    // 3. CROP SWAP
    if (bestId) {
      for (const [zoneName, instance] of zoneCrops) {
        if (instance.cropType.id !== bestId) {
          zoneCrops.set(zoneName, new CropInstance(CROPS[bestId]));
        }
      }
    }

    // 4. AUTO-BUY — cheapest available upgrade
    const candidates = [];
    for (const def of FARM_ZONE_DEFS) {
      if (!unlockedFarmZones.has(def.name) && def.cost > 0)
        candidates.push({ type: 'farm', name: def.name, cost: def.cost });
    }
    for (const def of ARTISAN_ZONE_DEFS) {
      if (!artisanWS.unlockedSet.has(def.name))
        candidates.push({ type: 'artisan', name: def.name, cost: def.cost });
    }
    for (const def of FARM_ZONE_DEFS) {
      if (!unlockedFarmZones.has(def.name)) continue;
      const curAcres = zoneAcres.get(def.name) ?? BASE_ZONE_ACRES;
      candidates.push({ type: 'acre', name: def.name, cost: acreUpgradeCost(def, curAcres) });
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
        if (cheapest.type === 'farm') {
          unlockedFarmZones.add(cheapest.name);
          zoneAcres.set(cheapest.name, BASE_ZONE_ACRES);
          zoneWorkers.set(cheapest.name, BASE_ZONE_WORKERS);
          if (bestId) zoneCrops.set(cheapest.name, new CropInstance(CROPS[bestId]));
        } else if (cheapest.type === 'acre') {
          zoneAcres.set(cheapest.name, (zoneAcres.get(cheapest.name) ?? BASE_ZONE_ACRES) + 1);
        } else if (cheapest.type === 'farmWorker') {
          zoneWorkers.set(cheapest.name, (zoneWorkers.get(cheapest.name) ?? BASE_ZONE_WORKERS) + 1);
        } else if (cheapest.type === 'artisanWorker') {
          artisanWorkers.set(cheapest.name, (artisanWorkers.get(cheapest.name) ?? BASE_ZONE_WORKERS) + 1);
        } else {
          artisanWS.unlockedSet.add(cheapest.name);
          artisanWorkers.set(cheapest.name, BASE_ZONE_WORKERS);
          artisanTimers.set(cheapest.name, 0);
          if (bestId) artisanWS.zoneProductMap.set(cheapest.name, bestId);
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
        const ct = CROPS[zc.cropId];
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
    if (s.artisanProductMap)  { artisanWS.zoneProductMap.clear();  Object.entries(s.artisanProductMap).forEach(([k, v])  => artisanWS.zoneProductMap.set(k, v)); }
    if (s.artisanProductStats) Object.entries(s.artisanProductStats).forEach(([k, v]) => { if (artisanWS.productStats.has(k)) Object.assign(artisanWS.productStats.get(k), v); });
    if (s.artisanInventory)  { artisanWS.productInventory.clear(); Object.entries(s.artisanInventory).forEach(([k, v])  => artisanWS.productInventory.set(k, v)); }
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
    unlockFarmZone(name) {
      const def = FARM_ZONE_DEFS.find(d => d.name === name);
      if (!def || gold.amount < def.cost) return false;
      gold.add(-def.cost);
      unlockedFarmZones.add(name);
      zoneAcres.set(name, BASE_ZONE_ACRES);
      zoneWorkers.set(name, BASE_ZONE_WORKERS);
      const cropId = [...zoneCrops.values()][0]?.cropType.id ?? 'strawberry';
      zoneCrops.set(name, new CropInstance(CROPS[cropId]));
      return true;
    },
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
    unlockArtisanZone(name) {
      const def = ARTISAN_ZONE_DEFS.find(d => d.name === name);
      if (!def || gold.amount < def.cost) return false;
      gold.add(-def.cost);
      artisanWS.unlockedSet.add(name);
      artisanWorkers.set(name, BASE_ZONE_WORKERS);
      artisanTimers.set(name, 0);
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
    assignCrop(zoneName, cropId) {
      if (!unlockedFarmZones.has(zoneName) || !CROPS[cropId]) return;
      zoneCrops.set(zoneName, new CropInstance(CROPS[cropId]));
    },
    assignArtisanProduct(zoneName, cropId) {
      if (!artisanWS.unlockedSet.has(zoneName) || !CROPS[cropId]) return;
      artisanWS.zoneProductMap.set(zoneName, cropId);
    },
    setAutoSell(key, value)  { if (value) autoSellSet.add(key); else autoSellSet.delete(key); },
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
