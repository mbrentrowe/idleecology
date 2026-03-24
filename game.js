// game.js — pure game engine for the text-UI version of Idle Ecologist
// No DOM access. Exports createEngine() and zone definition arrays.

import { CROPS, CropInstance } from './crops.js';
import { WORK_ACTIVITIES }     from './activityRegistry.js';
import { RESEARCH }            from './research.js';
import { ECOREGIONS, findPlant } from './ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST } from './ranch.js';

// ── Constants ─────────────────────────────────────────────────────────────────
export const YEAR_REAL_SECS = 8 * 3600;             // 8 real hours = 1 in-game year
export const DAY_REAL_SECS  = YEAR_REAL_SECS / 365; // ≈78.9 real seconds = 1 in-game day
const SAVE_KEY              = 'idle-ecologist-text-v1';

// ── Calendar ──────────────────────────────────────────────────────────────────
/** Gregorian-style month table (no leap years — always 365 days). */
export const CALENDAR_MONTHS = [
  { name: 'January',   abbr: 'Jan', days: 31 },
  { name: 'February',  abbr: 'Feb', days: 28 },
  { name: 'March',     abbr: 'Mar', days: 31 },
  { name: 'April',     abbr: 'Apr', days: 30 },
  { name: 'May',       abbr: 'May', days: 31 },
  { name: 'June',      abbr: 'Jun', days: 30 },
  { name: 'July',      abbr: 'Jul', days: 31 },
  { name: 'August',    abbr: 'Aug', days: 31 },
  { name: 'September', abbr: 'Sep', days: 30 },
  { name: 'October',   abbr: 'Oct', days: 31 },
  { name: 'November',  abbr: 'Nov', days: 30 },
  { name: 'December',  abbr: 'Dec', days: 31 },
];

/**
 * Seasons defined by their start day-of-year (1-indexed, based on standard
 * equinox/solstice dates).  Each season is ~2 real hours at DAY_REAL_SECS pace.
 *   Spring  Mar 20 → doy  79   (~93 days, ~2h02m)
 *   Summer  Jun 21 → doy 172   (~93 days, ~2h02m)
 *   Fall    Sep 22 → doy 265   (~90 days, ~1h58m)
 *   Winter  Dec 21 → doy 355   (~89 days, ~1h57m)
 */
export const SEASONS = [
  { name: 'Spring', emoji: '🌸', startDoy: 79  },
  { name: 'Summer', emoji: '☀️', startDoy: 172 },
  { name: 'Fall',   emoji: '🍂', startDoy: 265 },
  { name: 'Winter', emoji: '❄️', startDoy: 355 },
];

/**
 * Convert a monotonic in-game day number (1-based) into a full calendar date.
 * @param {number} totalDays  engine.inGameDay
 * @returns {{ year, dayOfYear, monthIdx, day, month, season }}
 *   year      — 1-based year number
 *   dayOfYear — 1-365
 *   monthIdx  — 0-11 index into CALENDAR_MONTHS
 *   day       — 1-based day within the month
 *   month     — CALENDAR_MONTHS entry
 *   season    — SEASONS entry
 */
export function calendarDate(totalDays) {
  const year     = Math.floor((totalDays - 1) / 365) + 1;
  const dayOfYear = ((totalDays - 1) % 365) + 1;

  // Resolve month + day-of-month
  let remaining = dayOfYear;
  let monthIdx  = 0;
  for (let i = 0; i < CALENDAR_MONTHS.length; i++) {
    if (remaining <= CALENDAR_MONTHS[i].days) { monthIdx = i; break; }
    remaining -= CALENDAR_MONTHS[i].days;
  }

  // Resolve season (latest season whose startDoy ≤ dayOfYear, wrapping for winter)
  let season = SEASONS[3]; // default winter (covers Jan 1 – Mar 19)
  for (let i = SEASONS.length - 1; i >= 0; i--) {
    if (dayOfYear >= SEASONS[i].startDoy) { season = SEASONS[i]; break; }
  }

  return { year, dayOfYear, monthIdx, day: remaining, month: CALENDAR_MONTHS[monthIdx], season };
}

// ── Zone definitions (no Tiled map needed) ────────────────────────────────────
export const BASE_ZONE_ACRES   = 1;
export const BASE_ZONE_WORKERS = 1;
export const TICKS_PER_SEC     = 4; // setInterval fires every 250ms

/** Speed multiplier for a zone with w workers: 1× at 1 worker, 4× at 10. */
export function workerMultiplier(w) { return 1 + (w - 1) / 3; }

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
  { name: 'Strawberry Patch',      cropId: 'strawberry',  cost:          0 }, // starter
  { name: 'Scallion Row',          cropId: 'greenOnion',  cost:      10000 },
  { name: 'Sweet Potato Beds',     cropId: 'potato',      cost:      20000 },
  { name: 'Okra Row',              cropId: 'onion',       cost:      30000 },
  { name: 'Peanut Bottom',         cropId: 'carrot',      cost:      50000 },
  { name: 'Rabbiteye Thicket',     cropId: 'blueberry',   cost:      70000 },
  { name: 'Peach Orchard',         cropId: 'parsnip',     cost:     100000 },
  { name: 'Lettuce Glade',         cropId: 'lettuce',     cost:     150000 },
  { name: 'Collard Patch',         cropId: 'cauliflower', cost:     200000 },
  { name: 'Carolina Gold Paddies', cropId: 'rice',        cost:     300000 },
  { name: 'Broccoli Field',        cropId: 'broccoli',    cost:     500000 },
  { name: 'Tomato Hill',           cropId: 'asparagus',   cost:     750000 },
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
  { name: 'The Jam House',             cropId: 'strawberry',  cost:        75000 },
  { name: 'The Brine Shed',            cropId: 'greenOnion',  cost:       225000 },
  { name: 'The Sweet Potato Cellar',   cropId: 'potato',      cost:       675000 },
  { name: 'The Pickle Barrel',         cropId: 'onion',       cost:      2025000 },
  { name: 'The Peanut Mill',           cropId: 'carrot',      cost:      6075000 },
  { name: 'The Berry Press',           cropId: 'blueberry',   cost:     18225000 },
  { name: 'The Peach Smokehouse',      cropId: 'parsnip',     cost:     54675000 },
  { name: 'The Leaf Works',            cropId: 'lettuce',     cost:    164025000 },
  { name: 'The Greens Cannery',        cropId: 'cauliflower', cost:    492075000 },
  { name: 'The Rice Mill',             cropId: 'rice',        cost:   1476225000 },
  { name: 'The Brassica Works',        cropId: 'broccoli',    cost:   4428675000 },
  { name: 'The Tomato Works',          cropId: 'asparagus',   cost:  13286025000 },
];

// ── Land system constants ─────────────────────────────────────────────────────
export const STARTING_LAND_ACRES         = 50;  // acres owned at game start
export const ESTABLISH_DAYS              = 2;   // in-game days to establish one acre
export const LAND_MARKET_INTERVAL_DAYS   = 14;  // in-game days between market parcels
export const HABITAT_RISK_BASE_PCT       = 0.02;  // 2% daily creature-loss chance after removal
export const HABITAT_RISK_INCREMENT      = 0.005; // +0.5% per additional in-game day at risk
export const HABITAT_RISK_MAX_PCT        = 0.30;  // cap at 30%

/** Maps all historical zone names → current SE USA Plains names for save migration.
 *  Single-pass lookup — all intermediate names point directly to the final SE name.
 */
