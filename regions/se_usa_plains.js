// regions/se_usa_plains.js — Region data bundle for SE USA Plains (8.3)
// Aggregates all data modules that define this ecoregion's gameplay content.
// Each region bundle exports the same shape so createEngine() can accept any.

import { CROPS }                                       from '../crops.js';
import { RESEARCH }                                    from '../research.js';
import { ECOREGIONS }                                  from '../ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST }            from '../ranch.js';
import { BIRD_LIST }                                   from '../birds.js';
import { INVASIVES, INVASIVE_MAP, TOTAL_INVADED_ACRES } from '../invasives.js';

const eco = ECOREGIONS[0]; // SE USA Plains is the first (and currently only) ecoregion

/** @type {import('./registry.js').RegionData} */
export default {
  // ── Identity (from ecoregions.js entry) ───────────────────────────────────
  id:               eco.id,
  code:             eco.code,
  name:             eco.name,
  label:            eco.label,
  icon:             eco.icon,
  desc:             eco.desc,
  hnpUrl:           eco.hnpUrl,
  prestigeRequires: eco.prestigeRequires,
  prestigeReward:   eco.prestigeReward,
  invasiveIds:      eco.invasiveIds,

  // ── Per-region datasets ───────────────────────────────────────────────────
  plants:                eco.plants,
  invasives:             INVASIVES,
  invasiveMap:           INVASIVE_MAP,
  totalInvadedAcresBase: TOTAL_INVADED_ACRES,
  birdList:              BIRD_LIST,
  crops:                 CROPS,
  research:              RESEARCH,
  ranchAnimals:          RANCH_ANIMALS,
  ranchAnimalList:       RANCH_ANIMAL_LIST,

  // Farm zone definitions — region-specific crop names and unlock costs
  farmZoneDefs: [
    { name: 'Strawberry Patch',      cropId: 'strawberry',  cost:          0 },
    { name: 'Scallion Row',          cropId: 'greenOnion',  cost:      10000 },
    { name: 'Sweet Potato Beds',     cropId: 'potato',      cost:      20000 },
    { name: 'Okra Row',              cropId: 'onion',       cost:      30000 },
    { name: 'Peanut Bottom',         cropId: 'carrot',      cost:      50000 },
    { name: 'Rabbiteye Thicket',     cropId: 'blueberry',   cost:      70000 },
    { name: 'Peach Orchard',         cropId: 'parsnip',     cost:     100000 },
    { name: 'Lettuce Glade',         cropId: 'lettuce',     cost:     100000 },
    { name: 'Collard Patch',         cropId: 'cauliflower', cost:     200000 },
    { name: 'Carolina Gold Paddies', cropId: 'rice',        cost:     300000 },
    { name: 'Broccoli Field',        cropId: 'broccoli',    cost:     500000 },
    { name: 'Tomato Hill',           cropId: 'asparagus',   cost:     750000 },
  ],
};
