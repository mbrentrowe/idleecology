// game.js — pure game engine for the text-UI version of Idle Ecologist
// No DOM access. Exports createEngine() and zone definition arrays.

import { CROPS, CropInstance } from './crops.js';
import { WORK_ACTIVITIES }     from './activityRegistry.js';

// ── Constants ─────────────────────────────────────────────────────────────────
export const DAY_REAL_SECS = 240; // 4 real minutes = 1 in-game day
const SAVE_KEY             = 'idle-ecologist-text-v1';

// ── Zone definitions (no Tiled map needed) ────────────────────────────────────
export const FARM_ZONE_DEFS = [
  { name: 'FarmZone01', tileCount:  4, cost:          0 }, // starter, free
  { name: 'FarmZone02', tileCount:  4, cost:      10000 },
  { name: 'FarmZone03', tileCount:  6, cost:      20000 },
  { name: 'FarmZone04', tileCount:  6, cost:      30000 },
  { name: 'FarmZone05', tileCount:  9, cost:      50000 },
  { name: 'FarmZone06', tileCount:  9, cost:      70000 },
  { name: 'FarmZone07', tileCount:  9, cost:     100000 },
  { name: 'FarmZone08', tileCount: 12, cost:     150000 },
  { name: 'FarmZone09', tileCount: 12, cost:     200000 },
  { name: 'FarmZone10', tileCount: 12, cost:     300000 },
  { name: 'FarmZone11', tileCount: 16, cost:     500000 },
  { name: 'FarmZone12', tileCount: 16, cost:     750000 },
  { name: 'FarmZone13', tileCount: 20, cost:    1000000 },
  { name: 'FarmZone14', tileCount: 20, cost:    1500000 },
  { name: 'FarmZone15', tileCount: 25, cost:    2000000 },
];