export const ZONE_NAME_MIGRATION = {
  // ── Farm zones: original generic names → SE names ──────────────────────────
  'Sunflower Patch':            'Strawberry Patch',
  'Clover Corner':              'Scallion Row',
  'Buttercup Field':            'Sweet Potato Beds',
  'Willowbrook Plot':           'Okra Row',
  'Mossy Hollow':               'Peanut Bottom',
  'Foxglove Run':               'Rabbiteye Thicket',
  'Hawthorn Strip':             'Peach Orchard',
  'Ember Meadow':               'Lettuce Glade',
  'Brackenfold':                'Collard Patch',
  'Ironwood Terrace':           'Carolina Gold Paddies',
  'Stonegate Field':            'Broccoli Field',
  'Copperleaf Plot':            'Tomato Hill',
  // ── Farm zones: previous crop-specific names → SE names ────────────────────
  'Strawberry Glen':            'Strawberry Patch',
  'Scallion Strip':             'Scallion Row',
  'Spud Furrows':               'Sweet Potato Beds',
  'Onion Dell':                 'Okra Row',
  'Carrot Hollow':              'Peanut Bottom',
  'Blueberry Thicket':          'Rabbiteye Thicket',
  'Parsnip Heath':              'Peach Orchard',
  'Cauliflower Terrace':        'Collard Patch',
  'Rice Paddies':               'Carolina Gold Paddies',
  'Broccoli Stand':             'Broccoli Field',
  'Asparagus Spire':            'Tomato Hill',
  // ── Artisan zones: original generic names → SE names ───────────────────────
  'The Potting Shed':           'The Jam House',
  'Oakwood Workshop':           'The Brine Shed',
  'Hearthside Cellar':          'The Sweet Potato Cellar',
  'Millstone Hall':             'The Pickle Barrel',
  'The Smokehouse':             'The Peanut Mill',
  'Coppergate Works':           'The Berry Press',
  'Ironbell Distillery':        'The Peach Smokehouse',
  'Harvestmoon Press':          'The Leaf Works',
  'The Grand Cooperage':        'The Greens Cannery',
  "Elder & Sons Manufactory":   'The Rice Mill',
  'Stonebridge Fermentary':     'The Brassica Works',
  'The Celestial Vault':        'The Tomato Works',
  // ── Artisan zones: previous crop-specific names → SE names ─────────────────
  'The Berry Press':            'The Jam House',      // was strawberry artisan
  'The Pickle House':           'The Brine Shed',
  'The Root Cellar':            'The Sweet Potato Cellar',
  'The Brine Works':            'The Pickle Barrel',
  'The Carrot Dryer':           'The Peanut Mill',
  'The Berry Winery':           'The Berry Press',    // blueberry artisan
  'The Parsnip Still':          'The Peach Smokehouse',
  'The Floret House':           'The Greens Cannery',
  'The Asparagus Cellar':       'The Tomato Works',
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
  let   autoPilotMode = 'economy'; // 'economy' | 'conservation'
  let   gamePaused   = false;
  let   calendarAccum  = 0;
  let   inGameDay      = SEASONS[0].startDoy; // start on first day of Spring (Mar 20)
  let   lastSeasonName = calendarDate(SEASONS[0].startDoy).season.name; // always 'Spring'

  // ── Research state ────────────────────────────────────────────────────────
  let   researchPoints      = 0;
  let   researchAccum       = 0;   // sub-point accumulator
  let   activeResearchId    = null;
  let   activeResearchTimer = 0;   // elapsed in-game days
  const completedResearch    = new Set();

  // ── Native Garden / Ecoregion state ──────────────────────────────────────
  const plantedSpecies      = new Set(); // plant IDs with ≥1 established acre
  const plantedSpeciesAcres = new Map(); // plantId → established acre count
  // Legacy single-slot planting (kept for save migration; replaced by nativeEstablishQueue)
  let   activePlantingId    = null;
  let   activePlantingTimer = 0;

  // ── Land pool state ───────────────────────────────────────────────────────
  let totalLandAcres = STARTING_LAND_ACRES;
  // Per-type establishing queues — each item = 1 acre, ~ESTABLISH_DAYS each
  const cropEstablishQueue   = []; // [{zoneName}]
  const ranchEstablishQueue  = []; // [{animalId}]
  const nativeEstablishQueue = []; // [{plantId}]
  let cropEstablishTimer   = 0;    // elapsed real-seconds for in-progress item
  let ranchEstablishTimer  = 0;
  let nativeEstablishTimer = 0;
  // Habitat-risk state for creatures whose host plant acres have been removed
  const habitatRiskCreatures = new Map(); // ckey → {daysAtRisk, riskPct}
  // Land market
  const landMarket        = [];  // [{id, acres, cost}]
  let nextMarketDripDay   = LAND_MARKET_INTERVAL_DAYS;
  let _landMarketNextId   = 1;

  // ── Creature discovery state ──────────────────────────────────────────────
  // Each insect/wildlife in ecoregion plants is discovered via daily rolls.
  // Pity timer guarantees discovery within CREATURE_PITY_DAYS days of opportunity.
  const CREATURE_PITY_DAYS  = 1825; // 5 in-game years
  const CREATURE_BASE_CHANCE = 0.02; // 2% per day base; ramps to 100% at pity max
  const discoveredCreatures  = new Set();  // creature keys
  const creaturePity          = new Map();  // creatureKey → days of opportunity elapsed
  const creatureDiscoveryLog  = new Map();  // creatureKey → inGameDay when first discovered

  /** Stable key for a creature, based on its name only (plant-independent). */
  function creatureKey(creatureName) {
    return creatureName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  // Reverse lookup: creature slug → array of plantIds that host it (built once)
  const creatureHostPlants = new Map();
  for (const _heco of ECOREGIONS) {
    for (const _hplant of _heco.plants) {
      for (const _hc of (_hplant.insectsHosted ?? [])) {
        const _hck = creatureKey(_hc.name);
        const _harr = creatureHostPlants.get(_hck);
        if (_harr) _harr.push(_hplant.id);
        else creatureHostPlants.set(_hck, [_hplant.id]);
      }
    }
  }

  // ── Farm zones ──────────────────────────────────────────────────────────────
  const unlockedFarmZones = new Set(); // populated by checkAutoUnlocks()
  const zoneCrops   = new Map(); // zoneName → CropInstance
  const zoneAcres   = new Map(); // zoneName → current acres
  const zoneWorkers = new Map(); // zoneName → worker count

  function farmTileCount(zoneName) {
    return zoneAcres.get(zoneName) ?? 0;
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

  // ── Ranch state ────────────────────────────────────────────────────────────
  const unlockedRanchAnimals = new Set(); // animal IDs
  const ranchAcres   = new Map(); // animalId → acres
  const ranchWorkers = new Map(); // animalId → worker count
  const ranchTimers  = new Map(); // animalId → production timer
  const ranchStats   = new Map(); // animalId → { produced, sold, lifetimeSales }
  RANCH_ANIMAL_LIST.forEach(a => ranchStats.set(a.id, { produced: 0, sold: 0, lifetimeSales: 0 }));

  function checkRanchUnlocks() {
    const totalSold = Array.from(cropStats.values()).reduce((s, v) => s + v.sold, 0);
    for (const animal of RANCH_ANIMAL_LIST) {
      if (unlockedRanchAnimals.has(animal.id)) continue;
      if (totalSold >= animal.unlockCriteria.totalSold) {
        unlockedRanchAnimals.add(animal.id);
        // acres are allocated from the land pool — not auto-granted
        if (!ranchWorkers.has(animal.id)) ranchWorkers.set(animal.id, BASE_ZONE_WORKERS);
      }
    }
  }

  // ── Crop state ──────────────────────────────────────────────────────────────
  const cropInventory = new Map();
  const autoSellSet   = new Set(Object.keys(CROPS));
  const cropStats     = new Map();
  Object.keys(CROPS).forEach(id => cropStats.set(id, { grown: 0, sold: 0, lifetimeSales: 0 }));

  // ── Gold multiplier from Biosphere Points ───────────────────────────────────
  // Scales from 1× (0 BP) to 5× (all BP unlocked) using a power-1.5 curve.
  const MAX_BP = RESEARCH.reduce((s, r) => s + (r.effect?.biosphereBonus ?? 0), 0)
               + ECOREGIONS.flatMap(e => e.plants).reduce((s, p) => s + (p.biosphereBonus ?? 0), 0)
               + new Set(ECOREGIONS.flatMap(e => e.plants).flatMap(p => (p.insectsHosted ?? []).map(c => creatureKey(c.name)))).size;

  function goldMultiplier() {
    if (MAX_BP <= 0) return 1;
    const currentBP = [...completedResearch].reduce((sum, id) => {
      const r = RESEARCH.find(p => p.id === id);
      return sum + (r?.effect?.biosphereBonus ?? 0);
    }, 0) + [...plantedSpeciesAcres.entries()].reduce((sum, [id, acres]) => {
      const result = findPlant(id);
      return sum + (result?.plant?.biosphereBonus ?? 0) * acres;
    }, 0) + discoveredCreatures.size;
    const t = currentBP / MAX_BP;
    return 1 + 4 * Math.pow(t, 1.5);
  }

  // ── Artisan context builder ─────────────────────────────────────────────────
  function buildArtisanCtx() {
    return {
      zoneProductMap:        artisanWS.zoneProductMap,
      cropInventory, cropStats,
      productStats:          artisanWS.productStats,
      productInventory:      artisanWS.productInventory,
      autoSellSet, gold, CROPS,
      goldMultiplier: goldMultiplier(),
      gameSpeed,
      productionIntervalSecs: artisanAct.productionIntervalSecs,
    };
  }

  // ── Land pool helpers ─────────────────────────────────────────────────────────
  function getAllocatedAcres() {
    let n = 0;
    for (const v of zoneAcres.values())          n += v;
    for (const v of ranchAcres.values())         n += v;
    for (const v of plantedSpeciesAcres.values()) n += v;
    n += cropEstablishQueue.length;
    n += ranchEstablishQueue.length;
    n += nativeEstablishQueue.length;
    return n;
  }
  function getFreeAcres() { return totalLandAcres - getAllocatedAcres(); }

  function _generateMarketParcel() {
    // Size & cost scale with how many parcels the player already owns
    const size = Math.min(5, 1 + Math.floor(totalLandAcres / 20));
    const cost = Math.round(Math.max(5000, 2000 * totalLandAcres) * size * (0.8 + Math.random() * 0.4));
    return { id: _landMarketNextId++, acres: size, cost };
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
        // Starter zone (cost 0) gets 1 free acre from the land pool on first unlock
        if (def.cost === 0 && !zoneAcres.has(def.name)) zoneAcres.set(def.name, BASE_ZONE_ACRES);
        // All other zones start with 0 acres — player allocates from pool
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
      if (!ct.isInSeason(lastSeasonName)) continue; // dormant — no earnings
      const ap  = ct.artisanProduct;
      const cyc = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
      if (cyc <= 0) continue;
      const tc = farmTileCount(zoneName);
      const wm  = workerMultiplier(zoneWorkers.get(zoneName) ?? BASE_ZONE_WORKERS);
      const holdRaw = ap
        && (cropStats.get(ct.id)?.sold ?? 0) >= ap.unlockCropSold
        && [...artisanWS.unlockedSet].some(zn => artisanWS.zoneProductMap.get(zn) === ct.id);
      if (!holdRaw && autoSellSet.has(ct.id)) gps += (ct.yieldGold * tc * wm * TICKS_PER_SEC) / cyc;
    }
    for (const zn of artisanWS.unlockedSet) {
      gps += artisanAct.getGPS(
        { name: zn },
        { zoneProductMap: artisanWS.zoneProductMap, cropStats, autoSellSet, gameSpeed, CROPS,
          productionIntervalSecs: artisanAct.productionIntervalSecs }
      );
    }
    for (const animalId of unlockedRanchAnimals) {
      const animal = RANCH_ANIMALS[animalId];
      if (!animal) continue;
      const acres = ranchAcres.get(animalId) ?? 0;
      if (acres <= 0) continue;
      const wm    = workerMultiplier(ranchWorkers.get(animalId) ?? BASE_ZONE_WORKERS);
      gps += (animal.goldPerCycle * acres * wm * goldMultiplier() * TICKS_PER_SEC) / animal.productionIntervalSecs;
    }
    return gps;
  }

  // ── Auto-pilot ──────────────────────────────────────────────────────────────
  // ── Auto-pilot sub-routines ─────────────────────────────────────────────────

  /** Route crops to artisan workshops when unlocked; otherwise auto-sell raw. */
  function _apSellRouting() {
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
  }

  /** Buy cheapest available worker upgrade across farm + artisan zones. */
  function _apWorkerUpgrades() {
    const candidates = [];
    for (const def of FARM_ZONE_DEFS) {
      if (!unlockedFarmZones.has(def.name)) continue;
      const cur = zoneWorkers.get(def.name) ?? BASE_ZONE_WORKERS;
      candidates.push({ type: 'farmWorker', name: def.name, cost: workerUpgradeCost(def, cur) });
    }
    for (const def of ARTISAN_ZONE_DEFS) {
      if (!artisanWS.unlockedSet.has(def.name)) continue;
      const cur = artisanWorkers.get(def.name) ?? BASE_ZONE_WORKERS;
      candidates.push({ type: 'artisanWorker', name: def.name, cost: workerUpgradeCost(def, cur) });
    }
    for (const animalId of unlockedRanchAnimals) {
      const animal = RANCH_ANIMALS[animalId];
      if (!animal) continue;
      const cur = ranchWorkers.get(animalId) ?? BASE_ZONE_WORKERS;
      candidates.push({ type: 'ranchWorker', animalId, cost: workerUpgradeCost({ cost: animal.baseCost }, cur) });
    }
    if (candidates.length === 0) return;
    const cheapest = candidates.reduce((a, b) => a.cost < b.cost ? a : b);
    if (gold.amount >= cheapest.cost) {
      gold.add(-cheapest.cost);
      if (cheapest.type === 'farmWorker') {
        zoneWorkers.set(cheapest.name, (zoneWorkers.get(cheapest.name) ?? BASE_ZONE_WORKERS) + 1);
      } else if (cheapest.type === 'artisanWorker') {
        artisanWorkers.set(cheapest.name, (artisanWorkers.get(cheapest.name) ?? BASE_ZONE_WORKERS) + 1);
      } else {
        ranchWorkers.set(cheapest.animalId, (ranchWorkers.get(cheapest.animalId) ?? BASE_ZONE_WORKERS) + 1);
      }
    }
  }

  /**
   * Allocate free acres to zones.
   * Economy: fill farm zones round-robin first (one acre to the zone with fewest
   *   allocated+queued), then ranch animals similarly.
   * Conservation: ensure every unlocked farm zone has ≥1 acre (for CP income),
   *   then prefer native plants with 0 established/queued acres, then fill farms.
   */
  function _apAcreAllocation() {
    const free = getFreeAcres();
    if (free <= 0) return;

    if (autoPilotMode === 'conservation') {
      // 1. First ensure every unlocked farm zone has ≥1 acre
      for (const def of FARM_ZONE_DEFS) {
        if (getFreeAcres() <= 0) return;
        if (!unlockedFarmZones.has(def.name)) continue;
        const allocated = (zoneAcres.get(def.name) ?? 0)
          + cropEstablishQueue.filter(i => i.zoneName === def.name).length;
        if (allocated === 0) {
          cropEstablishQueue.push({ zoneName: def.name });
        }
      }
      // 2. Native plants with 0 acres and prereqs met (sorted cheapest CP cost first)
      const plantCandidates = [];
      for (const eco of ECOREGIONS) {
        for (const plant of eco.plants) {
          if (getFreeAcres() <= 0) return;
          const established = plantedSpeciesAcres.get(plant.id) ?? 0;
          const queued = nativeEstablishQueue.filter(i => i.plantId === plant.id).length;
          if (established > 0 || queued > 0) continue;
          if (!(plant.requiresResearch ?? []).every(rid => completedResearch.has(rid))) continue;
          if (researchPoints < plant.cost) continue;
          plantCandidates.push(plant);
        }
      }
      plantCandidates.sort((a, b) => a.cost - b.cost);
      for (const plant of plantCandidates) {
        if (getFreeAcres() <= 0) return;
        // Deduct CP cost for the first acre
        researchPoints -= plant.cost;
        nativeEstablishQueue.push({ plantId: plant.id });
      }
      // 3. Fill any remaining free acres into farm zones (fewest-first)
    }

    // Economy: fill farm zones (fewest allocated+queued first), then ranch
    // Conservation: also fill farms after native plants
    if (getFreeAcres() > 0 && unlockedFarmZones.size > 0) {
      const farmList = [...unlockedFarmZones].map(name => ({
        name,
        total: (zoneAcres.get(name) ?? 0) + cropEstablishQueue.filter(i => i.zoneName === name).length,
      })).sort((a, b) => a.total - b.total);
      for (const zone of farmList) {
        if (getFreeAcres() <= 0) break;
        cropEstablishQueue.push({ zoneName: zone.name });
      }
    }

    if (autoPilotMode === 'economy' && getFreeAcres() > 0 && unlockedRanchAnimals.size > 0) {
      const ranchList = [...unlockedRanchAnimals].map(id => ({
        id,
        total: (ranchAcres.get(id) ?? 0) + ranchEstablishQueue.filter(i => i.animalId === id).length,
      })).sort((a, b) => a.total - b.total);
      for (const animal of ranchList) {
        if (getFreeAcres() <= 0) break;
        ranchEstablishQueue.push({ animalId: animal.id });
      }
    }
  }

  /** Buy cheapest land parcel when gold is at least 3× the parcel cost (safety buffer). */
  function _apLandMarket() {
    if (landMarket.length === 0) return;
    const cheapest = landMarket.reduce((a, b) => a.cost < b.cost ? a : b);
    if (gold.amount >= cheapest.cost * 3) {
      gold.add(-cheapest.cost);
      totalLandAcres += cheapest.acres;
      const idx = landMarket.indexOf(cheapest);
      if (idx >= 0) landMarket.splice(idx, 1);
    }
  }

  /** Auto-start the cheapest affordable research project with all prerequisites met. */
  function _apResearch() {
    if (activeResearchId) return;
    const affordable = RESEARCH.filter(r =>
      !completedResearch.has(r.id) &&
      r.requires.every(req => completedResearch.has(req)) &&
      researchPoints >= r.cost
    );
    if (affordable.length === 0) return;
    const cheapest = affordable.reduce((a, b) => a.cost < b.cost ? a : b);
    researchPoints     -= cheapest.cost;
    activeResearchId    = cheapest.id;
    activeResearchTimer = 0;
  }

  /**
   * Queue first acres for native plants that are:
   *  - Not yet established or queued
   *  - Have all requiresResearch prerequisites met
   *  - Have enough CP available
   * Habitat-risk species are prioritised first.
   */
  function _apNativePlanting() {
    if (getFreeAcres() <= 0) return;
    // Collect all plants worth queueing
    const candidates = [];
    for (const eco of ECOREGIONS) {
      for (const plant of eco.plants) {
        const established = plantedSpeciesAcres.get(plant.id) ?? 0;
        const queued = nativeEstablishQueue.filter(i => i.plantId === plant.id).length;
        if (established > 0 || queued > 0) continue;
        if (!(plant.requiresResearch ?? []).every(rid => completedResearch.has(rid))) continue;
        if (researchPoints < plant.cost) continue;
        // Priority: habitat-risk creatures hosted by this plant come first
        const hosting = [...habitatRiskCreatures.keys()].some(ckey => {
          const pids = creatureHostPlants.get(ckey) ?? [];
          return pids.includes(plant.id);
        });
        candidates.push({ plant, priority: hosting ? 0 : 1 });
      }
    }
    candidates.sort((a, b) => a.priority - b.priority || a.plant.cost - b.plant.cost);
    for (const { plant } of candidates) {
      if (getFreeAcres() <= 0) return;
      if (researchPoints < plant.cost) continue;
      researchPoints -= plant.cost;
      nativeEstablishQueue.push({ plantId: plant.id });
    }
  }

  function runAutoPilot() {
    if (!autoPilot) return;
    _apSellRouting();
    _apWorkerUpgrades();
    _apLandMarket();
    _apAcreAllocation();
    if (autoPilotMode === 'conservation') {
      _apResearch();
      _apNativePlanting();
    }
  }

  // ── Habitat-loss event (overridable from UI layer) ───────────────────────
  // The UI can set engine.onCreatureExtirpated to a function(ckey) for notifications.
  let _onCreatureExtirpated = (ckey) => { /* default: no-op; UI overrides this */ };

  // ── Season transitions ─────────────────────────────────────────────────────
  function onSeasonChange(oldSeason, newSeason) {
    for (const [zoneName, instance] of zoneCrops) {
      if (!unlockedFarmZones.has(zoneName)) continue;
      const ct = instance.cropType;
      if (ct.isInSeason(oldSeason) && !ct.isInSeason(newSeason)) {
        // End of this crop's growing season — harvest if ready, then freeze
        const tc = farmTileCount(zoneName);
        if (instance.isFullyGrown && tc > 0) {
          const id = ct.id;
          const s  = cropStats.get(id);
          s.grown += tc;
          if (autoSellSet.has(id)) {
            const earned = ct.yieldGold * tc * goldMultiplier();
            gold.add(earned);
            s.sold += tc;
            s.lifetimeSales += earned;
          } else {
            cropInventory.set(id, (cropInventory.get(id) || 0) + tc);
          }
        }
        instance.harvest(); // reset phase=0, timer=0 — zone is now dormant
      }
    }
  }

  // ── Main tick ───────────────────────────────────────────────────────────────
  function tick() {
    if (gamePaused) return;
    const _gMult = goldMultiplier(); // compute once; reused for all harvests this tick

    calendarAccum += gameSpeed;
    if (calendarAccum >= DAY_REAL_SECS) {
      calendarAccum -= DAY_REAL_SECS;
      inGameDay++;
      const newSeason = calendarDate(inGameDay).season.name;
      if (newSeason !== lastSeasonName) {
        onSeasonChange(lastSeasonName, newSeason);
        lastSeasonName = newSeason;
      }
    }

    // Crop growth
    {
      for (const [zoneName, instance] of zoneCrops) {
        if (!unlockedFarmZones.has(zoneName)) continue;
        if (!instance.cropType.isInSeason(lastSeasonName)) continue; // dormant
        const tc = farmTileCount(zoneName);
        if (tc <= 0) continue; // no land allocated — pause growth
        const wm = workerMultiplier(zoneWorkers.get(zoneName) ?? BASE_ZONE_WORKERS);
        instance.tick(gameSpeed * wm);
        if (instance.isFullyGrown) {
          const id    = instance.cropType.id;
          const s     = cropStats.get(id);
          s.grown    += tc;
          if (autoSellSet.has(id)) {
            const earned = instance.cropType.yieldGold * tc * _gMult;
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

    // Ranch animal production
    for (const animalId of unlockedRanchAnimals) {
      const animal = RANCH_ANIMALS[animalId];
      if (!animal) continue;
      const wm = workerMultiplier(ranchWorkers.get(animalId) ?? BASE_ZONE_WORKERS);
      let t = (ranchTimers.get(animalId) ?? 0) + gameSpeed * wm;
      const acres = ranchAcres.get(animalId) ?? 0;
      if (acres <= 0) { ranchTimers.set(animalId, 0); continue; }
      while (t >= animal.productionIntervalSecs) {
        t -= animal.productionIntervalSecs;
        const earned = animal.goldPerCycle * acres * _gMult;
        gold.add(earned);
        const st = ranchStats.get(animalId);
        if (st) { st.produced += acres; st.sold += acres; st.lifetimeSales += earned; }
      }
      ranchTimers.set(animalId, t);
    }

    // Research point generation (1 pt per unlocked farm zone per in-game day)
    {
      researchAccum += gameSpeed * unlockedFarmZones.size / DAY_REAL_SECS;
      if (researchAccum >= 1) {
        const earned   = Math.floor(researchAccum);
        researchPoints += earned;
        researchAccum  -= earned;
      }
      if (activeResearchId) {
        const project = RESEARCH.find(r => r.id === activeResearchId);
        if (project) {
          activeResearchTimer += gameSpeed / DAY_REAL_SECS;
          if (activeResearchTimer >= project.duration) {
            completedResearch.add(activeResearchId);
            activeResearchId    = null;
            activeResearchTimer = 0;
          }
        }
      }
    }

    // ── Establishing queues (per-type, one acre at a time) ─────────────────────
    const ESTABLISH_SECS = ESTABLISH_DAYS * DAY_REAL_SECS;
    if (cropEstablishQueue.length > 0) {
      cropEstablishTimer += gameSpeed;
      while (cropEstablishTimer >= ESTABLISH_SECS && cropEstablishQueue.length > 0) {
        cropEstablishTimer -= ESTABLISH_SECS;
        const { zoneName } = cropEstablishQueue.shift();
        if (unlockedFarmZones.has(zoneName)) {
          zoneAcres.set(zoneName, (zoneAcres.get(zoneName) ?? 0) + 1);
          if (!zoneCrops.has(zoneName)) zoneCrops.set(zoneName, new CropInstance(CROPS[FARM_ZONE_DEFS.find(d => d.name === zoneName)?.cropId]));
        }
      }
    }
    if (ranchEstablishQueue.length > 0) {
      ranchEstablishTimer += gameSpeed;
      while (ranchEstablishTimer >= ESTABLISH_SECS && ranchEstablishQueue.length > 0) {
        ranchEstablishTimer -= ESTABLISH_SECS;
        const { animalId } = ranchEstablishQueue.shift();
        if (unlockedRanchAnimals.has(animalId)) {
          ranchAcres.set(animalId, (ranchAcres.get(animalId) ?? 0) + 1);
        }
      }
    }
    if (nativeEstablishQueue.length > 0) {
      nativeEstablishTimer += gameSpeed;
      while (nativeEstablishTimer >= ESTABLISH_SECS && nativeEstablishQueue.length > 0) {
        nativeEstablishTimer -= ESTABLISH_SECS;
        const { plantId } = nativeEstablishQueue.shift();
        const newCount = (plantedSpeciesAcres.get(plantId) ?? 0) + 1;
        plantedSpeciesAcres.set(plantId, newCount);
        plantedSpecies.add(plantId); // keep Set in sync for legacy checks
      }
    }

    // Native planting timer (legacy migration — runs until activePlantingId is cleared)
    if (activePlantingId) {
      const result = findPlant(activePlantingId);
      if (result) {
        activePlantingTimer += gameSpeed / DAY_REAL_SECS;
        if (activePlantingTimer >= result.plant.duration) {
          // Migrate to new plantedSpeciesAcres
          const newCount = (plantedSpeciesAcres.get(activePlantingId) ?? 0) + 1;
          plantedSpeciesAcres.set(activePlantingId, newCount);
          plantedSpecies.add(activePlantingId);
          activePlantingId    = null;
          activePlantingTimer = 0;
        }
      }
    }

    // Creature discovery rolls (once per in-game day)
    if (calendarAccum < gameSpeed) { // true only on the tick where calendarAccum just rolled over
      // Aggregate total acres per unique creature across all planted host plants
      const _creatureAcresMap = new Map(); // ckey → total acres of all host plants
      for (const [plantId, acres] of plantedSpeciesAcres) {
        const result = findPlant(plantId);
        if (!result) continue;
        for (const creature of (result.plant.insectsHosted ?? [])) {
          const ckey = creatureKey(creature.name);
          if (discoveredCreatures.has(ckey)) continue;
          _creatureAcresMap.set(ckey, (_creatureAcresMap.get(ckey) ?? 0) + acres);
        }
      }
      // Roll once per unique creature — more host-plant acres = faster discovery
      for (const [ckey, totalAcres] of _creatureAcresMap) {
        const pity = creaturePity.get(ckey) ?? 0;
        const pityGain = Math.min(totalAcres, 3); // cap bonus at 3×
        const chance = Math.min(1, CREATURE_BASE_CHANCE + (pity / CREATURE_PITY_DAYS) * (1 - CREATURE_BASE_CHANCE));
        if (Math.random() < chance) {
          discoveredCreatures.add(ckey);
          creatureDiscoveryLog.set(ckey, inGameDay);
        } else {
          creaturePity.set(ckey, pity + pityGain);
        }
      }

      // ── Habitat risk rolls (once per in-game day) ───────────────────────────
      for (const [ckey, risk] of habitatRiskCreatures) {
        if (!discoveredCreatures.has(ckey)) { habitatRiskCreatures.delete(ckey); continue; }
        // Cancel risk if ANY host plant has been re-established
        const _hostPids = creatureHostPlants.get(ckey) ?? [];
        if (_hostPids.some(pid => (plantedSpeciesAcres.get(pid) ?? 0) > 0)) { habitatRiskCreatures.delete(ckey); continue; }
        const newDays = risk.daysAtRisk + 1;
        const newPct  = Math.min(HABITAT_RISK_MAX_PCT, HABITAT_RISK_BASE_PCT + newDays * HABITAT_RISK_INCREMENT);
        if (Math.random() < newPct) {
          discoveredCreatures.delete(ckey);
          creaturePity.delete(ckey);
          habitatRiskCreatures.delete(ckey);
          _onCreatureExtirpated(ckey);
        } else {
          habitatRiskCreatures.set(ckey, { daysAtRisk: newDays, riskPct: newPct });
        }
      }

      // ── Land market drip (once per in-game day) ────────────────────────────
      if (inGameDay >= nextMarketDripDay) {
        nextMarketDripDay = inGameDay + LAND_MARKET_INTERVAL_DAYS;
        if (landMarket.length < 3) landMarket.push(_generateMarketParcel());
      }
    }

    runAutoPilot();
    checkAutoUnlocks();
    checkRanchUnlocks();
  }

  // ── Offline simulation ──────────────────────────────────────────────────────
  function simulateOffline(realSecs) {
    const MAX_SECS  = 7200;
    const daysBefore = inGameDay;

    // ── Season-eve cap: stop the sim the day before a season change ─────────
    const curCal = calendarDate(inGameDay);
    const curDoy  = curCal.dayOfYear;
    const curYear = curCal.year;
    // Find the upcoming season (the one we want to stop before entering)
    let nextSeasonObj  = SEASONS.find(s => s.startDoy > curDoy);
    let nextSeasonYear = curYear;
    if (!nextSeasonObj) {
      // Past the last season start of this year — next is Spring of year+1
      nextSeasonObj  = SEASONS[0];
      nextSeasonYear = curYear + 1;
    }
    const eveDoy    = nextSeasonObj.startDoy - 1;
    const eveAbsDay = (nextSeasonYear - 1) * 365 + eveDoy;
    // Real seconds needed to reach and complete the eve day
    const cutoffSecs = eveAbsDay > inGameDay
      ? Math.max(0, Math.ceil(((eveAbsDay - inGameDay) * DAY_REAL_SECS - calendarAccum) / TICKS_PER_SEC))
      : 0; // already at or past the eve
    const simSecs = Math.min(realSecs, MAX_SECS, cutoffSecs > 0 ? cutoffSecs : 0);
    // Pause-at-season-eve: sim was cut short by the eve cap or we opened right on the eve
    const pausedAtSeasonEve = cutoffSecs === 0 || (cutoffSecs < realSecs && cutoffSecs <= MAX_SECS);

    const goldBefore = gold.amount;
    const simTimers = new Map(artisanTimers);
    const simRanchTimers = new Map(ranchTimers);
    let offlineSeason = lastSeasonName;
    // Each loop iteration = 1 real second. Live tick fires every 250ms (4/sec),
    // so we advance 4 units per second to match the live rate.
    const TICKS_PER_SEC_LOCAL = TICKS_PER_SEC;
    let t = 0;
    while (t < simSecs) {
      t++;
      calendarAccum += TICKS_PER_SEC_LOCAL;
      while (calendarAccum >= DAY_REAL_SECS) {
        calendarAccum -= DAY_REAL_SECS;
        inGameDay++;
        const newSeason = calendarDate(inGameDay).season.name;
        if (newSeason !== offlineSeason) {
          onSeasonChange(offlineSeason, newSeason);
          offlineSeason = newSeason;
        }
      }
      const _offMult = goldMultiplier();
      {
        for (const [zoneName, instance] of zoneCrops) {
          if (!unlockedFarmZones.has(zoneName)) continue;
          if (!instance.cropType.isInSeason(offlineSeason)) continue; // dormant
          const tc = farmTileCount(zoneName);
          if (tc <= 0) continue; // no land allocated — pause growth
          const wm = workerMultiplier(zoneWorkers.get(zoneName) ?? BASE_ZONE_WORKERS);
          instance.tick(wm * TICKS_PER_SEC_LOCAL);
          if (instance.isFullyGrown) {
            const id = instance.cropType.id;
            const s  = cropStats.get(id);
            s.grown += tc;
            if (autoSellSet.has(id)) {
              const earned = instance.cropType.yieldGold * tc * _offMult;
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
        let acc = (simTimers.get(zn) ?? 0) + wm * TICKS_PER_SEC_LOCAL;
        while (acc >= artisanAct.productionIntervalSecs) {
          acc -= artisanAct.productionIntervalSecs;
          artisanAct.produce({ name: zn }, ctx);
        }
        simTimers.set(zn, acc);
      }
      // Ranch animal production (offline)
      for (const animalId of unlockedRanchAnimals) {
        const animal = RANCH_ANIMALS[animalId];
        if (!animal) continue;
        const wm = workerMultiplier(ranchWorkers.get(animalId) ?? BASE_ZONE_WORKERS);
        const acres = ranchAcres.get(animalId) ?? 0;
        let acc = (simRanchTimers.get(animalId) ?? 0) + (acres > 0 ? wm * TICKS_PER_SEC_LOCAL : 0);
        while (acc >= animal.productionIntervalSecs) {
          acc -= animal.productionIntervalSecs;
          const earned = animal.goldPerCycle * acres * _offMult;
          gold.add(earned);
          const st = ranchStats.get(animalId);
          if (st) { st.produced += acres; st.sold += acres; st.lifetimeSales += earned; }
        }
        simRanchTimers.set(animalId, acc);
      }
      // Auto-pilot decisions during offline time (once per simulated second)
      if (autoPilot) runAutoPilot();
    }
    lastSeasonName = offlineSeason;
    for (const [k, v] of simTimers)      artisanTimers.set(k, v);
    for (const [k, v] of simRanchTimers) ranchTimers.set(k, v);
    // Always pause after offline sync — player reviews state then resumes manually
    gamePaused = true;
    return {
      goldEarned: gold.amount - goldBefore,
      simSecs,
      capped: realSecs > MAX_SECS,
      pausedAtSeasonEve,
      nextSeason:      nextSeasonObj.name,
      nextSeasonEmoji: nextSeasonObj.emoji,
      daysAdvanced:    inGameDay - daysBefore,
    };
  }

  // ── Save / Load ─────────────────────────────────────────────────────────────
  function getState() {
    return {
      gold: gold.amount, autoPilot, autoPilotMode,
      calendarAccum, inGameDay, lastSeasonName,
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
      researchPoints, researchAccum,
      activeResearchId, activeResearchTimer,
      completedResearch:    [...completedResearch],
      plantedSpecies:       [...plantedSpecies],
      plantedSpeciesAcres:  Object.fromEntries(plantedSpeciesAcres),
      activePlantingId,     activePlantingTimer,
      discoveredCreatures:   [...discoveredCreatures],
      creaturePity:          Object.fromEntries(creaturePity),
      creatureDiscoveryLog:  Object.fromEntries(creatureDiscoveryLog),
      ranchAnimals:         [...unlockedRanchAnimals],
      ranchAcres:           Object.fromEntries(ranchAcres),
      ranchWorkers:         Object.fromEntries(ranchWorkers),
      ranchTimers:          Object.fromEntries(ranchTimers),
      ranchStats:           Object.fromEntries([...ranchStats].map(([k, v]) => [k, { ...v }])),
      // Land pool
      totalLandAcres,
      cropEstablishQueue:   cropEstablishQueue.map(i => ({ ...i })),
      ranchEstablishQueue:  ranchEstablishQueue.map(i => ({ ...i })),
      nativeEstablishQueue: nativeEstablishQueue.map(i => ({ ...i })),
      cropEstablishTimer, ranchEstablishTimer, nativeEstablishTimer,
      habitatRiskCreatures: Object.fromEntries([...habitatRiskCreatures].map(([k, v]) => [k, { ...v }])),
      landMarket:           landMarket.map(p => ({ ...p })),
      nextMarketDripDay,    _landMarketNextId,
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
    // gameSpeed is intentionally NOT restored — always resets to 1× on load
    if (typeof s.autoPilot    === 'boolean') autoPilot     = s.autoPilot;
    if (typeof s.autoPilotMode === 'string' && (s.autoPilotMode === 'economy' || s.autoPilotMode === 'conservation')) autoPilotMode = s.autoPilotMode;
    if (typeof s.calendarAccum === 'number') calendarAccum = s.calendarAccum;
    if (typeof s.inGameDay    === 'number')  inGameDay     = s.inGameDay;
    lastSeasonName = (typeof s.lastSeasonName === 'string') ? s.lastSeasonName : calendarDate(inGameDay).season.name;

    if (Array.isArray(s.unlockedFarmZones)) {
      unlockedFarmZones.clear();
      s.unlockedFarmZones.forEach(n => unlockedFarmZones.add(n));
    }
    if (s.zoneAcres) {
      zoneAcres.clear();
      Object.entries(s.zoneAcres).forEach(([k, v]) => zoneAcres.set(k, v));
      // Only fill in missing STARTER zone — others start at 0 until allocated
      for (const n of unlockedFarmZones) {
        const def = FARM_ZONE_DEFS.find(d => d.name === n);
        if (def?.cost === 0 && !zoneAcres.has(n)) zoneAcres.set(n, BASE_ZONE_ACRES);
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
    if (typeof s.researchPoints      === 'number')  researchPoints      = s.researchPoints;
    if (typeof s.researchAccum       === 'number')  researchAccum       = s.researchAccum;
    if ('activeResearchId' in s)                    activeResearchId    = s.activeResearchId;
    if (typeof s.activeResearchTimer === 'number')  activeResearchTimer = s.activeResearchTimer;
    if (Array.isArray(s.completedResearch)) {
      completedResearch.clear();
      s.completedResearch.forEach(id => completedResearch.add(id));
    }
    if (Array.isArray(s.plantedSpecies)) {
      plantedSpecies.clear();
      s.plantedSpecies.forEach(id => plantedSpecies.add(id));
    }
    // New land system: restore plantedSpeciesAcres; migrate old saves that only have plantedSpecies
    plantedSpeciesAcres.clear();
    if (s.plantedSpeciesAcres) {
      Object.entries(s.plantedSpeciesAcres).forEach(([k, v]) => {
        plantedSpeciesAcres.set(k, v);
        plantedSpecies.add(k); // keep Set in sync
      });
    } else if (Array.isArray(s.plantedSpecies)) {
      // Migration: each previously-planted plant gets 1 ace
      s.plantedSpecies.forEach(id => plantedSpeciesAcres.set(id, 1));
    }
    if ('activePlantingId'    in s) activePlantingId    = s.activePlantingId;
    if (typeof s.activePlantingTimer === 'number') activePlantingTimer = s.activePlantingTimer;
    // Migrate old-format ckeys: "plantId__creature_slug" → "creature_slug"
    const _migrateKey = k => k.includes('__') ? k.substring(k.indexOf('__') + 2) : k;
    if (Array.isArray(s.discoveredCreatures)) {
      discoveredCreatures.clear();
      s.discoveredCreatures.forEach(k => discoveredCreatures.add(_migrateKey(k)));
    }
    if (s.creaturePity) {
      creaturePity.clear();
      Object.entries(s.creaturePity).forEach(([k, v]) => creaturePity.set(_migrateKey(k), Math.max(v, creaturePity.get(_migrateKey(k)) ?? 0)));
    }
    if (s.creatureDiscoveryLog) {
      creatureDiscoveryLog.clear();
      Object.entries(s.creatureDiscoveryLog).forEach(([k, v]) => { const mk = _migrateKey(k); if (!creatureDiscoveryLog.has(mk)) creatureDiscoveryLog.set(mk, v); });
    }
    if (Array.isArray(s.ranchAnimals)) {
      unlockedRanchAnimals.clear();
      s.ranchAnimals.forEach(id => unlockedRanchAnimals.add(id));
    }
    if (s.ranchAcres)   { ranchAcres.clear();   Object.entries(s.ranchAcres).forEach(([k, v])   => ranchAcres.set(k, v)); }
    if (s.ranchWorkers) { ranchWorkers.clear(); Object.entries(s.ranchWorkers).forEach(([k, v]) => ranchWorkers.set(k, v)); }
    if (s.ranchTimers)  { ranchTimers.clear();  Object.entries(s.ranchTimers).forEach(([k, v])  => ranchTimers.set(k, v)); }
    if (s.ranchStats)   Object.entries(s.ranchStats).forEach(([id, rs]) => { if (ranchStats.has(id)) Object.assign(ranchStats.get(id), rs); });

    // ── Land pool restore / migration ──────────────────────────────────────
    cropEstablishQueue.length   = 0;
    ranchEstablishQueue.length  = 0;
    nativeEstablishQueue.length = 0;
    if (Array.isArray(s.cropEstablishQueue))   s.cropEstablishQueue.forEach(i   => cropEstablishQueue.push({ ...i }));
    if (Array.isArray(s.ranchEstablishQueue))  s.ranchEstablishQueue.forEach(i  => ranchEstablishQueue.push({ ...i }));
    if (Array.isArray(s.nativeEstablishQueue)) s.nativeEstablishQueue.forEach(i => nativeEstablishQueue.push({ ...i }));
    if (typeof s.cropEstablishTimer   === 'number') cropEstablishTimer   = s.cropEstablishTimer;
    if (typeof s.ranchEstablishTimer  === 'number') ranchEstablishTimer  = s.ranchEstablishTimer;
    if (typeof s.nativeEstablishTimer === 'number') nativeEstablishTimer = s.nativeEstablishTimer;
    habitatRiskCreatures.clear();
    if (s.habitatRiskCreatures) Object.entries(s.habitatRiskCreatures).forEach(([k, v]) => habitatRiskCreatures.set(_migrateKey(k), { ...v }));
    landMarket.length = 0;
    if (Array.isArray(s.landMarket)) s.landMarket.forEach(p => landMarket.push({ ...p }));
    if (typeof s.nextMarketDripDay  === 'number') nextMarketDripDay  = s.nextMarketDripDay;
    if (typeof s._landMarketNextId  === 'number') _landMarketNextId  = s._landMarketNextId;
    if (typeof s.totalLandAcres     === 'number') {
      totalLandAcres = s.totalLandAcres;
    } else {
      // Migration: derive totalLandAcres from existing allocations + starting buffer
      const existingCrop   = s.zoneAcres    ? Object.values(s.zoneAcres).reduce((a, b) => a + b, 0) : 0;
      const existingRanch  = s.ranchAcres   ? Object.values(s.ranchAcres).reduce((a, b) => a + b, 0) : 0;
      const existingNative = Array.isArray(s.plantedSpecies) ? s.plantedSpecies.length : 0;
      totalLandAcres = existingCrop + existingRanch + existingNative + STARTING_LAND_ACRES;
    }

    checkAutoUnlocks(); // re-derive zoneProductMap and catch any new unlocks
    checkRanchUnlocks();
  }

  function clearSave() { localStorage.removeItem(SAVE_KEY); }

  // ── Exposed API ─────────────────────────────────────────────────────────────
  return {
    // Live state (read-only references)
    gold,
    get gameSpeed()    { return gameSpeed;    },
    get gamePaused()   { return gamePaused;   },
    get autoPilot()    { return autoPilot;    },
    get autoPilotMode(){ return autoPilotMode; },
    get calendarAccum()     { return calendarAccum;  },
    get inGameDay()         { return inGameDay;       },
    get currentSeasonName() { return lastSeasonName;  },
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
    // Ranch API
    get unlockedRanchAnimals() { return unlockedRanchAnimals; },
    ranchAcres,
    ranchWorkers,
    ranchStats,
    upgradeRanchAcres(animalId) {
      const animal  = RANCH_ANIMALS[animalId];
      const current = ranchAcres.get(animalId) ?? 1;
      if (!animal || !unlockedRanchAnimals.has(animalId)) return false;
      const cost = acreUpgradeCost({ cost: animal.baseCost }, current);
      if (gold.amount < cost) return false;
      gold.add(-cost);
      ranchAcres.set(animalId, current + 1);
      return true;
    },
    upgradeRanchWorkers(animalId) {
      const animal  = RANCH_ANIMALS[animalId];
      const current = ranchWorkers.get(animalId) ?? BASE_ZONE_WORKERS;
      if (!animal || !unlockedRanchAnimals.has(animalId)) return false;
      const cost = workerUpgradeCost({ cost: animal.baseCost }, current);
      if (gold.amount < cost) return false;
      gold.add(-cost);
      ranchWorkers.set(animalId, current + 1);
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
    setPaused(v)             { gamePaused = v; },
    setAutoPilot(v)          { autoPilot = v; },
    setAutoPilotMode(v)      { if (v === 'economy' || v === 'conservation') autoPilotMode = v; },

    // Research
    get researchPoints()      { return researchPoints; },
    get activeResearchId()    { return activeResearchId; },
    get activeResearchTimer() { return activeResearchTimer; },
    completedResearch,
    getBiosphereScore() {
      return [...completedResearch].reduce((sum, id) => {
        const r = RESEARCH.find(p => p.id === id);
        return sum + (r?.effect?.biosphereBonus ?? 0);
      }, 0);
    },
    getGardenBiosphereScore() {
      // Each established acre of a plant contributes its biosphereBonus
      return [...plantedSpeciesAcres.entries()].reduce((sum, [id, acres]) => {
        const result = findPlant(id);
        return sum + (result?.plant?.biosphereBonus ?? 0) * acres;
      }, 0);
    },
    getCreatureBiosphereScore() {
      return discoveredCreatures.size; // 1 BP per discovered creature
    },
    getTotalBiosphereScore() {
      return this.getBiosphereScore() + this.getGardenBiosphereScore() + this.getCreatureBiosphereScore();
    },
    getGoldMultiplier() { return goldMultiplier(); },
    get maxBiosphereScore() { return MAX_BP; },
    // Creature discovery API
    discoveredCreatures,
    creaturePity,
    creatureDiscoveryLog,
    creatureKey,
    get CREATURE_PITY_DAYS() { return CREATURE_PITY_DAYS; },
    // Native Garden API
    get plantedSpecies()        { return plantedSpecies; },
    get plantedSpeciesAcres()   { return plantedSpeciesAcres; },
    get activePlantingId()      { return activePlantingId; },
    get activePlantingTimer()   { return activePlantingTimer; },
    // Legacy startPlanting — kept for save-migration path; use queueNativeAcre for new plants
    startPlanting(plantId) {
      if (activePlantingId) return { ok: false, reason: 'already_active' };
      const result = findPlant(plantId);
      if (!result) return { ok: false, reason: 'not_found' };
      if (plantedSpecies.has(plantId)) return { ok: false, reason: 'already_planted' };
      if (researchPoints < result.plant.cost) return { ok: false, reason: 'insufficient_pts' };
      if (getFreeAcres() < 1) return { ok: false, reason: 'no_free_acres' };
      researchPoints     -= result.plant.cost;
      activePlantingId    = plantId;
      activePlantingTimer = 0;
      return { ok: true };
    },
    cancelPlanting() {
      if (!activePlantingId) return;
      const result = findPlant(activePlantingId);
      if (result) researchPoints += result.plant.cost;
      activePlantingId    = null;
      activePlantingTimer = 0;
    },
    ECOREGIONS,
    findPlant,

    // ── Land pool API ──────────────────────────────────────────────────────────
    get totalLandAcres()        { return totalLandAcres; },
    get landMarket()            { return landMarket; },
    get cropEstablishQueue()    { return cropEstablishQueue; },
    get ranchEstablishQueue()   { return ranchEstablishQueue; },
    get nativeEstablishQueue()  { return nativeEstablishQueue; },
    get cropEstablishTimer()    { return cropEstablishTimer; },
    get ranchEstablishTimer()   { return ranchEstablishTimer; },
    get nativeEstablishTimer()  { return nativeEstablishTimer; },
    get habitatRiskCreatures()  { return habitatRiskCreatures; },
    getAllocatedAcres,
    getFreeAcres,
    set onCreatureExtirpated(fn) { _onCreatureExtirpated = fn; },

    buyLandParcel(parcelId) {
      const idx = landMarket.findIndex(p => p.id === parcelId);
      if (idx < 0) return false;
      const parcel = landMarket[idx];
      if (gold.amount < parcel.cost) return false;
      gold.add(-parcel.cost);
      totalLandAcres += parcel.acres;
      landMarket.splice(idx, 1);
      return true;
    },

    /** Queue N acres from the pool to a crop zone. Returns actual queued count. */
    queueCropAcre(zoneName, qty = 1) {
      if (!unlockedFarmZones.has(zoneName)) return 0;
      const free = getFreeAcres();
      const n = Math.min(qty, free);
      if (n <= 0) return 0;
      for (let i = 0; i < n; i++) cropEstablishQueue.push({ zoneName });
      return n;
    },

    /** Queue N acres from the pool to a ranch animal. Returns actual queued count. */
    queueRanchAcre(animalId, qty = 1) {
      if (!unlockedRanchAnimals.has(animalId)) return 0;
      const free = getFreeAcres();
      const n = Math.min(qty, free);
      if (n <= 0) return 0;
      for (let i = 0; i < n; i++) ranchEstablishQueue.push({ animalId });
      return n;
    },

    /**
     * Queue N acres for a native plant. First acre also deducts the CP cost.
     * Returns {ok, queued, reason}.
     */
    queueNativeAcre(plantId, qty = 1) {
      const result = findPlant(plantId);
      if (!result) return { ok: false, queued: 0, reason: 'not_found' };
      const free = getFreeAcres();
      const n = Math.min(qty, free);
      if (n <= 0) return { ok: false, queued: 0, reason: 'no_free_acres' };
      // Deduct CP cost only on the very first acre of this plant species
      const isFirstAcre = (plantedSpeciesAcres.get(plantId) ?? 0) === 0
                        && !nativeEstablishQueue.some(i => i.plantId === plantId)
                        && activePlantingId !== plantId;
      if (isFirstAcre) {
        if (researchPoints < result.plant.cost) return { ok: false, queued: 0, reason: 'insufficient_pts' };
        researchPoints -= result.plant.cost;
      }
      for (let i = 0; i < n; i++) nativeEstablishQueue.push({ plantId });
      return { ok: true, queued: n };
    },

    /** Immediately return 1 acre from a crop zone back to the pool. */
    deallocateCropAcre(zoneName) {
      const current = zoneAcres.get(zoneName) ?? 0;
      if (current <= 0) return false;
      const newVal = current - 1;
      if (newVal === 0) zoneAcres.delete(zoneName);
      else              zoneAcres.set(zoneName, newVal);
      return true;
    },

    /** Cancel the next queued crop-acre for a zone (before it establishes). */
    cancelCropQueueItem(zoneName) {
      const idx = cropEstablishQueue.findIndex(i => i.zoneName === zoneName);
      if (idx < 0) return false;
      cropEstablishQueue.splice(idx, 1);
      if (cropEstablishQueue.length === 0) cropEstablishTimer = 0;
      return true;
    },

    /** Immediately return 1 acre from a ranch animal back to the pool. */
    deallocateRanchAcre(animalId) {
      const current = ranchAcres.get(animalId) ?? 0;
      if (current <= 0) return false;
      const newVal = current - 1;
      if (newVal === 0) ranchAcres.delete(animalId);
      else              ranchAcres.set(animalId, newVal);
      return true;
    },

    /** Cancel the next queued ranch-acre for an animal. */
    cancelRanchQueueItem(animalId) {
      const idx = ranchEstablishQueue.findIndex(i => i.animalId === animalId);
      if (idx < 0) return false;
      ranchEstablishQueue.splice(idx, 1);
      if (ranchEstablishQueue.length === 0) ranchEstablishTimer = 0;
      return true;
    },

    /**
     * Remove N established acres of a native plant. Triggers habitat risk for
     * associated creatures if the last acre of that plant is removed.
     * Returns actual removed count.
     */
    deallocateNativeAcre(plantId, qty = 1) {
      const current = plantedSpeciesAcres.get(plantId) ?? 0;
      const removing = Math.min(qty, current);
      if (removing <= 0) return 0;
      const newCount = current - removing;
      if (newCount === 0) {
        plantedSpeciesAcres.delete(plantId);
        plantedSpecies.delete(plantId);
        // Trigger habitat risk for all discovered creatures on this plant
        const result = findPlant(plantId);
        for (const creature of (result?.plant?.insectsHosted ?? [])) {
          const ckey = creatureKey(creature.name);
          if (!discoveredCreatures.has(ckey) || habitatRiskCreatures.has(ckey)) continue;
          // Only trigger risk if no other host plant still has established acres
          const _hostPids = creatureHostPlants.get(ckey) ?? [];
          const _hasOtherHost = _hostPids.some(pid => pid !== plantId && (plantedSpeciesAcres.get(pid) ?? 0) > 0);
          if (!_hasOtherHost) {
            habitatRiskCreatures.set(ckey, { daysAtRisk: 0, riskPct: HABITAT_RISK_BASE_PCT });
          }
        }
      } else {
        plantedSpeciesAcres.set(plantId, newCount);
      }
      return removing;
    },

    /** Cancel the next queued native-acre for a plant. Refunds CP if it was the first. */
    cancelNativeQueueItem(plantId) {
      const idx = nativeEstablishQueue.findIndex(i => i.plantId === plantId);
      if (idx < 0) return false;
      // Refund CP only if this was the first-ever queued acre and plant isn't established yet
      const isFirst = (plantedSpeciesAcres.get(plantId) ?? 0) === 0
                    && nativeEstablishQueue.filter(i => i.plantId === plantId).length === 1;
      if (isFirst) {
        const result = findPlant(plantId);
        if (result) researchPoints += result.plant.cost;
      }
      nativeEstablishQueue.splice(idx, 1);
      if (nativeEstablishQueue.length === 0) nativeEstablishTimer = 0;
      return true;
    },
    startResearch(id) {
      if (activeResearchId) return false;
      const project = RESEARCH.find(r => r.id === id);
      if (!project || completedResearch.has(id)) return false;
      if (researchPoints < project.cost) return false;
      if (project.requires.some(req => !completedResearch.has(req))) return false;
      researchPoints     -= project.cost;
      activeResearchId    = id;
      activeResearchTimer = 0;
      return true;
    },
    cancelResearch() {
      if (!activeResearchId) return;
      const project = RESEARCH.find(r => r.id === activeResearchId);
      if (project) researchPoints += project.cost;
      activeResearchId    = null;
      activeResearchTimer = 0;
    },

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
