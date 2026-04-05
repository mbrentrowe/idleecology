// prestige.js — Meta-state manager for the ecoregion prestige system
// Manages cross-region state: unlocked regions, BP currency, region switching,
// and per-region save slots. Lives above the engine layer.

import { getRegion, REGIONS, DEFAULT_REGION_ID } from './regions/registry.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const META_SAVE_KEY = 'idle-eco-meta-v1';
const REGION_SAVE_PREFIX = 'idle-eco-region-';
const LEGACY_SAVE_KEY = 'idle-ecologist-text-v1';

/** Fraction of a region's collection that must be completed to prestige. */
export const PRESTIGE_THRESHOLD = 0.75;

// ── BP bonus scaling ──────────────────────────────────────────────────────────
// Diminishing returns: sqrt-based curve. 100 BP → 10× headstart, 400 BP → 20×.
// Returns a multiplier ≥ 1 applied to starting gold in new regions.
export function bpGoldMultiplier(totalBP) {
  if (totalBP <= 0) return 1;
  return 1 + Math.sqrt(totalBP) * 0.5;
}

// ── Collection score for a region ─────────────────────────────────────────────
// Measures how "complete" the player's progress is in a given region engine.
// Returns { current, max, fraction }.
export function regionCollectionScore(engine) {
  const rd = engine.regionData;
  if (!rd) return { current: 0, max: 1, fraction: 0 };

  // Plants established (each unique species = 1 point)
  const plantsEstablished = engine.plantedSpecies.size;
  const plantsMax = rd.plants.length;

  // Creatures discovered
  const creaturesDiscovered = engine.discoveredCreatures.size;
  const creaturesMax = new Set(
    rd.plants.flatMap(p => (p.insectsHosted ?? []).map(c =>
      c.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    ))
  ).size;

  // Birds attracted
  const birdsAttracted = engine.discoveredBirds.size;
  const birdsMax = rd.birdList.length;

  // Research completed
  const researchDone = engine.completedResearch.size;
  const researchMax = rd.research.length;

  // Invasives cleared (species with 0 acres)
  let invasivesCleared = 0;
  for (const inv of rd.invasives) {
    if ((engine.invasiveAcres.get(inv.id) ?? inv.baseAcres) <= 0) invasivesCleared++;
  }
  const invasivesMax = rd.invasives.length;

  const current = plantsEstablished + creaturesDiscovered + birdsAttracted + researchDone + invasivesCleared;
  const max = plantsMax + creaturesMax + birdsMax + researchMax + invasivesMax;

  return {
    current,
    max,
    fraction: max > 0 ? current / max : 0,
    breakdown: {
      plants:     { current: plantsEstablished,   max: plantsMax },
      creatures:  { current: creaturesDiscovered,  max: creaturesMax },
      birds:      { current: birdsAttracted,       max: birdsMax },
      research:   { current: researchDone,         max: researchMax },
      invasives:  { current: invasivesCleared,     max: invasivesMax },
    },
  };
}

// ── Meta-state ────────────────────────────────────────────────────────────────
// The meta-state is a small JSON object stored in localStorage alongside
// (but separate from) per-region engine saves.

/**
 * @typedef {Object} MetaState
 * @property {string}   currentRegionId    — active region
 * @property {string[]} unlockedRegionIds  — regions the player has access to
 * @property {number}   totalBP            — lifetime biosphere points earned
 * @property {Object<string,number>} regionBP — BP earned per region id
 * @property {Object<string,boolean>} prestiged — regions that have been prestiged
 */

/** Default meta-state for a new game. */
function defaultMeta() {
  return {
    currentRegionId:   DEFAULT_REGION_ID,
    unlockedRegionIds: [DEFAULT_REGION_ID],
    totalBP:           0,
    regionBP:          {},
    prestiged:         {},
  };
}

/** Load meta-state from localStorage, migrating legacy saves if needed. */
export function loadMeta() {
  const raw = localStorage.getItem(META_SAVE_KEY);
  if (raw) {
    try { return { ...defaultMeta(), ...JSON.parse(raw) }; } catch { /* fall through */ }
  }

  // Check for legacy save and migrate
  const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
  if (legacy) {
    // Legacy save exists — treat it as SE USA Plains region data
    const meta = defaultMeta();
    // Copy legacy save into the region-specific slot
    localStorage.setItem(regionSaveKey(DEFAULT_REGION_ID), legacy);
    saveMeta(meta);
    return meta;
  }

  // Brand new game
  return defaultMeta();
}