export const ARTISAN_ZONE_DEFS = [
  { name: 'ArtisanZone01', cost:       75000 },
  { name: 'ArtisanZone02', cost:      225000 },
  { name: 'ArtisanZone03', cost:      675000 },
  { name: 'ArtisanZone04', cost:     2025000 },
  { name: 'ArtisanZone05', cost:     6075000 },
  { name: 'ArtisanZone06', cost:    18225000 },
  { name: 'ArtisanZone07', cost:    54675000 },
  { name: 'ArtisanZone08', cost:   164025000 },
  { name: 'ArtisanZone09', cost:   492075000 },
  { name: 'ArtisanZone10', cost:  1476225000 },
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
  const gold         = new Gold(50000);
  let   gameSpeed    = 1;
  let   autoPilot    = false;
  let   gamePaused   = false;
  let   calendarAccum = 0;
  let   inGameDay    = 1;
  const schedule     = { farming: 10, socializing: 6, sleeping: 8 };

  // ── Farm zones ──────────────────────────────────────────────────────────────
  const unlockedFarmZones = new Set(['FarmZone01']);
  const zoneCrops = new Map(); // zoneName → CropInstance
  zoneCrops.set('FarmZone01', new CropInstance(CROPS.strawberry));

  function farmTileCount(zoneName) {
    return FARM_ZONE_DEFS.find(d => d.name === zoneName)?.tileCount ?? 1;
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
    tickTimer:        0,
  };

  // ── Crop state ──────────────────────────────────────────────────────────────
  const cropInventory = new Map();
  const autoSellSet   = new Set(Object.keys(CROPS));
  const cropStats     = new Map();
  Object.keys(CROPS).forEach(id => cropStats.set(id, { grown: 0, sold: 0, lifetimeSales: 0 }));

  // ── Time tracking ───────────────────────────────────────────────────────────
  let totalFarmingHours     = 0;
  let totalSocializingHours = 0;
  let totalSleepingHours    = 0;

  // ── Schedule helpers ────────────────────────────────────────────────────────
  function schedSec(key) { return schedule[key] * (DAY_REAL_SECS / 24); }
  function isFarmingTime(acc)     { return acc < schedSec('farming'); }
  function isSocializingTime(acc) { const f = schedSec('farming'); return acc >= f && acc < f + schedSec('socializing'); }
  function isSleepingTime(acc)    { return !isFarmingTime(acc) && !isSocializingTime(acc); }

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
    const totalTiles = FARM_ZONE_DEFS.filter(d => unlockedFarmZones.has(d.name)).reduce((s, d) => s + d.tileCount, 0);
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
    if (candidates.length > 0) {
      const cheapest = candidates.reduce((a, b) => a.cost < b.cost ? a : b);
      if (gold.amount >= cheapest.cost) {
        gold.add(-cheapest.cost);
        if (cheapest.type === 'farm') {
          unlockedFarmZones.add(cheapest.name);
          if (bestId) zoneCrops.set(cheapest.name, new CropInstance(CROPS[bestId]));
        } else {
          artisanWS.unlockedSet.add(cheapest.name);
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

    const farming     = isFarmingTime(calendarAccum);
    const socializing = isSocializingTime(calendarAccum);
    const sleeping    = isSleepingTime(calendarAccum);
    const hpt         = gameSpeed * 24 / DAY_REAL_SECS;
    if (farming)     totalFarmingHours     += hpt;
    if (socializing) totalSocializingHours += hpt;
    if (sleeping)    totalSleepingHours    += hpt;

    // Crop growth
    if (farming) {
      for (const [zoneName, instance] of zoneCrops) {
        if (!unlockedFarmZones.has(zoneName)) continue;
        instance.tick(gameSpeed);
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

    // Artisan production (always active)
    artisanWS.tickTimer += gameSpeed;
    if (artisanWS.tickTimer >= artisanAct.productionIntervalSecs) {
      artisanWS.tickTimer -= artisanAct.productionIntervalSecs;
      const ctx = buildArtisanCtx();
      for (const zn of artisanWS.unlockedSet) {
        artisanAct.produce({ name: zn }, ctx);
      }
    }

    runAutoPilot();
  }

  // ── Offline simulation ──────────────────────────────────────────────────────
  function simulateOffline(realSecs) {
    const MAX_SECS  = 7200;
    const simSecs   = Math.min(realSecs, MAX_SECS);
    const goldBefore = gold.amount;
    let acc = artisanWS.tickTimer;
    let t = 0;
    while (t < simSecs) {
      t++;
      calendarAccum = (calendarAccum + 1) % DAY_REAL_SECS;
      if (isFarmingTime(calendarAccum)) {
        for (const [zoneName, instance] of zoneCrops) {
          if (!unlockedFarmZones.has(zoneName)) continue;
          instance.tick(1);
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
      acc++;
      while (acc >= artisanAct.productionIntervalSecs) {
        acc -= artisanAct.productionIntervalSecs;
        const ctx = buildArtisanCtx();
        for (const zn of artisanWS.unlockedSet) artisanAct.produce({ name: zn }, ctx);
      }
    }
    artisanWS.tickTimer = acc;
    return { goldEarned: gold.amount - goldBefore, simSecs, capped: realSecs > MAX_SECS };
  }

  // ── Save / Load ─────────────────────────────────────────────────────────────
  function getState() {
    return {
      gold: gold.amount, gameSpeed, autoPilot, schedule: { ...schedule },
      calendarAccum, inGameDay,
      unlockedFarmZones: [...unlockedFarmZones],
      unlockedArtisanZones: [...artisanWS.unlockedSet],
      zoneCrops: Object.fromEntries([...zoneCrops].map(([k, v]) => [k, { cropId: v.cropType.id, phase: v.phase, timer: v.timer }])),
      cropInventory: Object.fromEntries(cropInventory),
      autoSellSet: [...autoSellSet],
      cropStats: Object.fromEntries([...cropStats].map(([k, v]) => [k, { ...v }])),
      artisanProductMap: Object.fromEntries(artisanWS.zoneProductMap),
      artisanProductStats: Object.fromEntries(artisanWS.productStats),
      artisanInventory: Object.fromEntries(artisanWS.productInventory),
      totalFarmingHours, totalSocializingHours, totalSleepingHours,
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
    if (s.schedule) Object.assign(schedule, s.schedule);

    if (Array.isArray(s.unlockedFarmZones)) {
      unlockedFarmZones.clear();
      s.unlockedFarmZones.forEach(n => unlockedFarmZones.add(n));
    }
    if (Array.isArray(s.unlockedArtisanZones)) {
      artisanWS.unlockedSet.clear();
      s.unlockedArtisanZones.forEach(n => artisanWS.unlockedSet.add(n));
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
    if (typeof s.totalFarmingHours     === 'number') totalFarmingHours     = s.totalFarmingHours;
    if (typeof s.totalSocializingHours === 'number') totalSocializingHours = s.totalSocializingHours;
    if (typeof s.totalSleepingHours    === 'number') totalSleepingHours    = s.totalSleepingHours;
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
    schedule,
    CROPS,
    FARM_ZONE_DEFS,
    ARTISAN_ZONE_DEFS,
    unlockedFarmZones,
    artisanWS,
    zoneCrops,
    cropInventory,
    autoSellSet,
    cropStats,

    // Computed
    isFarmingTime:     () => isFarmingTime(calendarAccum),
    isSocializingTime: () => isSocializingTime(calendarAccum),
    isSleepingTime:    () => isSleepingTime(calendarAccum),
    getTotalGPS,
    cropEffectiveGPS,
    get totalFarmingHours()     { return totalFarmingHours;     },
    get totalSocializingHours() { return totalSocializingHours; },
    get totalSleepingHours()    { return totalSleepingHours;    },

    // Mutations (called from UI)
    unlockFarmZone(name) {
      const def = FARM_ZONE_DEFS.find(d => d.name === name);
      if (!def || gold.amount < def.cost) return false;
      gold.add(-def.cost);
      unlockedFarmZones.add(name);
      const cropId = [...zoneCrops.values()][0]?.cropType.id ?? 'strawberry';
      zoneCrops.set(name, new CropInstance(CROPS[cropId]));
      return true;
    },
    unlockArtisanZone(name) {
      const def = ARTISAN_ZONE_DEFS.find(d => d.name === name);
      if (!def || gold.amount < def.cost) return false;
      gold.add(-def.cost);
      artisanWS.unlockedSet.add(name);
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
    setScheduleHours(key, v) { schedule[key] = v; },

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
