// research.js — Ecology research definitions for Idle Ecologist

export const RESEARCH_CATEGORIES = {
  invasive: { id: 'invasive', label: '🛡️ Invasive Control', desc: 'Research and implement strategies to remove invasive species from your land.' },
  flora:   { id: 'flora',   label: '🌿 Native Flora',   desc: 'Introduce native plant species to increase habitat diversity and soil health.' },
  insects: { id: 'insects', label: '🦋 Native Insects',  desc: 'Restore native pollinators and beneficial insects to your land.' },
  wildlife:{ id: 'wildlife',label: '🦉 Native Wildlife', desc: 'Bring back native animals to build a richer, more resilient biosphere.' },
};

// Research points are earned passively from your farms (1 pt per in-game day base).
// Each completed project permanently improves your Biosphere Score and may
// add small bonuses to crop yield or gold-per-second.

export const RESEARCH = [

  // ── Invasive Control ────────────────────────────────────────────────────────
  {
    id:         'invasive_plant_survey',
    category:   'invasive',
    name:       'Invasive Plant Survey',
    icon:       '📋',
    desc:       'Walk your 1,000 acres with a field guide and GPS to map the extent of ornamental escapees — Bradford pear, nandina, and lesser celandine — and design removal plans for each.',
    flavorText: 'Know your enemy. Every red pin on the map is an acre waiting to be reclaimed.',
    cost:       30,
    duration:   30,          // in-game days
    requires:   [],
    effect: { biosphereBonus: 3, label: '+3 Biosphere Score · unlocks removal of tier-1 plants' },
  },
  {
    id:         'vine_groundcover_control',
    category:   'invasive',
    name:       'Vine & Groundcover Control',
    icon:       '🪓',
    desc:       'Develop cutting and herbicide protocols for the aggressive vine species strangling your woodlands — English ivy, wisteria, Japanese stiltgrass, and Japanese honeysuckle.',
    flavorText: 'Sever the vine at the base. Cut the runners. Watch the canopy open to light again.',
    cost:       60,
    duration:   60,          // in-game days
    requires:   ['invasive_plant_survey'],
    effect: { biosphereBonus: 5, label: '+5 Biosphere Score · unlocks removal of invasive vines & grasses' },
  },
  {
    id:         'woody_invasive_removal',
    category:   'invasive',
    name:       'Woody Invasive Removal',
    icon:       '🪚',
    desc:       'Bring in chainsaw crews and stump-treatment teams for the established woody invaders — autumn olive, mimosa, Chinese tallow, and multiflora rose require cut-stump herbicide to prevent regrowth.',
    flavorText: 'The chainsaw bites, the stump gets its dose. One by one, the thickets fall.',
    cost:       120,
    duration:   100,         // in-game days
    requires:   ['vine_groundcover_control'],
    effect: { biosphereBonus: 8, cropYieldBonus: 0.02, label: '+8 Biosphere Score · +2% crop yield · unlocks woody invasive removal' },
  },
  {
    id:         'deep_root_eradication',
    category:   'invasive',
    name:       'Deep-Root Eradication',
    icon:       '⛏️',
    desc:       'The toughest invasive plants on your land — kudzu, Chinese privet, and cogongrass — have deep root systems that can regenerate from fragments. This multi-year program combines repeated cutting, prescribed burning, and targeted herbicide.',
    flavorText: 'Three years of burning and cutting. Then one morning you notice — the privet is gone, and native seedlings are pushing through.',
    cost:       200,
    duration:   150,         // in-game days
    requires:   ['woody_invasive_removal'],
    effect: { biosphereBonus: 12, cropYieldBonus: 0.03, label: '+12 Biosphere Score · +3% crop yield · unlocks removal of dominant invasives' },
  },
  {
    id:         'invasive_pest_management',
    category:   'invasive',
    name:       'Invasive Pest Management',
    icon:       '🔬',
    desc:       'Develop integrated pest management strategies for the invasive animals on your land — fire ants, Asian tiger mosquitoes, and spotted lanternflies. Combines biological control, habitat management, and targeted treatment.',
    flavorText: 'The phorid fly circles the mound. A tiny parasitoid — but the fire ants have never encountered anything like it.',
    cost:       80,
    duration:   80,          // in-game days
    requires:   ['invasive_plant_survey'],
    effect: { biosphereBonus: 5, label: '+5 Biosphere Score · unlocks invasive animal control' },
  },
  {
    id:         'large_fauna_control',
    category:   'invasive',
    name:       'Large Fauna Control',
    icon:       '🎯',
    desc:       'Coordinate with state wildlife agencies to implement a year-round feral hog removal program using corral traps, trail cameras, and professional trappers. One of the most challenging invasive management problems in the Southeast.',
    flavorText: 'The trap camera catches them at 3 AM — a sounder of thirty, rooting through your newly planted oaks. Time to call in the professionals.',
    cost:       150,
    duration:   120,         // in-game days
    requires:   ['invasive_pest_management'],
    effect: { biosphereBonus: 10, cropYieldBonus: 0.03, label: '+10 Biosphere Score · +3% crop yield · unlocks feral hog removal' },
  },

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
    requiresCropMilestones: [{ cropId: 'strawberry', grown: 250 }],
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
    requiresCropMilestones: [{ cropId: 'potato', grown: 1000 }],
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
    requiresCropMilestones: [{ cropId: 'blueberry', grown: 250 }],
    effect: { biosphereBonus: 12, label: '+12 Biosphere Score · unlocks amphibian research' },
  },
  {
    id:         'prescribed_burn_program',
    category:   'flora',
    name:       'Prescribed Burn Program',
    icon:       '🔥',
    desc:       'Implement a controlled burn regime to restore fire-adapted native ecosystems. Prescribed fire — used for millennia by Indigenous peoples and now managed by state forestry agencies across the South — suppresses invasive vegetation, recycles nutrients into the soil, and triggers germination of fire-dependent species like longleaf pine and native bunchgrasses. Alabama alone burns over 500,000 acres annually to maintain healthy forests and grasslands.',
    flavorText: 'Smoke drifts low across the field. Beneath the blackened stubble, dormant seeds stir for the first time in decades.',
    cost:       280,
    duration:   180,         // in-game days
    requires:   ['prairie_grass_patches'],
    requiresCropMilestones: [{ cropId: 'parsnip', grown: 250 }],
    effect: { biosphereBonus: 14, cropYieldBonus: 0.03, label: '+14 Biosphere Score · +3% crop yield' },
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
    requiresCropMilestones: [{ cropId: 'greenOnion', grown: 250 }],
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
    requiresCropMilestones: [{ cropId: 'greenOnion', grown: 1000 }],
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
    requiresCropMilestones: [{ cropId: 'lettuce', grown: 250 }],
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
    requiresCropMilestones: [{ cropId: 'onion', grown: 1000 }],
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
    requiresCropMilestones: [{ cropId: 'carrot', grown: 1000 }],
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
    requiresCropMilestones: [{ cropId: 'rice', grown: 150 }],
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
    requiresCropMilestones: [{ cropId: 'cauliflower', grown: 200 }],
    effect: { biosphereBonus: 12, label: '+12 Biosphere Score · unlocks raptor projects' },
  },
  {
    id:         'barn_owl_towers',
    category:   'wildlife',
    name:       'Barn Owl Nest Towers',
    icon:       '🦉',
    desc:       'Raise deep nest towers beside rough field margins so barn owls can patrol vole runs through your late brassica blocks. Their nightly hunting pressure helps protect dense plantings where rodents would otherwise explode.',
    flavorText: 'The tower stays motionless. The field beneath it does not.',
    cost:       520,
    duration:   340,
    requires:   ['hedgehog_highways', 'kestrel_perches'],
    requiresCropMilestones: [{ cropId: 'broccoli', grown: 150 }],
    effect: { biosphereBonus: 18, cropYieldBonus: 0.06, label: '+18 Biosphere Score · +6% crop yield' },
  },
  {
    id:         'shelterbelt_refugia',
    category:   'wildlife',
    name:       'Late-Season Shelterbelts',
    icon:       '🌲',
    desc:       'Build layered shelterbelts around your latest crop blocks so bats, birds, and predatory insects can hold the edge of the farm through late summer and harvest. The denser refuge keeps your most valuable zones ecologically connected.',
    flavorText: 'Even after the rows are picked clean, the edge of the field is still alive.',
    cost:       650,
    duration:   420,
    requires:   ['barn_owl_towers', 'moth_light_study'],
    requiresCropMilestones: [{ cropId: 'asparagus', grown: 150 }],
    effect: { biosphereBonus: 22, cropYieldBonus: 0.08, label: '+22 Biosphere Score · +8% crop yield' },
  },
];