/** Persist meta-state. */
export function saveMeta(meta) {
  localStorage.setItem(META_SAVE_KEY, JSON.stringify(meta));
}

// ── Per-region save keys ──────────────────────────────────────────────────────
export function regionSaveKey(regionId) {
  return REGION_SAVE_PREFIX + regionId + '-v1';
}

// ── Region switching ──────────────────────────────────────────────────────────

/**
 * Switch to a different region.
 * - Saves the current engine state into its region slot
 * - Updates meta.currentRegionId
 * - Returns the new regionData (caller creates a new engine with it)
 *
 * @param {MetaState} meta
 * @param {object} currentEngine — the running engine instance
 * @param {string} targetRegionId — region to switch to
 * @returns {{ ok: boolean, regionData?: object, savedState?: object|null, reason?: string }}
 */
export function switchRegion(meta, currentEngine, targetRegionId) {
  if (!meta.unlockedRegionIds.includes(targetRegionId)) {
    return { ok: false, reason: 'region_locked' };
  }
  const targetRegion = getRegion(targetRegionId);
  if (!targetRegion) return { ok: false, reason: 'region_not_found' };

  // Save current region's engine state
  const currentState = currentEngine.getState();
  localStorage.setItem(regionSaveKey(meta.currentRegionId), JSON.stringify(currentState));

  // Update meta
  meta.currentRegionId = targetRegionId;
  saveMeta(meta);

  // Load saved state for target region (may be null for a fresh region)
  let savedState = null;
  const raw = localStorage.getItem(regionSaveKey(targetRegionId));
  if (raw) {
    try { savedState = JSON.parse(raw); } catch { /* start fresh */ }
  }

  return { ok: true, regionData: targetRegion, savedState };
}

// ── Prestige check ────────────────────────────────────────────────────────────

/**
 * Check if the player can prestige the current region.
 * Returns { canPrestige, score, threshold, nextRegionIds }.
 */
export function checkPrestige(meta, engine) {
  const score = regionCollectionScore(engine);
  const canPrestige = score.fraction >= PRESTIGE_THRESHOLD;

  // Determine which regions this would unlock
  const nextRegionIds = [];
  if (canPrestige) {
    for (const region of REGIONS) {
      if (meta.unlockedRegionIds.includes(region.id)) continue;
      if (region.prestigeRequires === engine.regionData.id) {
        nextRegionIds.push(region.id);
      }
    }
  }

  return {
    canPrestige,
    score,
    threshold: PRESTIGE_THRESHOLD,
    nextRegionIds,
  };
}

/**
 * Execute prestige for the current region.
 * Awards BP, unlocks adjacent regions.
 * Does NOT reset the current region — progress persists.
 *
 * @param {MetaState} meta
 * @param {object} engine
 * @returns {{ ok: boolean, bpAwarded: number, newRegions: string[], reason?: string }}
 */
export function executePrestige(meta, engine) {
  const check = checkPrestige(meta, engine);
  if (!check.canPrestige) {
    return { ok: false, bpAwarded: 0, newRegions: [], reason: 'threshold_not_met' };
  }

  const regionId = engine.regionData.id;

  // Calculate BP award based on collection score
  const bpAwarded = Math.floor(check.score.current);

  // Award BP
  meta.totalBP += bpAwarded;
  meta.regionBP[regionId] = (meta.regionBP[regionId] ?? 0) + bpAwarded;
  meta.prestiged[regionId] = true;

  // Unlock adjacent regions
  const newRegions = [];
  for (const rid of check.nextRegionIds) {
    if (!meta.unlockedRegionIds.includes(rid)) {
      meta.unlockedRegionIds.push(rid);
      newRegions.push(rid);
    }
  }

  saveMeta(meta);

  return { ok: true, bpAwarded, newRegions };
}

// ── Starting bonuses for a new/reset region ───────────────────────────────────

/**
 * Get headstart bonuses for entering a region based on total BP.
 * Applied when creating a new engine for a region.
 */
export function getStartingBonuses(meta) {
  return {
    startingGold: Math.floor(5000 * bpGoldMultiplier(meta.totalBP)),
    // Future: startingResearchPoints, speed bonuses, etc.
  };
}
