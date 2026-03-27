// birds.js — Native bird visitors attracted by ecosystem health
// Birds are drawn to your land as insect diversity increases and fruiting plants establish.
// These are generalist garden visitors distinct from specialist birds linked
// to specific plants in ecoregions.js (those are discovered via the creature system).
//
// unlockCriteria:
//   insectsDiscovered  — count of non-bird, non-mammal creatures discovered
//   plantsEstablished  — total native plant species with ≥1 established acre
//   fruitingPlants     — plant species with hasFruit:true that are established
//   hasPlantType       — at least one plant of this type ('flower'|'shrub'|'tree') established

export const BIRDS = {

  american_robin: {
    id: 'american_robin',
    name: 'American Robin',
    sci: 'Turdus migratorius',
    icon: '🐦',
    role: 'Frugivore & insectivore',
    note: 'Robins hunt earthworms by sight and sound, cocking their head to locate movement beneath the soil surface. Their presence is a reliable indicator of a functioning soil ecosystem with abundant invertebrates.',
    desc: 'One of the most familiar birds in North America, the robin is actually a thrush — closely related to Eurasian thrushes and the American Wood-Thrush. The bold orange-red breast of the male is unmistakable. Robins are among the most important native fruit-dispersers in eastern gardens, consuming and distributing the seeds of hundreds of plant species. They are also voracious caterpillar hunters, and visit planted areas heavily during chick-rearing season when animal protein is essential.',
    attractedBy: 'Fruiting native plants and an insect-rich ground layer',
    unlockCriteria: { insectsDiscovered: 3, fruitingPlants: 1 },
  },

  northern_cardinal: {
    id: 'northern_cardinal',
    name: 'Northern Cardinal',
    sci: 'Cardinalis cardinalis',
    icon: '🐦',
    role: 'Seed & insect consumer; dense shrub nester',
    note: 'Cardinals are one of the few bird species where the female also sings — unusual among North American songbirds. Both sexes feed caterpillars almost exclusively to nestlings, making your insect community directly responsible for their breeding success.',
    desc: 'The Northern Cardinal is a year-round resident and an iconic SE USA garden bird. Males are brilliant crimson; females are warm brown with red accents. Cardinals prefer dense shrubby cover for nesting and foraging. During breeding season, animal protein from insects makes up over 90% of what they feed chicks — every caterpillar in your native plantings matters. In winter they switch to seeds and berries, making a diversity of native plants valuable across all seasons.',
    attractedBy: 'Native plant diversity providing both caterpillars and seeds',
    unlockCriteria: { insectsDiscovered: 5, plantsEstablished: 2 },
  },

  carolina_chickadee: {
    id: 'carolina_chickadee',
    name: 'Carolina Chickadee',
    sci: 'Poecile carolinensis',
    icon: '🐦',
    role: 'Caterpillar specialist; cavity nester',
    note: "Doug Tallamy's research showed that a single Carolina Chickadee nest requires 6,000–9,000 caterpillars to raise one clutch of chicks. Their presence is a direct biological measure of your caterpillar abundance.",
    desc: 'The Carolina Chickadee is the quintessential SE USA woodland songbird — quick, acrobatic, and sociable year-round. While it consumes seeds and berries in winter, during breeding season it switches almost exclusively to caterpillars. It forages primarily in trees and shrubs, gleaning insects from leaf undersides. Understanding the food chain — native plant → caterpillar → chickadee nestling — is the ecological foundation of the Homegrown National Park movement.',
    attractedBy: 'High caterpillar diversity on native plants',
    unlockCriteria: { insectsDiscovered: 10, plantsEstablished: 3 },
  },

  carolina_wren: {
    id: 'carolina_wren',
    name: 'Carolina Wren',
    sci: 'Thryothorus ludovicianus',
    icon: '🐦',
    role: 'Insectivore; ground & shrub forager',
    note: "Carolina Wrens are unusually loud for their size — the male's song can carry over a quarter of a mile. Pairs maintain year-round territories and become familiar, dependable presences in gardens with dense native understory.",
    desc: 'A plump, rufous-brown wren with a bold white eyebrow stripe and a persistently cocked tail. The Carolina Wren is a habitat generalist as long as dense cover is available — it forages in the leaf litter, along fallen logs, and in tangles of native shrubs for insects, spiders, and small invertebrates. It readily nests in unusual spots: flowerpots, open sheds, and hanging baskets. One of the most loyal garden inhabitants once it establishes territory.',
    attractedBy: 'Dense native shrubs providing foraging cover and leaf litter',
    unlockCriteria: { insectsDiscovered: 12, hasPlantType: 'shrub' },
  },

  eastern_bluebird: {
    id: 'eastern_bluebird',
    name: 'Eastern Bluebird',
    sci: 'Sialia sialis',
    icon: '🐦',
    role: 'Aerial insectivore; cavity nester',
    note: 'Bluebird populations crashed in the 20th century due to cavity competition from European Starlings and House Sparrows. Their recovery is a conservation success story driven by nest box programs — adding native plantings multiplies the effect by restoring their food supply.',
    desc: 'The Eastern Bluebird is one of the most beloved garden birds in the SE USA — sky-blue above, rusty-orange below, with a gentle manner and a soft warbling song. Bluebirds hunt by watching from a perch and dropping to the ground to capture caterpillars, beetles, grasshoppers, and other insects in the open. A high diversity of native insects is the single most important factor in successful bluebird nesting, making native plantings the best complement to nest boxes.',
    attractedBy: 'Diverse insects across open areas with native plantings',
    unlockCriteria: { insectsDiscovered: 18, plantsEstablished: 5 },
  },

  red_bellied_woodpecker: {
    id: 'red_bellied_woodpecker',
    name: 'Red-bellied Woodpecker',
    sci: 'Melanerpes carolinus',
    icon: '🐦',
    role: 'Bark gleaner; acorn and insect consumer',
    note: "Despite its name, the red belly is only faintly visible — the brilliant red cap is the standout field mark. Their call — a rolling churr — is one of the most characteristic sounds of SE USA woodland gardens.",
    desc: 'A medium-sized woodpecker with bold black-and-white barring and a vivid red crown. The Red-bellied Woodpecker is a fixture in mature native trees across the SE USA, excavating cavities that later shelter owls, ducks, and small mammals. It forages across tree bark for wood-boring beetles and other insects, caches acorns in bark crevices, and visits insect-rich native plantings year-round. Its presence reflects the structural maturity of native woody plants in your landscape.',
    attractedBy: 'Mature native trees providing bark insects and food-caching sites',
    unlockCriteria: { insectsDiscovered: 20, hasPlantType: 'tree' },
  },

  cedar_waxwing: {
    id: 'cedar_waxwing',
    name: 'Cedar Waxwing',
    sci: 'Bombycilla cedrorum',
    icon: '🐦',
    role: 'Frugivore specialist',
    note: 'Cedar Waxwings are nomadic and highly social — they rarely travel alone. When a flock finds a heavily fruiting tree, dozens descend simultaneously and strip the branches within minutes. Multiple fruiting native species extend your ability to attract them across seasons.',
    desc: 'Among the most elegant birds in North America — sleek, crested, and masked, with waxy red wingtip spots that give them their name. Cedar Waxwings are specialists on fruit, consuming native berries and drupes almost exclusively outside the brief insect-rich breeding period. They are nomadic rather than territorial, wandering wherever fruit is abundant. Fruiting native shrubs and trees are the single key to attracting them — no amount of other landscaping substitutes.',
    attractedBy: 'Multiple species of fruiting native shrubs and trees',
    unlockCriteria: { insectsDiscovered: 15, fruitingPlants: 3 },
  },

  northern_mockingbird: {
    id: 'northern_mockingbird',
    name: 'Northern Mockingbird',
    sci: 'Mimus polyglottos',
    icon: '🐦',
    role: 'Territorial omnivore; ecosystem indicator',
    note: 'A male mockingbird can learn 200+ songs over its lifetime, incorporating the calls of neighbors, car alarms, and frogs. They sing day and night during breeding season — loud proof that your habitat is rich enough to sustain a territorial resident.',
    desc: 'The Northern Mockingbird is the boldest, most conspicuous garden bird in the SE USA — a medium-sized grey bird with white wing patches visible in flight. It defends large territories that it fills with constant song. Mockingbirds are dietary generalists — eating insects in summer and switching to berries in winter — which means a diverse native planting supports them across all seasons. They are often the bird most dramatically improved by native planting programs.',
    attractedBy: 'Diverse insects, fruiting plants, and enough land for a territory',
    unlockCriteria: { insectsDiscovered: 25, fruitingPlants: 2, plantsEstablished: 8 },
  },

  indigo_bunting: {
    id: 'indigo_bunting',
    name: 'Indigo Bunting',
    sci: 'Passerina cyanea',
    icon: '🐦',
    role: 'Seed & insect consumer; migratory neotropical',
    note: 'Indigo Buntings navigate migration almost entirely by the stars, calibrating their internal compass each night. Their appearance in larger numbers tracks directly with the recovery of native insect and seed plant diversity — a living metric of your restoration progress.',
    desc: 'The male Indigo Bunting in breeding plumage is one of the most intensely blue birds on earth — not from pigment but from structural coloration that scatters blue light. Females are streaky brown and easily overlooked. Buntings eat small seeds and insects, favouring native meadow-edge habitats. In summer they switch substantially to caterpillars and other insects for the protein demands of breeding season.',
    attractedBy: 'Native flower diversity with abundant caterpillars and seed heads',
    unlockCriteria: { insectsDiscovered: 30, plantsEstablished: 10 },
  },

  eastern_towhee: {
    id: 'eastern_towhee',
    name: 'Eastern Towhee',
    sci: 'Pipilo erythrophthalmus',
    icon: '🐦',
    role: 'Ground forager; dense shrub nester',
    note: "The Towhee's drink-your-tea! song is one of the most recognizable sounds of SE USA shrubby habitat. They scratch through leaf litter with both feet simultaneously — a double-scratch technique unique among SE birds — to expose insects and seeds.",
    desc: 'A boldly patterned, robin-sized sparrow with a black hood, rufous sides, and white belly. The Eastern Towhee is strictly a bird of dense shrubby edges and thickets — it will not occupy open lawns or sparse plantings. It forages exclusively on the ground, scratching noisily through leaf litter to find insects, caterpillars, seeds, and berries. Because it needs both structural density from native shrubs and the insects living in the leaf litter beneath them, it is one of the most reliable ecological indicators of a maturing native planting.',
    attractedBy: 'Dense native shrubs with deep leaf litter and ground insects',
    unlockCriteria: { insectsDiscovered: 22, hasPlantType: 'shrub', plantsEstablished: 7 },
  },

};

export const BIRD_LIST = Object.values(BIRDS);
