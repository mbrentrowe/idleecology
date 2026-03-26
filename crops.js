// crops.js - Crop type definitions and growth instance tracking

// ── CropType ────────────────────────────────────────────────────────────────
export class CropType {
  constructor({ id, name, sciName, growthPhaseGIDs, growthPhaseNames, growthTimePerPhase, yieldGold, marketIconGID, unlockCriteria, artisanProduct, seasons }) {
    this.id = id;
    this.name = name;
    this.sciName = sciName || null;
    this.growthPhaseGIDs = growthPhaseGIDs;
    this.growthPhaseNames = growthPhaseNames || null;
    this.growthTimePerPhase = growthTimePerPhase;
    this.yieldGold = yieldGold;
    this.marketIconGID = marketIconGID;
    this.unlockCriteria = unlockCriteria || null;
    this.artisanProduct = artisanProduct || null;
    this.seasons = seasons || ['Spring', 'Summer', 'Fall', 'Winter'];
  }

  isUnlocked(cropStats) {
    if (!this.unlockCriteria) return true;
    const totalSold = Array.from(cropStats.values()).reduce((s, v) => s + v.sold, 0);
    return totalSold >= this.unlockCriteria.totalSold;
  }

  get totalPhases() { return this.growthPhaseGIDs.length; }
  get totalGrowthTime() { return (this.totalPhases - 1) * this.growthTimePerPhase; }
  isInSeason(seasonName) { return this.seasons.includes(seasonName); }
}

// ── CropInstance ─────────────────────────────────────────────────────────────
export class CropInstance {
  constructor(cropType) {
    this.cropType = cropType;
    this.phase = 0;
    this.timer = 0;
  }

  get isFullyGrown() { return this.phase >= this.cropType.growthPhaseGIDs.length - 1; }
  get currentGID()   { return this.cropType.growthPhaseGIDs[this.phase]; }

  tick(deltaSec) {
    if (this.isFullyGrown) return;
    this.timer += deltaSec;
    while (this.timer >= this.cropType.growthTimePerPhase) {
      this.timer -= this.cropType.growthTimePerPhase;
      this.phase = Math.min(this.phase + 1, this.cropType.growthPhaseGIDs.length - 1);
      if (this.isFullyGrown) break;
    }
  }

  harvest() {
    const earned = this.cropType.yieldGold;
    this.phase = 0;
    this.timer = 0;
    return earned;
  }

  get phaseProgress()   { if (this.isFullyGrown) return 1; return this.timer / this.cropType.growthTimePerPhase; }
  get overallProgress() {
    const maxPhase = this.cropType.growthPhaseGIDs.length - 1;
    return (this.phase + this.phaseProgress) / maxPhase;
  }
}

