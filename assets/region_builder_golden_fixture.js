const playableScenario = {
  id: 'playable-hosted-fauna',
  label: 'Playable hosted-fauna fixture',
  inputs: {
    region: {
      id: 'golden_hosted_fauna_fixture',
      code: '0.0-fixture',
      name: 'Golden Hosted Fauna Fixture',
      label: '0.0 Fixture - Golden Hosted Fauna',
      icon: 'G',
      desc: 'Builder fixture for hosted fauna coverage.',
      hnpUrl: 'https://example.test/fixture',
    },
    ebirdRegion: 'US-FIX',
    plants: [
      {
        common_name: 'Wild Strawberry',
        scientific_name: 'Fragaria virginiana',
        growth_habit: 'Forb',
        edible_parts: ['fruit'],
        height: '0.5',
        bloom_time: 'Spring',
        description: 'Low native groundcover with edible fruit.',
      },
      {
        common_name: 'Black Cherry',
        scientific_name: 'Prunus serotina',
        growth_habit: 'Tree',
        edible_parts: ['fruit'],
        height: '35',
        bloom_time: 'Spring',
        description: 'Native tree supporting many insects and birds.',
      },
    ],
    birds: [
      {
        comName: 'Carolina Wren',
        sciName: 'Thryothorus ludovicianus',
        familyComName: 'Wrens',
      },
      {
        comName: 'Ruby-throated Hummingbird',
        sciName: 'Archilochus colubris',
        familyComName: 'Hummingbirds',
      },
    ],
    cropCatalog: {
      strawberry: {
        id: 'strawberry',
        name: 'Fixture Strawberry',
        sciName: 'Fragaria × ananassa',
        growthPhaseGIDs: [4479, 4480, 4481, 4482, 4483, 4484],
        growthPhaseNames: ['Seeded', 'Sprouting', 'Leafing out', 'Flowering', 'Fruiting'],
        growthTimePerPhase: 10,
        yieldGold: 31,
        marketIconGID: 4486,
        unlockCriteria: null,
        seasons: ['Spring'],
      },
      parsnip: {
        id: 'parsnip',
        name: 'Peach',
        sciName: 'Prunus persica',
        growthPhaseGIDs: [5979, 5980, 5981, 5982, 5983],
        growthPhaseNames: ['Dormant', 'Budding', 'Flowering', 'Fruiting'],
        growthTimePerPhase: 45,
        yieldGold: 1200,
        marketIconGID: 5986,
        unlockCriteria: { totalHarvested: 55000 },
        seasons: ['Summer'],
      },
    },
    farmZoneDefs: [
      { name: 'Fixture Strawberry Patch', cropId: 'strawberry', cost: 0 },
      { name: 'Fixture Orchard', cropId: 'parsnip', cost: 100000 },
    ],
    hostedFauna: {
      species: {
        'fragaria virginiana': {
          hosted: [
            {
              name: 'Gray Hairstreak',
              sci: 'Strymon melinus',
              type: 'butterfly',
              role: 'Larval host plant',
              note: 'Uses flowers and developing fruit.',
            },
            {
              name: 'Strawberry Root Weevil',
              sci: 'Otiorhynchus ovatus',
              type: 'beetle',
              role: 'Root herbivore',
              note: 'Feeds on roots and crowns.',
            },
          ],
          confidence: 'species',
          reviewed: true,
          source: 'Curated fixture species match',
        },
      },
      genus: {
        prunus: {
          hosted: [
            {
              name: 'Eastern Tiger Swallowtail',
              sci: 'Papilio glaucus',
              type: 'butterfly',
              role: 'Larval host plant',
              note: 'Caterpillars feed on black cherry foliage.',
            },
            {
              name: 'Cherry Gall Azure',
              sci: 'Celastrina serotina',
              type: 'butterfly',
              role: 'Larval host plant',
              note: 'Uses cherry flower buds and blossoms.',
            },
            {
              name: 'Cecropia Moth',
              sci: 'Hyalophora cecropia',
              type: 'moth',
              role: 'Larval host plant',
              note: 'Uses a wide range of native trees including Prunus.',
            },
          ],
          confidence: 'genus',
          reviewed: true,
          source: 'Curated fixture genus match',
        },
      },
      family: {},
      fallback: {},
    },
  },
  expected: {
    generation: {
      allowDraft: false,
      validation: {
        hostedCoverage: 2,
        warningsIncludes: ['Enabled crop lineup does not cover: Fall, Winter.'],
      },
      outputs: {
        ecoregionCode: `// ecoregion entry for Golden Hosted Fauna Fixture
// Add this to the ECOREGIONS array in ecoregions.js

  {
    id:    'golden_hosted_fauna_fixture',
    code:  '0.0-fixture',
    name:  'Golden Hosted Fauna Fixture',
    label: "0.0 Fixture - Golden Hosted Fauna",
    icon:  'G',
    desc:  "Builder fixture for hosted fauna coverage.",
    hnpUrl: "https://example.test/fixture",
    prestigeRequires: 'se_usa_plains', // previous region id
    prestigeReward:   'Unlocks next region · +10% conservation point generation',

    invasiveIds: [
      // TODO: Add invasive species IDs for this region
    ],

    plants: [

      // ══ FLOWERS ════════════════════════════════════════════════════════
      {
        id:               'wild_strawberry',
        requiresResearch: [],
        name:             "Wild Strawberry",
        sci:              "Fragaria virginiana",
        icon:             '🍎',
        type:             'flower',
        hasFruit:         true,
        desc:             "Low native groundcover with edible fruit.",
        height:           "0.5",
        seasonOfInterest: "Spring",
        insectsHosted: [
          {"name":"Gray Hairstreak","sci":"Strymon melinus","type":"butterfly","role":"Larval host plant","note":"Uses flowers and developing fruit."},
          {"name":"Strawberry Root Weevil","sci":"Otiorhynchus ovatus","type":"beetle","role":"Root herbivore","note":"Feeds on roots and crowns."}
        ],
        wildlifeNote:     "2 hosted fauna from Curated fixture species match",
        caterpillarSpp:   1,
        biosphereBonus:   5,
        cost:             20,
        duration:         7,
      },

      {
        id:               'black_cherry',
        requiresResearch: [],
        name:             "Black Cherry",
        sci:              "Prunus serotina",
        icon:             '🍎',
        type:             'tree',
        hasFruit:         true,
        desc:             "Native tree supporting many insects and birds.",
        height:           "35",
        seasonOfInterest: "Spring",
        insectsHosted: [
          {"name":"Eastern Tiger Swallowtail","sci":"Papilio glaucus","type":"butterfly","role":"Larval host plant","note":"Caterpillars feed on black cherry foliage."},
          {"name":"Cherry Gall Azure","sci":"Celastrina serotina","type":"butterfly","role":"Larval host plant","note":"Uses cherry flower buds and blossoms."},
          {"name":"Cecropia Moth","sci":"Hyalophora cecropia","type":"moth","role":"Larval host plant","note":"Uses a wide range of native trees including Prunus."}
        ],
        wildlifeNote:     "3 hosted fauna from Curated fixture genus match",
        caterpillarSpp:   3,
        biosphereBonus:   10,
        cost:             230,
        duration:         30,
      }
    ],
  },
`,
        birdsCode: `// birds_golden_hosted_fauna_fixture.js — Bird visitors for Golden Hosted Fauna Fixture
// Generated from eBird API data for region US-FIX
// 2 species selected

export const BIRDS_GOLDEN_HOSTED_FAUNA_FIXTURE = {

  carolina_wren: {
    id:   'carolina_wren',
    name: "Carolina Wren",
    sci:  "Thryothorus ludovicianus",
    icon: '🐦',
    role: 'Insectivore; ground & shrub forager',
    note: 'TODO: Add ecological note about this species.',
    desc: 'TODO: Add description of this bird and its relationship to native plants.',
    attractedBy: 'Dense native shrubs and leaf litter',
    unlockCriteria: {"insectsDiscovered":2},
  },

  ruby_throated_hummingbird: {
    id:   'ruby_throated_hummingbird',
    name: "Ruby-throated Hummingbird",
    sci:  "Archilochus colubris",
    icon: '🐦',
    role: 'Pollinator; nectar feeder',
    note: 'TODO: Add ecological note about this species.',
    desc: 'TODO: Add description of this bird and its relationship to native plants.',
    attractedBy: 'Native tubular flowers providing nectar',
    unlockCriteria: {"insectsDiscovered":5,"plantsEstablished":2,"fruitingPlants":2},
  }
};

export const BIRD_LIST_GOLDEN_HOSTED_FAUNA_FIXTURE = Object.values(BIRDS_GOLDEN_HOSTED_FAUNA_FIXTURE);
`,
        bundleCode: `// regions/golden_hosted_fauna_fixture.js — Region data bundle for Golden Hosted Fauna Fixture (0.0-fixture)
      // Aggregates all data modules that define this ecoregion's gameplay content.

      import { RESEARCH }                                    from '../research.js';
import { ECOREGIONS }                                  from '../ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST }            from '../ranch.js';
import { BIRD_LIST_GOLDEN_HOSTED_FAUNA_FIXTURE }         from '../birds_golden_hosted_fauna_fixture.js';
import { INVASIVES, INVASIVE_MAP, TOTAL_INVADED_ACRES } from '../invasives.js';

// Find this ecoregion by id
const eco = ECOREGIONS.find(e => e.id === 'golden_hosted_fauna_fixture');

/** @type {import('./registry.js').RegionData} */
export default {
  // ── Identity ──────────────────────────────────────────────────────────
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

  // ── Per-region datasets ───────────────────────────────────────────────
  plants:                eco.plants,
  invasives:             INVASIVES,       // TODO: region-specific invasives
  invasiveMap:           INVASIVE_MAP,    // TODO: region-specific invasive map
  totalInvadedAcresBase: TOTAL_INVADED_ACRES,
  birdList:              BIRD_LIST_GOLDEN_HOSTED_FAUNA_FIXTURE,
  crops: {
  strawberry: {
    id: "strawberry",
    name: "Fixture Strawberry",
    sciName: "Fragaria × ananassa",
    growthPhaseGIDs: [4479,4480,4481,4482,4483,4484],
    growthPhaseNames: ["Seeded","Sprouting","Leafing out","Flowering","Fruiting"],
    growthTimePerPhase: 10,
    yieldGold: 31,
    marketIconGID: 4486,
    unlockCriteria: null,
    seasons: ["Spring"],
  },
  parsnip: {
    id: "parsnip",
    name: "Peach",
    sciName: "Prunus persica",
    growthPhaseGIDs: [5979,5980,5981,5982,5983],
    growthPhaseNames: ["Dormant","Budding","Flowering","Fruiting"],
    growthTimePerPhase: 45,
    yieldGold: 1200,
    marketIconGID: 5986,
    unlockCriteria: {"totalHarvested":55000},
    seasons: ["Summer"],
  }
  },
  research:              RESEARCH,        // TODO: region-specific research
  ranchAnimals:          RANCH_ANIMALS,
  ranchAnimalList:       RANCH_ANIMAL_LIST,

  // Farm zone definitions — generated from the builder crop plan
  farmZoneDefs:   [
    {
      "name": "Fixture Strawberry Patch",
      "cropId": "strawberry",
      "cost": 0
    },
    {
      "name": "Fixture Orchard",
      "cropId": "parsnip",
      "cost": 100000
    }
  ],
};
`,
      },
    },
  },
};

