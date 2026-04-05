// regions/se_usa_plains_fixture.js — Phase 1 fixture region for region-owned crop verification

import { CROPS, CropType }                              from '../crops.js';
import { RESEARCH }                                     from '../research.js';
import { ECOREGIONS }                                   from '../ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST }             from '../ranch.js';
import { BIRD_LIST }                                    from '../birds.js';
import { INVASIVES, INVASIVE_MAP, TOTAL_INVADED_ACRES } from '../invasives.js';

const eco = ECOREGIONS[0];
const { broccoli: _unusedBroccoli, ...fixtureBaseCrops } = CROPS;
const FIXTURE_CROPS = {
  ...fixtureBaseCrops,
  strawberry: new CropType({
    id: 'strawberry',
    name: 'Fixture Strawberry',
    sciName: CROPS.strawberry.sciName,
    growthPhaseGIDs: [...CROPS.strawberry.growthPhaseGIDs],
    growthPhaseNames: [...(CROPS.strawberry.growthPhaseNames ?? [])],
    growthTimePerPhase: 8,
    yieldGold: 31,
    marketIconGID: CROPS.strawberry.marketIconGID,
    unlockCriteria: CROPS.strawberry.unlockCriteria ? { ...CROPS.strawberry.unlockCriteria } : null,
    seasons: ['Spring', 'Summer'],
  }),
};

/** @type {import('./registry.js').RegionData} */
export default {
  id:               'se_usa_plains_fixture',
  code:             '8.3-fixture',
  name:             'SE USA Plains Fixture',
  label:            '8.3 Fixture – Region Crops',
  icon:             '🧪',
  desc:             'A verification region used to confirm region-owned crop catalogs and disabled crops behave correctly in the engine and UI.',
  hnpUrl:           eco.hnpUrl,
  prestigeRequires: 'se_usa_plains',
  prestigeReward:   'Phase 1 verification region for region-owned crop support',
  invasiveIds:      eco.invasiveIds,

  plants:                eco.plants,
  invasives:             INVASIVES,
  invasiveMap:           INVASIVE_MAP,
  totalInvadedAcresBase: TOTAL_INVADED_ACRES,
  birdList:              BIRD_LIST,
  crops:                 FIXTURE_CROPS,
  research:              RESEARCH,
  ranchAnimals:          RANCH_ANIMALS,
  ranchAnimalList:       RANCH_ANIMAL_LIST,

  farmZoneDefs: [
    { name: 'Fixture Strawberry Patch', cropId: 'strawberry',  cost:          0 },
    { name: 'Scallion Row',             cropId: 'greenOnion',  cost:      10000 },
    { name: 'Sweet Potato Beds',        cropId: 'potato',      cost:      20000 },
    { name: 'Okra Row',                 cropId: 'onion',       cost:      30000 },
    { name: 'Peanut Bottom',            cropId: 'carrot',      cost:      50000 },
    { name: 'Rabbiteye Thicket',        cropId: 'blueberry',   cost:      70000 },
    { name: 'Peach Orchard',            cropId: 'parsnip',     cost:     100000 },
    { name: 'Lettuce Glade',            cropId: 'lettuce',     cost:     150000 },
    { name: 'Collard Patch',            cropId: 'cauliflower', cost:     200000 },
    { name: 'Carolina Gold Paddies',    cropId: 'rice',        cost:     300000 },
    { name: 'Tomato Hill',              cropId: 'asparagus',   cost:     750000 },
    { name: 'Disabled Broccoli Field',  cropId: 'broccoli',    cost:     500000 },
  ],
};