// ── Crop Definitions ─────────────────────────────────────────────────────────
// Crops are tailored to the SE USA Plains ecoregion.
// Sprite GIDs reuse the existing master sheet; art will be updated with region-
// specific assets in a later pass.
export const CROPS = {
  strawberry: new CropType({
    id: 'strawberry', name: 'Strawberry', sciName: 'Fragaria × ananassa',
    growthPhaseGIDs: [4479,4480,4481,4482,4483,4484],
    growthPhaseNames: ['Seeded', 'Sprouting', 'Leafing out', 'Flowering', 'Fruiting'],
    growthTimePerPhase: 10, yieldGold: 25, marketIconGID: 4486,
    seasons: ['Spring'],
    artisanProduct: { name: 'Strawberry Preserves', cropInputCount: 5, goldValue:    375, iconGID: 4486, unlockCropSold:  500 },
  }),
  greenOnion: new CropType({
    id: 'greenOnion', name: 'Scallion', sciName: 'Allium fistulosum',
    growthPhaseGIDs: [4729,4730,4731,4732,4733,4734],
    growthPhaseNames: ['Seeds sown', 'Germinating', 'Sprouting', 'Bulbing', 'Maturing'],
    growthTimePerPhase: 14, yieldGold: 45, marketIconGID: 4736,
    unlockCriteria: { totalSold: 500 },
    seasons: ['Spring', 'Fall'],
    artisanProduct: { name: 'Pickled Scallions',    cropInputCount: 5, goldValue:    675, iconGID: 4736, unlockCropSold:  500 },
  }),
  potato: new CropType({
    // Note: sprite is a round root; represents sweet potato (Ipomoea batatas)
    id: 'potato', name: 'Sweet Potato', sciName: 'Ipomoea batatas',
    growthPhaseGIDs: [4978,4979,4980,4981,4982,4983,4984],
    growthPhaseNames: ['Slips planted', 'Rooting', 'Vining', 'Spreading', 'Tuber forming', 'Curing'],
    growthTimePerPhase: 18, yieldGold: 85, marketIconGID: 4986,
    unlockCriteria: { totalSold: 2000 },
    seasons: ['Summer', 'Fall'],
    artisanProduct: { name: 'Sweet Potato Pie',     cropInputCount: 5, goldValue:   1275, iconGID: 4986, unlockCropSold:  500 },
  }),
  onion: new CropType({
    // Note: sprite is a bulb vegetable; represents okra pods
    id: 'onion', name: 'Okra', sciName: 'Abelmoschus esculentus',
    growthPhaseGIDs: [5228,5229,5230,5231,5232,5233,5234],
    growthPhaseNames: ['Seeds sown', 'Germinating', 'Seedling', 'Growing', 'Budding', 'Podding'],
    growthTimePerPhase: 22, yieldGold: 160, marketIconGID: 5236,
    unlockCriteria: { totalSold: 6000 },
    seasons: ['Summer'],
    artisanProduct: { name: 'Pickled Okra',         cropInputCount: 5, goldValue:   2800, iconGID: 5236, unlockCropSold:  500 },
  }),
  carrot: new CropType({
    // Note: sprite is an orange root; represents peanut plants
    id: 'carrot', name: 'Peanut', sciName: 'Arachis hypogaea',
    growthPhaseGIDs: [5479,5480,5481,5482,5483,5484],
    growthPhaseNames: ['Planted', 'Germinating', 'Seedling', 'Flowering', 'Pegging'],
    growthTimePerPhase: 28, yieldGold: 300, marketIconGID: 5486,
    unlockCriteria: { totalSold: 15000 },
    seasons: ['Summer', 'Fall'],
    artisanProduct: { name: 'Peanut Butter',        cropInputCount: 5, goldValue:   6000, iconGID: 5486, unlockCropSold:  500 },
  }),
  blueberry: new CropType({
    id: 'blueberry', name: 'Blueberry', sciName: 'Vaccinium virgatum',
    growthPhaseGIDs: [5729,5730,5731,5732,5733,5734],
    growthPhaseNames: ['Planted', 'Leafing', 'Budding', 'Flowering', 'Fruiting'],
    growthTimePerPhase: 35, yieldGold: 600, marketIconGID: 5736,
    unlockCriteria: { totalSold: 30000 },
    seasons: ['Summer'],
    artisanProduct: { name: 'Blueberry Jam',        cropInputCount: 5, goldValue:  12000, iconGID: 5736, unlockCropSold:  500 },
  }),
  parsnip: new CropType({
    // Note: sprite is a pale root; represents peach fruit
    id: 'parsnip', name: 'Peach', sciName: 'Prunus persica',
    growthPhaseGIDs: [5979,5980,5981,5982,5983],
    growthPhaseNames: ['Dormant', 'Budding', 'Flowering', 'Fruiting'],
    growthTimePerPhase: 45, yieldGold: 1200, marketIconGID: 5986,
    unlockCriteria: { totalSold: 55000 },
    seasons: ['Summer'],
    artisanProduct: { name: 'Peach Brandy',         cropInputCount: 5, goldValue:  27000, iconGID: 5986, unlockCropSold:  500 },
  }),
  lettuce: new CropType({
    id: 'lettuce', name: 'Lettuce', sciName: 'Lactuca sativa',
    growthPhaseGIDs: [6229,6230,6231,6232,6233,6234,6235],
    growthPhaseNames: ['Seeded', 'Germinating', 'Seedling', 'Leafing', 'Heading', 'Maturing'],
    growthTimePerPhase: 55, yieldGold: 2500, marketIconGID: 6236,
    unlockCriteria: { totalSold: 8000 },
    seasons: ['Spring', 'Fall', 'Winter'],
    artisanProduct: { name: 'Pickled Lettuce',      cropInputCount: 5, goldValue:  62500, iconGID: 6236, unlockCropSold:  500 },
  }),
  cauliflower: new CropType({
    // Note: sprite is a white brassica head; represents collard greens
    id: 'cauliflower', name: 'Collard Greens', sciName: 'Brassica oleracea var. acephala',
    growthPhaseGIDs: [6479,6480,6481,6482,6483,6484],
    growthPhaseNames: ['Seeded', 'Germinating', 'Seedling', 'Leafing', 'Maturing'],
    growthTimePerPhase: 70, yieldGold: 5500, marketIconGID: 6486,
    unlockCriteria: { totalSold: 140000 },
    seasons: ['Fall', 'Winter', 'Spring'],
    artisanProduct: { name: 'Canned Collard Greens',cropInputCount: 5, goldValue: 137500, iconGID: 6486, unlockCropSold:  500 },
  }),
  rice: new CropType({
    id: 'rice', name: 'Carolina Gold Rice', sciName: 'Oryza sativa',
    growthPhaseGIDs: [6729,6730,6731,6732,6733,6734],
    growthPhaseNames: ['Flooded', 'Seedling', 'Tillering', 'Heading', 'Ripening'],
    growthTimePerPhase: 90, yieldGold: 12000, marketIconGID: 6736,
    unlockCriteria: { totalSold: 210000 },
    seasons: ['Summer'],
    artisanProduct: { name: "Hoppin' John",          cropInputCount: 5, goldValue: 360000, iconGID: 6736, unlockCropSold:  500 },
  }),
  broccoli: new CropType({
    id: 'broccoli', name: 'Broccoli', sciName: 'Brassica oleracea var. italica',
    growthPhaseGIDs: [6979,6980,6981,6982,6983],
    growthPhaseNames: ['Transplanted', 'Vegetative', 'Budding', 'Heading'],
    growthTimePerPhase: 110, yieldGold: 28000, marketIconGID: 6986,
    unlockCriteria: { totalSold: 310000 },
    seasons: ['Spring', 'Fall'],
    artisanProduct: { name: 'Pickled Broccoli',     cropInputCount: 5, goldValue: 840000, iconGID: 6986, unlockCropSold:  500 },
  }),
  asparagus: new CropType({
    // Note: sprite is tall stalks; represents tomato plants
    id: 'asparagus', name: 'Tomato', sciName: 'Solanum lycopersicum',
    growthPhaseGIDs: [7229,7230,7231,7232,7233],
    growthPhaseNames: ['Transplanted', 'Flowering', 'Setting fruit', 'Ripening'],
    growthTimePerPhase: 130, yieldGold: 65000, marketIconGID: 7236,
    unlockCriteria: { totalSold: 450000 },
    seasons: ['Spring', 'Summer'],
    artisanProduct: { name: 'Tomato Sauce',         cropInputCount: 5, goldValue: 2275000, iconGID: 7236, unlockCropSold:  500 },
  }),
};
