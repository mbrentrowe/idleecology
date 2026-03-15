// crops.js - Crop type definitions and growth instance tracking

// ── CropType ────────────────────────────────────────────────────────────────
export class CropType {
  constructor({ id, name, growthPhaseGIDs, growthTimePerPhase, yieldGold, marketIconGID, unlockCriteria, artisanProduct }) {
    this.id = id;
    this.name = name;
    this.growthPhaseGIDs = growthPhaseGIDs;
    this.growthTimePerPhase = growthTimePerPhase;
    this.yieldGold = yieldGold;
    this.marketIconGID = marketIconGID;
    this.unlockCriteria = unlockCriteria || null;
    this.artisanProduct = artisanProduct || null;
  }

  isUnlocked(cropStats, lifetimeGold) {
    if (!this.unlockCriteria) return true;
    const { cropId, cropSold, goldEarned } = this.unlockCriteria;
    const stats = cropStats.get(cropId);
    return stats && stats.sold >= cropSold && lifetimeGold >= goldEarned;
  }

  get totalPhases() { return this.growthPhaseGIDs.length; }
  get totalGrowthTime() { return (this.totalPhases - 1) * this.growthTimePerPhase; }
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
export const CROPS = {
  strawberry: new CropType({
    id: 'strawberry', name: 'Strawberry',
    growthPhaseGIDs: [4479,4480,4481,4482,4483,4484], growthTimePerPhase: 10, yieldGold: 25, marketIconGID: 4486,
    artisanProduct: { name: 'Strawberry Wine', cropInputCount: 5, goldValue: 250, iconGID: 4486, unlockCropSold: 10000 },
  }),
  greenOnion: new CropType({
    id: 'greenOnion', name: 'Green Onion',
    growthPhaseGIDs: [4729,4730,4731,4732,4733,4734], growthTimePerPhase: 8, yieldGold: 45, marketIconGID: 4736,
    unlockCriteria: { cropId: 'strawberry', cropSold: 500, goldEarned: 10000 },
    artisanProduct: { name: 'Pickled Green Onion', cropInputCount: 5, goldValue: 450, iconGID: 4736, unlockCropSold: 10000 },
  }),
  potato: new CropType({
    id: 'potato', name: 'Potato',
    growthPhaseGIDs: [4978,4979,4980,4981,4982,4983,4984], growthTimePerPhase: 8, yieldGold: 85, marketIconGID: 4986,
    unlockCriteria: { cropId: 'greenOnion', cropSold: 1000, goldEarned: 25000 },
    artisanProduct: { name: 'Potato Vodka', cropInputCount: 5, goldValue: 850, iconGID: 4986, unlockCropSold: 10000 },
  }),
  onion: new CropType({
    id: 'onion', name: 'Onion',
    growthPhaseGIDs: [5228,5229,5230,5231,5232,5233,5234], growthTimePerPhase: 8, yieldGold: 160, marketIconGID: 5236,
    unlockCriteria: { cropId: 'potato', cropSold: 1500, goldEarned: 50000 },
    artisanProduct: { name: 'Pickled Onion', cropInputCount: 5, goldValue: 1600, iconGID: 5236, unlockCropSold: 10000 },
  }),
  carrot: new CropType({
    id: 'carrot', name: 'Carrot',
    growthPhaseGIDs: [5479,5480,5481,5482,5483,5484], growthTimePerPhase: 8, yieldGold: 300, marketIconGID: 5486,
    unlockCriteria: { cropId: 'onion', cropSold: 2000, goldEarned: 100000 },
    artisanProduct: { name: 'Pickled Carrot', cropInputCount: 5, goldValue: 3000, iconGID: 5486, unlockCropSold: 10000 },
  }),
  blueberry: new CropType({
    id: 'blueberry', name: 'Blueberry',
    growthPhaseGIDs: [5729,5730,5731,5732,5733,5734], growthTimePerPhase: 8, yieldGold: 600, marketIconGID: 5736,
    unlockCriteria: { cropId: 'carrot', cropSold: 2500, goldEarned: 250000 },
    artisanProduct: { name: 'Blueberry Wine', cropInputCount: 5, goldValue: 6000, iconGID: 5736, unlockCropSold: 10000 },
  }),
  parsnip: new CropType({
    id: 'parsnip', name: 'Parsnip',
    growthPhaseGIDs: [5979,5980,5981,5982,5983], growthTimePerPhase: 8, yieldGold: 1200, marketIconGID: 5986,
    unlockCriteria: { cropId: 'blueberry', cropSold: 3000, goldEarned: 600000 },
    artisanProduct: { name: 'Pickled Parsnip', cropInputCount: 5, goldValue: 12000, iconGID: 5986, unlockCropSold: 10000 },
  }),
  lettuce: new CropType({
    id: 'lettuce', name: 'Lettuce',
    growthPhaseGIDs: [6229,6230,6231,6232,6233,6234,6235], growthTimePerPhase: 8, yieldGold: 2500, marketIconGID: 6236,
    unlockCriteria: { cropId: 'parsnip', cropSold: 3500, goldEarned: 1500000 },
    artisanProduct: { name: 'Pickled Lettuce', cropInputCount: 5, goldValue: 25000, iconGID: 6236, unlockCropSold: 10000 },
  }),
  cauliflower: new CropType({
    id: 'cauliflower', name: 'Cauliflower',
    growthPhaseGIDs: [6479,6480,6481,6482,6483,6484], growthTimePerPhase: 8, yieldGold: 5500, marketIconGID: 6486,
    unlockCriteria: { cropId: 'lettuce', cropSold: 4000, goldEarned: 4000000 },
    artisanProduct: { name: 'Pickled Cauliflower', cropInputCount: 5, goldValue: 55000, iconGID: 6486, unlockCropSold: 10000 },
  }),
  rice: new CropType({
    id: 'rice', name: 'Rice',
    growthPhaseGIDs: [6729,6730,6731,6732,6733,6734], growthTimePerPhase: 8, yieldGold: 12000, marketIconGID: 6736,
    unlockCriteria: { cropId: 'cauliflower', cropSold: 4500, goldEarned: 10000000 },
    artisanProduct: { name: 'Sake', cropInputCount: 5, goldValue: 120000, iconGID: 6736, unlockCropSold: 10000 },
  }),
  broccoli: new CropType({
    id: 'broccoli', name: 'Broccoli',
    growthPhaseGIDs: [6979,6980,6981,6982,6983], growthTimePerPhase: 8, yieldGold: 28000, marketIconGID: 6986,
    unlockCriteria: { cropId: 'rice', cropSold: 5000, goldEarned: 30000000 },
    artisanProduct: { name: 'Pickled Broccoli', cropInputCount: 5, goldValue: 280000, iconGID: 6986, unlockCropSold: 10000 },
  }),
  asparagus: new CropType({
    id: 'asparagus', name: 'Asparagus',
    growthPhaseGIDs: [7229,7230,7231,7232,7233], growthTimePerPhase: 8, yieldGold: 65000, marketIconGID: 7236,
    unlockCriteria: { cropId: 'broccoli', cropSold: 5500, goldEarned: 100000000 },
    artisanProduct: { name: 'Pickled Asparagus', cropInputCount: 5, goldValue: 650000, iconGID: 7236, unlockCropSold: 10000 },
  }),
};
