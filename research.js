// research.js — Ecology research definitions for Idle Ecologist

export const RESEARCH_CATEGORIES = {
  flora:   { id: 'flora',   label: '🌿 Native Flora',   desc: 'Introduce native plant species to increase habitat diversity and soil health.' },
  insects: { id: 'insects', label: '🦋 Native Insects',  desc: 'Restore native pollinators and beneficial insects to your land.' },
  wildlife:{ id: 'wildlife',label: '🦉 Native Wildlife', desc: 'Bring back native animals to build a richer, more resilient biosphere.' },
};

// Research points are earned passively from your farms (1 pt per in-game day base).
// Each completed project permanently improves your Biosphere Score and may
// add small bonuses to crop yield or gold-per-second.

export const RESEARCH = [

  // ── Native Flora ────────────────────────────────────────────────────────────
  {
    id:         'wildflower_margins',
    category:   'flora',
    name:       'Wildflower Margins',
    icon:       '🌸',
    desc:       'Plant native wildflower strips along the edges of your crop fields to attract the first wave of pollinators.',
    flavorText: 'A ribbon of colour — and life — winding around every plot.',
    cost:       50,         // research points
    duration:   50,         // in-game days
    requires:   [],
    effect: { biosphereBonus: 5, label: '+5 Biosphere Score' },
  },
  {
    id:         'hedgerow_seeding',
    category:   'flora',
    name:       'Hedgerow Seeding',
    icon:       '🌳',
    desc:       'Establish native hedgerows between your farm zones to create wildlife corridors across the land.',
    flavorText: 'Ancient boundaries reborn — alive with rustling wings and small, warm bodies.',
    cost:       120,
    duration:   100,         // in-game days
    requires:   ['wildflower_margins'],
    effect: { biosphereBonus: 8, label: '+8 Biosphere Score' },
  },
  {
    id:         'prairie_grass_patches',
    category:   'flora',
    name:       'Prairie Grass Patches',
    icon:       '🌾',
    desc:       'Re-introduce native tussock grasses in field margins to improve soil structure and provide overwintering habitat.',
    flavorText: 'The land remembers what grew here long before the plough.',
    cost:       200,
    duration:   150,         // in-game days
    requires:   ['hedgerow_seeding'],
    effect: { biosphereBonus: 10, cropYieldBonus: 0.02, label: '+10 Biosphere Score · +2% crop yield' },
  },
  {
    id:         'pond_margin_planting',
    category:   'flora',
    name:       'Pond Margin Planting',
    icon:       '🪷',
    desc:       'Plant native rushes, reeds, and water-lilies around water features to create a wetland edge habitat.',
    flavorText: 'Still water, humming with life just beneath the surface.',
    cost:       350,
    duration:   200,         // in-game days
    requires:   ['prairie_grass_patches'],
    effect: { biosphereBonus: 12, label: '+12 Biosphere Score · unlocks amphibian research' },
  },

  // ── Native Insects ──────────────────────────────────────────────────────────
  {
    id:         'pollinator_survey',
    category:   'insects',
    name:       'Pollinator Survey',
    icon:       '📋',
    desc:       'Survey which native bees, hoverflies, and butterflies are present and identify the habitats they need most.',
    flavorText: 'You cannot protect what you have not first stopped to observe.',
    cost:       80,
    duration:   75,          // in-game days
    requires:   ['wildflower_margins'],
    effect: { biosphereBonus: 3, label: '+3 Biosphere Score · unlocks insect projects' },
  },
  {
    id:         'bumblebee_habitat',
    category:   'insects',
    name:       'Bumblebee Habitat',
    icon:       '🐝',
    desc:       'Install bumblebee nesting tubes and a network of bee-friendly forage patches near every zone.',
    flavorText: 'A low, contented hum drifts back to fields that had grown silent.',
    cost:       160,
    duration:   125,         // in-game days
    requires:   ['pollinator_survey'],
    effect: { biosphereBonus: 8, cropYieldBonus: 0.03, label: '+8 Biosphere Score · +3% crop yield' },
  },
  {
    id:         'ladybird_colonies',
    category:   'insects',
    name:       'Ladybird Colonies',
    icon:       '🐞',
    desc:       'Encourage native ladybird and lacewing populations to provide a natural check on aphid pressure.',
    flavorText: 'Let predators do the work that pesticides once did.',
    cost:       250,
    duration:   175,         // in-game days
    requires:   ['bumblebee_habitat'],
    effect: { biosphereBonus: 10, cropYieldBonus: 0.04, label: '+10 Biosphere Score · +4% crop yield' },
  },
  {
    id:         'moth_light_study',
    category:   'insects',
    name:       'Moth Light Study',
    icon:       '🦋',
    desc:       'Run a moth trap through summer nights to record species richness and identify key habitat improvements.',
    flavorText: 'They arrive in the dark — each one a small measure of recovery.',
    cost:       320,
    duration:   200,         // in-game days
    requires:   ['ladybird_colonies'],
    effect: { biosphereBonus: 8, label: '+8 Biosphere Score · unlocks night-ecology projects' },
  },

  // ── Native Wildlife ─────────────────────────────────────────────────────────
  {
    id:         'bird_boxes',
    category:   'wildlife',
    name:       'Bird Box Network',
    icon:       '🐦',
    desc:       'Install a network of nest boxes sized for blue tits, great tits, and house sparrows across your farm.',
    flavorText: 'Song returns to morning fields before the mist has even lifted.',
    cost:       100,
    duration:   100,         // in-game days
    requires:   ['hedgerow_seeding'],
    effect: { biosphereBonus: 6, label: '+6 Biosphere Score' },
  },
  {
    id:         'bat_roosts',
    category:   'wildlife',
    name:       'Bat Roost Boxes',
    icon:       '🦇',
    desc:       'Provide roosting sites for pipistrelle and brown long-eared bats, which predate night-flying crop pests.',
    flavorText: 'Dusk patrols — the silent, efficient kind.',
    cost:       180,
    duration:   150,         // in-game days
    requires:   ['bird_boxes'],
    effect: { biosphereBonus: 8, cropYieldBonus: 0.02, label: '+8 Biosphere Score · +2% crop yield' },
  },
  {
    id:         'hedgehog_highways',
    category:   'wildlife',
    name:       'Hedgehog Highways',
    icon:       '🦔',
    desc:       'Cut small 13 cm passages in fences and walls so hedgehogs can roam your entire farm network freely.',
    flavorText: 'One small gap. An entire interconnected neighbourhood for a whole species.',
    cost:       300,
    duration:   250,         // in-game days
    requires:   ['bat_roosts', 'ladybird_colonies'],
    effect: { biosphereBonus: 15, cropYieldBonus: 0.05, label: '+15 Biosphere Score · +5% crop yield' },
  },
  {
    id:         'kestrel_perches',
    category:   'wildlife',
    name:       'Kestrel Perch Posts',
    icon:       '🦅',
    desc:       'Erect tall wooden perch posts across open ground so kestrels can hunt field voles and control rodent populations.',
    flavorText: 'It hangs, briefly, motionless — then plunges.',
    cost:       450,
    duration:   300,         // in-game days
    requires:   ['bird_boxes', 'prairie_grass_patches'],
    effect: { biosphereBonus: 12, label: '+12 Biosphere Score · unlocks raptor projects' },
  },
];