const draftScenario = {
  id: 'draft-only-hosted-fauna-gap',
  label: 'Draft-only hosted-fauna gap fixture',
  inputs: {
    region: {
      id: 'draft_only_hosted_fauna_fixture',
      code: '0.1-fixture',
      name: 'Draft Only Hosted Fauna Fixture',
      label: '0.1 Fixture - Draft Hosted Fauna Gap',
      icon: 'D',
      desc: 'Builder fixture for draft-only hosted fauna coverage.',
      hnpUrl: 'https://example.test/draft-fixture',
    },
    ebirdRegion: 'US-DRAFT',
    plants: playableScenario.inputs.plants,
    birds: playableScenario.inputs.birds,
    cropCatalog: playableScenario.inputs.cropCatalog,
    farmZoneDefs: playableScenario.inputs.farmZoneDefs,
    hostedFauna: {
      species: {
        'fragaria virginiana': playableScenario.inputs.hostedFauna.species['fragaria virginiana'],
      },
      genus: {},
      family: {},
      fallback: {},
    },
  },
  expected: {
    strictValidation: {
      hostedCoverage: 1,
      errorsIncludes: ['Plant Black Cherry (Prunus serotina) has no hosted-fauna lookup match.'],
      warningsIncludes: ['Enabled crop lineup does not cover: Fall, Winter.'],
    },
    generation: {
      allowDraft: true,
      validation: {
        hostedCoverage: 1,
        warningsIncludes: [
          'Plant Black Cherry (Prunus serotina) has no hosted-fauna lookup match.',
          'Enabled crop lineup does not cover: Fall, Winter.',
        ],
      },
      outputs: {
        ecoregionCode: `// ecoregion entry for Draft Only Hosted Fauna Fixture
// Add this to the ECOREGIONS array in ecoregions.js

  {
    id:    'draft_only_hosted_fauna_fixture',
    code:  '0.1-fixture',
    name:  'Draft Only Hosted Fauna Fixture',
    label: "0.1 Fixture - Draft Hosted Fauna Gap",
    icon:  'D',
    desc:  "Builder fixture for draft-only hosted fauna coverage.",
    hnpUrl: "https://example.test/draft-fixture",
    prestigeRequires: 'se_usa_plains', // previous region id
    prestigeReward:   'Unlocks next region · +10% conservation point generation',

    invasiveIds: [
      // TODO: Add invasive species IDs for this region
    ],

    plants: [

      // ══ FLOWERS ════════════════════════════════════════════════════════
      {
        id:               'wild_strawberry',
        requiresResearch: [],
        name:             "Wild Strawberry",
        sci:              "Fragaria virginiana",
        icon:             '🍎',
        type:             'flower',
        hasFruit:         true,
        desc:             "Low native groundcover with edible fruit.",
        height:           "0.5",
        seasonOfInterest: "Spring",
        insectsHosted: [
          {"name":"Gray Hairstreak","sci":"Strymon melinus","type":"butterfly","role":"Larval host plant","note":"Uses flowers and developing fruit."},
          {"name":"Strawberry Root Weevil","sci":"Otiorhynchus ovatus","type":"beetle","role":"Root herbivore","note":"Feeds on roots and crowns."}
        ],
        wildlifeNote:     "2 hosted fauna from Curated fixture species match",
        caterpillarSpp:   1,
        biosphereBonus:   5,
        cost:             20,
        duration:         7,
      },

      {
        id:               'black_cherry',
        requiresResearch: [],
        name:             "Black Cherry",
        sci:              "Prunus serotina",
        icon:             '🍎',
        type:             'tree',
        hasFruit:         true,
        desc:             "Native tree supporting many insects and birds.",
        height:           "35",
        seasonOfInterest: "Spring",
        insectsHosted: [],
        wildlifeNote:     "Hosted fauna lookup still needed for this plant",
        caterpillarSpp:   0,
        biosphereBonus:   10,
        cost:             230,
        duration:         30,
      }
    ],
  },
`,
        birdsCode: `// birds_draft_only_hosted_fauna_fixture.js — Bird visitors for Draft Only Hosted Fauna Fixture
// Generated from eBird API data for region US-DRAFT
// 2 species selected

export const BIRDS_DRAFT_ONLY_HOSTED_FAUNA_FIXTURE = {

  carolina_wren: {
    id:   'carolina_wren',
    name: "Carolina Wren",
    sci:  "Thryothorus ludovicianus",
    icon: '🐦',
    role: 'Insectivore; ground & shrub forager',
    note: 'TODO: Add ecological note about this species.',
    desc: 'TODO: Add description of this bird and its relationship to native plants.',
    attractedBy: 'Dense native shrubs and leaf litter',
    unlockCriteria: {"insectsDiscovered":2},
  },

  ruby_throated_hummingbird: {
    id:   'ruby_throated_hummingbird',
    name: "Ruby-throated Hummingbird",
    sci:  "Archilochus colubris",
    icon: '🐦',
    role: 'Pollinator; nectar feeder',
    note: 'TODO: Add ecological note about this species.',
    desc: 'TODO: Add description of this bird and its relationship to native plants.',
    attractedBy: 'Native tubular flowers providing nectar',
    unlockCriteria: {"insectsDiscovered":5,"plantsEstablished":2,"fruitingPlants":2},
  }
};

export const BIRD_LIST_DRAFT_ONLY_HOSTED_FAUNA_FIXTURE = Object.values(BIRDS_DRAFT_ONLY_HOSTED_FAUNA_FIXTURE);
`,
        bundleCode: `// regions/draft_only_hosted_fauna_fixture.js — Region data bundle for Draft Only Hosted Fauna Fixture (0.1-fixture)
      // Aggregates all data modules that define this ecoregion's gameplay content.

      import { RESEARCH }                                    from '../research.js';
import { ECOREGIONS }                                  from '../ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST }            from '../ranch.js';
import { BIRD_LIST_DRAFT_ONLY_HOSTED_FAUNA_FIXTURE }         from '../birds_draft_only_hosted_fauna_fixture.js';
import { INVASIVES, INVASIVE_MAP, TOTAL_INVADED_ACRES } from '../invasives.js';

// Find this ecoregion by id
const eco = ECOREGIONS.find(e => e.id === 'draft_only_hosted_fauna_fixture');

/** @type {import('./registry.js').RegionData} */
export default {
  // ── Identity ──────────────────────────────────────────────────────────
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

  // ── Per-region datasets ───────────────────────────────────────────────
  plants:                eco.plants,
  invasives:             INVASIVES,       // TODO: region-specific invasives
  invasiveMap:           INVASIVE_MAP,    // TODO: region-specific invasive map
  totalInvadedAcresBase: TOTAL_INVADED_ACRES,
  birdList:              BIRD_LIST_DRAFT_ONLY_HOSTED_FAUNA_FIXTURE,
  crops: {
  strawberry: {
    id: "strawberry",
    name: "Fixture Strawberry",
    sciName: "Fragaria × ananassa",
    growthPhaseGIDs: [4479,4480,4481,4482,4483,4484],
    growthPhaseNames: ["Seeded","Sprouting","Leafing out","Flowering","Fruiting"],
    growthTimePerPhase: 10,
    yieldGold: 31,
    marketIconGID: 4486,
    unlockCriteria: null,
    seasons: ["Spring"],
  },
  parsnip: {
    id: "parsnip",
    name: "Peach",
    sciName: "Prunus persica",
    growthPhaseGIDs: [5979,5980,5981,5982,5983],
    growthPhaseNames: ["Dormant","Budding","Flowering","Fruiting"],
    growthTimePerPhase: 45,
    yieldGold: 1200,
    marketIconGID: 5986,
    unlockCriteria: {"totalHarvested":55000},
    seasons: ["Summer"],
  }
  },
  research:              RESEARCH,        // TODO: region-specific research
  ranchAnimals:          RANCH_ANIMALS,
  ranchAnimalList:       RANCH_ANIMAL_LIST,

  // Farm zone definitions — generated from the builder crop plan
  farmZoneDefs:   [
    {
      "name": "Fixture Strawberry Patch",
      "cropId": "strawberry",
      "cost": 0
    },
    {
      "name": "Fixture Orchard",
      "cropId": "parsnip",
      "cost": 100000
    }
  ],
};
`,
      },
    },
  },
};

export default {
  defaultScenarioId: playableScenario.id,
  scenarios: [playableScenario, draftScenario],
};