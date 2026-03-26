// ranch.js — Farm animal definitions for the Ranch tab

export const RANCH_ANIMALS = {

  chicken: {
    id: 'chicken',
    name: 'Chicken',
    sci: 'Gallus gallus domesticus',
    icon: '🐔',
    product: 'Fresh Eggs',
    goldPerCycle: 150,
    productionIntervalSecs: 30,
    baseCost: 5000,
    unlockCriteria: { totalSold: 1000 },
    desc: 'Heritage breed chickens are hardy, reliable egg layers well-suited to the heat and humidity of the Southeast. Breeds like the Dominique and Rhode Island Red have been raised on SE farms for generations.',
    care: 'Provide 2–4 sq ft per bird inside the coop and at least 10 sq ft in the outdoor run. Install one nest box per 4 hens. Supply fresh water daily, quality layer pellets, and crushed oyster shell for strong eggshells. Collect eggs daily to discourage broodiness. Heritage breeds are more heat-tolerant than commercial hybrids and better foragers, meaningfully reducing feed costs on pasture.',
  },

  duck: {
    id: 'duck',
    name: 'Duck',
    sci: 'Anas platyrhynchos domesticus',
    icon: '🦆',
    product: 'Duck Eggs',
    goldPerCycle: 420,
    productionIntervalSecs: 30,
    baseCost: 18000,
    unlockCriteria: { totalSold: 5000 },
    desc: 'Domestic ducks are prolific egg layers and excellent pest controllers, consuming slugs, snails, and insects. They thrive in the humid SE climate and rarely need veterinary attention.',
    care: 'Allow 4–5 sq ft of indoor space per duck and access to shallow water for bathing and bill-dunking — a full pond is not required, a tub works fine. Feed a waterfowl pellet; avoid medicated chick starter. Ducks are cold- and heat-hardy, lay eggs year-round, and are more disease-resistant than chickens. Khaki Campbells average 300+ eggs per year.',
  },

  goat: {
    id: 'goat',
    name: 'Dairy Goat',
    sci: 'Capra hircus',
    icon: '🐐',
    product: 'Goat Milk',
    goldPerCycle: 1100,
    productionIntervalSecs: 30,
    baseCost: 55000,
    unlockCriteria: { totalSold: 15000 },
    desc: 'Dairy goats provide fresh milk for cheese, soap, and direct sale. Nubian and Nigerian Dwarf breeds are favored in the Southeast for their heat tolerance and rich, high-butterfat milk.',
    care: 'Goats need at least 200 sq ft of secure outdoor space per animal. Use woven wire fencing at least 4 ft high — goats are accomplished escape artists. Provide quality hay and browse (shrubs, weeds) supplemented with grain during lactation. Always keep loose minerals and fresh water available. Goats are deeply social animals; never keep fewer than two together. Milk does once or twice daily during lactation.',
  },

  turkey: {
    id: 'turkey',
    name: 'Heritage Turkey',
    sci: 'Meleagris gallopavo',
    icon: '🦃',
    product: 'Heritage Turkey',
    goldPerCycle: 2800,
    productionIntervalSecs: 30,
    baseCost: 130000,
    unlockCriteria: { totalSold: 40000 },
    desc: 'Heritage turkeys like the Bourbon Red were developed in the Appalachian foothills and are perfectly adapted to free-range life on diverse SE pasture. They exhibit strong foraging instincts that reduce feed costs.',
    care: 'Provide at least 10 sq ft indoors and access to open pasture. Heritage turkeys are excellent foragers and reduce insect pressure across the farm. Feed a 28% protein starter for growing poults, dropping to a 20% grower ration for adults. Install elevated, sturdy roosts — turkeys instinctively prefer to roost off the ground. Heritage breeds require 26–28 weeks to reach maturity but reward patience with flavor superior to any commercial strain.',
  },

  pig: {
    id: 'pig',
    name: 'Pastured Pig',
    sci: 'Sus scrofa domesticus',
    icon: '🐷',
    product: 'Pasture-Raised Pork',
    goldPerCycle: 7500,
    productionIntervalSecs: 30,
    baseCost: 320000,
    unlockCriteria: { totalSold: 90000 },
    desc: 'Pasture-raised pigs convert farm scraps and open forage into premium pork. Duroc, Berkshire, and Tamworth breeds are prized in the Southeast for their marbling and outstanding adaptability.',
    care: 'Allow 50+ sq ft per pig in a secure, rooted pen with a wallow or shade structure — pigs cannot sweat and are prone to dangerous heat stress in SE summers. Feed a balanced grower ration supplemented with vegetable scraps, spent grain, and garden surplus. Rotate paddocks to prevent overrooting and maintain forage. Provide clean water via a rinse-friendly drinker or trough. Pigs reach market weight in as little as 5–7 months on a quality feeding program.',
  },

  cattle: {
    id: 'cattle',
    name: 'Grass-Fed Cattle',
    sci: 'Bos taurus',
    icon: '🐄',
    product: 'Grass-Fed Beef',
    goldPerCycle: 24000,
    productionIntervalSecs: 30,
    baseCost: 900000,
    unlockCriteria: { totalSold: 220000 },
    desc: 'Grass-fed beef cattle convert well-managed SE pasture into premium beef. Heat-tolerant composites like Brangus and Angus cross perform well across the region\'s hot, humid summers.',
    care: 'Plan 1–2 acres of improved pasture per cow-calf pair and practice rotational grazing to maintain forage quality and prevent overgrazing. Supplement with hay during drought or winter. Provide clean water via a trough — a 1,000 lb cow drinks 30+ gallons per day in summer heat. Follow a herd health calendar including scheduled vaccinations, deworming, and hoof care. Shade trees or shade structures are essential for animal welfare in the SE summer. Wean calves at 6–8 months.',
  },

};

export const RANCH_ANIMAL_LIST = Object.values(RANCH_ANIMALS);
