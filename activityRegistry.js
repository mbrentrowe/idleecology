// activityRegistry.js — exact copy shared with the canvas prototype

export const WORK_ACTIVITIES = [
  {
    key: 'artisan',
    mapLayerName: 'artisanzones',
    zonePrefix: 'ArtisanZone',
    displayName: 'Artisan goods',
    color: '#c47a3a',
    alwaysActive: true,

    computeZoneCost(rank) {
      return Math.round(75000 * Math.pow(3, rank));
    },
    defaultZoneCost: 75000,

    productionIntervalSecs: 5,

    loadZones(objects) {
      return objects.map((obj, i) => ({
        ...obj,
        name: `${this.zonePrefix}${String(i + 1).padStart(2, '0')}`,
      }));
    },

    initProductStats(CROPS) {
      const m = new Map();
      Object.values(CROPS).forEach(ct => {
        if (ct.artisanProduct) m.set(`${ct.id}_artisan`, { crafted: 0, sold: 0, lifetimeSales: 0 });
      });
      return m;
    },

    produce(zone, { zoneProductMap, cropInventory, cropStats, productStats,
                    productInventory, autoSellSet, gold, CROPS }) {
      const cropId = zoneProductMap.get(zone.name);
      if (!cropId) return null;
      const cropType = CROPS[cropId];
      if (!cropType?.artisanProduct) return null;
      const ap = cropType.artisanProduct;
      if ((cropStats.get(cropId)?.sold ?? 0) < ap.unlockCropSold) return null;
      const have = cropInventory.get(cropId) || 0;
      if (have < ap.cropInputCount) return null;

      cropInventory.set(cropId, have - ap.cropInputCount);
      const productKey = `${cropId}_artisan`;
      const stat = productStats.get(productKey);
      if (stat) stat.crafted += 1;
      if (autoSellSet.has(productKey)) {
        gold.add(ap.goldValue);
        if (stat) { stat.sold += 1; stat.lifetimeSales += ap.goldValue; }
      } else {
        productInventory.set(productKey, (productInventory.get(productKey) || 0) + 1);
      }
      return productKey;
    },

    hasWork(zone, { zoneProductMap, cropInventory, cropStats, CROPS }) {
      const cropId = zoneProductMap.get(zone.name);
      if (!cropId) return false;
      const ct = CROPS[cropId];
      if (!ct?.artisanProduct) return false;
      const ap = ct.artisanProduct;
      return (cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold
          && (cropInventory.get(cropId) || 0) >= ap.cropInputCount;
    },

    getGPS(zone, { zoneProductMap, cropStats, autoSellSet, gameSpeed, CROPS, productionIntervalSecs }) {
      const cropId = zoneProductMap.get(zone.name);
      if (!cropId) return 0;
      const ct = CROPS[cropId];
      if (!ct?.artisanProduct) return 0;
      const ap = ct.artisanProduct;
      if ((cropStats.get(cropId)?.sold ?? 0) < ap.unlockCropSold) return 0;
      if (!autoSellSet.has(`${cropId}_artisan`)) return 0;
      return ap.goldValue * gameSpeed / productionIntervalSecs;
    },

    getProductLabel(productKey, CROPS) {
      const cropId = productKey.replace('_artisan', '');
      return CROPS[cropId]?.artisanProduct?.name ?? productKey;
    },
  },
];
