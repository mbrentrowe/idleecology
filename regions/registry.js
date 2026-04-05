// regions/registry.js — Region registry for the prestige system
// Import each region bundle and expose a lookup API.

/**
 * @typedef {Object} RegionData
 * @property {string}  id
 * @property {string}  code           - EPA Level II code (e.g. '8.3')
 * @property {string}  name
 * @property {string}  label
 * @property {string}  icon
 * @property {string}  desc
 * @property {string}  hnpUrl
 * @property {string|null} prestigeRequires - region id required to unlock, or null
 * @property {string}  prestigeReward
 * @property {Array}   invasiveIds
 * @property {Array}   plants
 * @property {Array}   invasives
 * @property {Object}  invasiveMap
 * @property {number}  totalInvadedAcresBase
 * @property {Array}   birdList
 * @property {Object}  crops          - region-owned crop catalog keyed by crop id
 * @property {Object<string, Object|null>=} cropProfiles - legacy additive overrides; deprecated
 * @property {Array}   research
 * @property {Object}  ranchAnimals
 * @property {Array}   ranchAnimalList
 * @property {Array}   farmZoneDefs
 */

import SE_USA_PLAINS from './se_usa_plains.js';
import SE_USA_PLAINS_FIXTURE from './se_usa_plains_fixture.js';

/** All available regions, in unlock order. */
export const REGIONS = [
  SE_USA_PLAINS,
  SE_USA_PLAINS_FIXTURE,
];

/** Map region id → RegionData. */
const REGION_MAP = Object.fromEntries(REGIONS.map(r => [r.id, r]));

/** Map EPA code → region id. */
export const CODE_TO_REGION_ID = Object.fromEntries(REGIONS.map(r => [r.code, r.id]));

/** Look up a region by its id. */
export function getRegion(id) {
  return REGION_MAP[id] ?? null;
}

/** The default starting region (first in the list). */
export const DEFAULT_REGION_ID = REGIONS[0].id;
