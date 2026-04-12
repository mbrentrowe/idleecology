// farmview.js — Canvas-based pixel-art farm view (Phase 1 + Farmer guide)
// Replaces the emoji tile grid with a sprite-sheet-rendered map.

// Use engine-provided CROPS (resolved per-region) instead of global import
import { FARM_ZONE_DEFS } from './game.js';
import { ECOREGIONS } from './ecoregions.js';
import { INVASIVES, INVASIVE_MAP } from './invasives.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAP_W  = 40;
const MAP_H  = 25;
const TILE   = 16;                       // native sprite size in px
const SHEET  = { cols: 125, tile: 16 };  // sprite sheet grid

// ── Seasonal palettes ─────────────────────────────────────────────────────────
// g1/g2 = grass, s1/s2 = soil, n1/n2 = native ground, i1/i2 = invasive ground,
// leaf/leafAlt = tree canopy colours, flower = wildflower accent
const PAL = {
  Spring: { g1:'#6abf5a', g2:'#5daf4d', s1:'#8b7355', s2:'#7e6648',
            n1:'#4d9f3d', n2:'#408f30', i1:'#6b3a3a', i2:'#5e2d2d',
            leaf:'#4dbe4d', leafAlt:'#3da03d', flower:'#ff8080',
            path:'#c4a87a', pathAlt:'#b89a6e' },
  Summer: { g1:'#4d9f3d', g2:'#408f30', s1:'#8b7355', s2:'#7e6648',
            n1:'#3d8f2d', n2:'#307f20', i1:'#5e3333', i2:'#512626',
            leaf:'#2d8f2d', leafAlt:'#257a25', flower:'#ff6060',
            path:'#c4a87a', pathAlt:'#b89a6e' },
  Fall:   { g1:'#9f9f4d', g2:'#8f8f40', s1:'#8b7355', s2:'#7e6648',
            n1:'#7f8f3d', n2:'#6f7f2d', i1:'#6b3a2a', i2:'#5e2d1d',
            leaf:'#cf8f2d', leafAlt:'#bf6020', flower:'#dda040',
            path:'#c4a87a', pathAlt:'#b89a6e' },
  Winter: { g1:'#8fbf9f', g2:'#7faf8f', s1:'#8b7b6b', s2:'#7e6e5e',
            n1:'#6f9f7f', n2:'#5f8f6f', i1:'#5e3e3e', i2:'#513131',
            leaf:'#9fbf9f', leafAlt:'#8faf8f', flower:'#c0c0e0',
            path:'#baa890', pathAlt:'#a89880' },
};

// ── Building decorations (tile coords on the map) ─────────────────────────────
const BUILDINGS = [
  { name: 'Barn',       x: 1,  y: 0, w: 5, h: 2, roof: '#b04040', wall: '#c4a87a' },
  { name: 'Lab',        x: 8,  y: 0, w: 5, h: 2, roof: '#4060a0', wall: '#a8b8c8' },
  { name: 'Greenhouse', x: 22, y: 0, w: 5, h: 2, roof: '#408060', wall: '#8ac4a0' },
];

// ── Farmer walk speed (tiles per animation frame at 15 fps) ───────────────────
const FARMER_SPEED  = 0.12;  // ~1.8 tiles/sec → crosses 40-tile map in ~22s
const DWELL_FRAMES  = 180;   // frames to stay at species tile (~12 sec at 15fps)
const FACT_INTERVAL = 75;    // frames between cycling facts while dwelling (~5s)

// ── Plant lookup cache ────────────────────────────────────────────────────────
const _allPlants = ECOREGIONS.flatMap(e => e.plants);
const _plantById = new Map(_allPlants.map(p => [p.id, p]));

// ── Educational fact generator ────────────────────────────────────────────────
function speciesFacts(tile, engine) {
  const facts = [];
  if (tile.type === 'crop' && tile.cropId) {
    const crops = (engine && engine.CROPS) ? engine.CROPS : (typeof window !== 'undefined' && window.CROPS) ? window.CROPS : {};
    const crop = crops[tile.cropId];
    if (!crop) return facts;
    const sci = crop.sciName || null;
    facts.push({ icon: '🌾', heading: crop.name, text: `Scientific name: ${sci || 'Unknown'}`, sci });
    if (crop.growthPhaseNames?.length)
      facts.push({ icon: '🌱', heading: crop.name, text: `Growth stages: ${crop.growthPhaseNames.join(' → ')}`, sci });
  } else if (tile.type === 'native' && tile.plantId) {
    const plant = _plantById.get(tile.plantId);
    if (!plant) return facts;
    const sci = plant.sci || null;
    facts.push({ icon: plant.icon, heading: plant.name, text: plant.desc || `A native ${plant.type}`, sci });
    if (plant.sci)
      facts.push({ icon: '🔬', heading: plant.name, text: `Scientific name: ${plant.sci}`, sci });
    if (plant.height)
      facts.push({ icon: '📏', heading: plant.name, text: `Height: ${plant.height}`, sci });
    if (plant.seasonOfInterest)
      facts.push({ icon: '📅', heading: plant.name, text: `Season of interest: ${plant.seasonOfInterest}`, sci });
    if (plant.wildlifeNote)
      facts.push({ icon: '🦋', heading: plant.name, text: plant.wildlifeNote, sci });
    if (plant.caterpillarSpp)
      facts.push({ icon: '🐛', heading: plant.name, text: `Supports ${plant.caterpillarSpp} caterpillar species`, sci });
    if (plant.insectsHosted?.length) {
      const ins = plant.insectsHosted[0];
      facts.push({ icon: '🔎', heading: plant.name, text: `Hosts ${ins.name} (${ins.sci}) — ${ins.role}`, sci });
    }
  } else if (tile.type === 'invasive' && tile.invasiveId) {
    const inv = INVASIVE_MAP[tile.invasiveId];
    if (!inv) return facts;
    const sci = inv.sci || null;
    facts.push({ icon: inv.icon, heading: inv.name, text: inv.desc || 'An invasive species', sci });
    if (inv.sci)
      facts.push({ icon: '🔬', heading: inv.name, text: `Scientific name: ${inv.sci}`, sci });
    if (inv.damage)
      facts.push({ icon: '⚠️', heading: inv.name, text: `Damage: ${inv.damage}`, sci });
    if (inv.controlMethod)
      facts.push({ icon: '🛡️', heading: inv.name, text: `Control: ${inv.controlMethod}`, sci });
  }
  return facts;
}

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── FarmView class ────────────────────────────────────────────────────────────
export class FarmView {
  constructor(canvas, engine) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.engine  = engine;
    this.mapW    = MAP_W;
    this.mapH    = MAP_H;

    // Native resolution
    canvas.width  = MAP_W * TILE;
    canvas.height = MAP_H * TILE;

    // Sprite sheet
    this.sheet = new Image();
    this.sheet.src = 'assets/IdleEcologistMasterSpriteSheet.png';
    this.sheetReady = false;
    this.sheet.onload = () => { this.sheetReady = true; };

    // Tile data (flat array, length = MAP_W * MAP_H)
    this.tiles = [];

    // Animation state
    this.running  = false;
    this.frameId  = null;
    this.lastFrame = 0;
    this.FPS       = 15;
    this.frameMs   = 1000 / this.FPS;
    this.animTick  = 0;

    // Season
    this.season = engine.currentSeasonName || 'Spring';
    this.pal    = PAL[this.season] || PAL.Spring;

    // Deterministic per-tile random variation
    const rng = mulberry32(42);
    this.vary = new Uint8Array(MAP_W * MAP_H);
    for (let i = 0; i < this.vary.length; i++) this.vary[i] = (rng() * 256) | 0;

    // ── Farmer character state ────────────────────────────────────────────────
    this.farmer = {
      x: 10, y: 9,         // current position (fractional tiles)
      tx: 10, ty: 9,       // target tile
      state: 'idle',       // 'walking' | 'dwelling' | 'idle'
      dwellTimer: 0,       // frames remaining at current species tile
      factIdx: 0,          // which fact line to show
      factTimer: 0,        // frames until next fact cycle
      facts: [],           // current species facts
      frame: 0,            // animation frame (0 or 1 for walk cycle)
      dir: 0,              // 0=down, 1=left, 2=right, 3=up
      visitedRecent: new Set(), // recently-visited tile indices (avoid repeats)
    };

    // Callback for speech bubble updates (set by main.js)
    this.onSpeechUpdate = null;  // fn({ icon, heading, text }) or fn(null) to hide

    // ── Zoom / camera ─────────────────────────────────────────────────────────
    this.zoom = 1;        // 1 = show full map, >1 = zoomed in
    this.camX = 0;        // camera offset in native pixels (auto-tracked to farmer)
    this.camY = 0;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.updateTiles();
    this._farmerPickTarget();
    this.frameId = requestAnimationFrame(t => this._loop(t));
  }

  stop() {
    this.running = false;
    if (this.frameId) { cancelAnimationFrame(this.frameId); this.frameId = null; }
    // Hide speech bubble on stop
    if (this.onSpeechUpdate) this.onSpeechUpdate(null);
  }

  // ── Main loop (throttled to 15 fps) ─────────────────────────────────────────
  _loop(ts) {
    if (!this.running || !this.canvas.isConnected) { this.stop(); return; }
    if (ts - this.lastFrame >= this.frameMs) {
      this.lastFrame = ts;
      this.animTick++;
      // Re-sync engine state roughly every 4 frames (~250 ms)
      if (this.animTick % 4 === 0) {
        this.season = this.engine.currentSeasonName || 'Spring';
        this.pal    = PAL[this.season] || PAL.Spring;
        this.updateTiles();
      }
      this._farmerUpdate();
      this._render();
    }
    this.frameId = requestAnimationFrame(t => this._loop(t));
  }

  // ── Build tile array from engine state ──────────────────────────────────────
  updateTiles() {
    const eng = this.engine;
    const raw = [];

    // Invasive tiles (descending tier for visual impact)
    const sortedInv = [...INVASIVES].sort((a, b) => b.tier - a.tier);
    for (const inv of sortedInv) {
      const n = eng.invasiveAcres.get(inv.id) ?? 0;
      for (let i = 0; i < n; i++) raw.push({ type: 'invasive', tier: inv.tier, invasiveId: inv.id });
    }
    // Removal queue
    for (const job of eng.invasiveRemovalQueue) {
      const inv = INVASIVE_MAP[job.invasiveId];
      if (!inv) continue;
      for (let i = 0; i < job.acresRemaining; i++) raw.push({ type: 'removing', tier: inv.tier, invasiveId: inv.id });
    }
    // Crop zones
    for (const [zoneName, acres] of eng.zoneAcres) {
      const def = FARM_ZONE_DEFS.find(d => d.name === zoneName);
      if (!def) continue;
      const inst  = eng.zoneCrops.get(zoneName);
      const gid   = inst ? inst.currentGID : null;
      const cropId = def.cropId;
      for (let i = 0; i < acres; i++) raw.push({ type: 'crop', cropId, gid, zoneName });
    }
    // Native plants
    for (const [plantId, acres] of eng.plantedSpeciesAcres) {
      const r = eng.findPlant(plantId);
      const pType = r?.plant?.type || 'flower';
      for (let i = 0; i < acres; i++) raw.push({ type: 'native', plantType: pType, plantId });
    }
    // Establishing
    for (const { plantId } of eng.nativeEstablishQueue) {
      const r = eng.findPlant(plantId);
      raw.push({ type: 'establishing', plantType: r?.plant?.type || 'flower', plantId });
    }
    // Free
    const freeN = Math.max(0, eng.totalLandAcres - raw.length);
    for (let i = 0; i < freeN; i++) raw.push({ type: 'free' });

    this.tiles = this._layout(raw);
  }

  // ── Spatial layout — assign tiles to map zones ──────────────────────────────
  _layout(raw) {
    const W = this.mapW, H = this.mapH, total = W * H;
    const map = new Array(total);

    // Bucket by type
    const buckets = { invasive: [], removing: [], crop: [], native: [], establishing: [], free: [] };
    for (const t of raw) (buckets[t.type] || buckets.free).push(t);

    // Build region coordinate lists (path columns 19-20 are visual-only, not tile slots)
    const farmCoords = [], nativeCoords = [], invCoords = [], freeCoords = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Invasive border: bottom 6 rows + top row + edge columns
        if (y >= H - 6 || y === 0 || x === 0 || x === W - 1) { invCoords.push(y * W + x); continue; }
        // Farm zone: left half (excluding border)
        if (x >= 1 && x <= 19 && y >= 1 && y <= 17) { farmCoords.push(y * W + x); continue; }
        // Native zone: right half (excluding border)
        if (x >= 20 && x <= 38 && y >= 1 && y <= 18) { nativeCoords.push(y * W + x); continue; }
        // Everything else
        freeCoords.push(y * W + x);
      }
    }

    // Fill helper: place tile array into coord list, return overflow & unused coords
    function fill(tiles, coords) {
      const len = Math.min(tiles.length, coords.length);
      for (let i = 0; i < len; i++) map[coords[i]] = tiles[i];
      return { overflow: tiles.slice(len), unused: coords.slice(len) };
    }

    // 1) Invasives → border region
    const allInv = [...buckets.invasive, ...buckets.removing];
    const invRes = fill(allInv, invCoords);

    // 2) Crops → farm region
    const cropRes = fill(buckets.crop, farmCoords);

    // 3) Natives → habitat region
    const allNat = [...buckets.native, ...buckets.establishing];
    const natRes = fill(allNat, nativeCoords);

    // 4) Remaining + free → leftover slots
    const overflow   = [...invRes.overflow, ...cropRes.overflow, ...natRes.overflow];
    const freeSlots  = [...cropRes.unused, ...natRes.unused, ...invRes.unused, ...freeCoords];
    const remaining  = [...overflow, ...buckets.free];
    const fillLen    = Math.min(remaining.length, freeSlots.length);
    for (let i = 0; i < fillLen; i++) map[freeSlots[i]] = remaining[i];
    // Fill any truly empty slots
    for (let i = fillLen; i < freeSlots.length; i++) map[freeSlots[i]] = { type: 'free' };

    // Safety: null guard
    for (let i = 0; i < total; i++) if (!map[i]) map[i] = { type: 'free' };
    return map;
  }

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  setZoom(z) {
    this.zoom = Math.max(1, Math.min(z, 5));
  }

  _updateCamera() {
    const z = this.zoom;
    if (z <= 1) { this.camX = 0; this.camY = 0; return; }
    const f = this.farmer;
    const nw = this.canvas.width, nh = this.canvas.height;
    // Viewport size in native pixels at current zoom
    const vw = nw / z, vh = nh / z;
    // Center on farmer
    let cx = f.x * TILE - vw / 2 + TILE / 2;
    let cy = f.y * TILE - vh / 2 + TILE / 2;
    // Clamp so we don't show outside the map
    cx = Math.max(0, Math.min(cx, nw - vw));
    cy = Math.max(0, Math.min(cy, nh - vh));
    // Smooth toward target (lerp)
    this.camX += (cx - this.camX) * 0.15;
    this.camY += (cy - this.camY) * 0.15;
  }

  // ── Full-frame render ───────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx, W = this.mapW, H = this.mapH, ts = TILE, p = this.pal;
    const z = this.zoom;
    this._updateCamera();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-this.camX, -this.camY);

    // 1. Ground + features
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx  = y * W + x;
        const tile = this.tiles[idx];
        const v    = this.vary[idx];        // deterministic random 0-255
        const px   = x * ts, py = y * ts;
        this._drawTile(ctx, px, py, ts, tile, v, p);
        // Visual path overlay on zone divider columns
        if (x === 19 || x === 20) {
          ctx.fillStyle = (v & 1) ? p.path : p.pathAlt;
          ctx.fillRect(px, py, ts, ts);
          ctx.fillStyle = p.pathAlt;
          ctx.fillRect(px, py, ts, 1);
          ctx.fillRect(px, py + ts - 1, ts, 1);
        }
      }
    }

    // 2. Building overlay
    for (const b of BUILDINGS) this._drawBuilding(ctx, b, ts, p);

    // 3. Farmer character
    this._drawFarmer(ctx, ts);

    // 4. Subtle grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x++) {
      ctx.beginPath(); ctx.moveTo(x * ts, 0); ctx.lineTo(x * ts, H * ts); ctx.stroke();
    }
    for (let y = 0; y <= H; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * ts); ctx.lineTo(W * ts, y * ts); ctx.stroke();
    }

    ctx.restore();
  }

  // ── Single tile ─────────────────────────────────────────────────────────────
  _drawTile(ctx, px, py, ts, tile, v, p) {
    switch (tile.type) {
      case 'crop':       this._drawCropTile(ctx, px, py, ts, tile, v, p); break;
      case 'native':     this._drawNativeTile(ctx, px, py, ts, tile, v, p); break;
      case 'invasive':   this._drawInvasiveTile(ctx, px, py, ts, tile, v, p); break;
      case 'removing':   this._drawRemovingTile(ctx, px, py, ts, tile, v, p); break;
      case 'establishing': this._drawEstablishingTile(ctx, px, py, ts, tile, v, p); break;
      case 'free':
      default:           this._drawFreeTile(ctx, px, py, ts, v, p); break;
    }
  }

  // ── Tile type renderers ─────────────────────────────────────────────────────

  _drawFreeTile(ctx, px, py, ts, v, p) {
    ctx.fillStyle = (v & 1) ? p.g1 : p.g2;
    ctx.fillRect(px, py, ts, ts);
    // Sparse grass tufts
    if (v > 200) {
      ctx.fillStyle = p.g2;
      ctx.fillRect(px + (v % 10) + 2, py + 9, 1, 4);
      ctx.fillRect(px + (v % 7) + 5, py + 8, 1, 5);
    }
  }

  _drawCropTile(ctx, px, py, ts, tile, v, p) {
    // Tilled soil base
    ctx.fillStyle = (v & 1) ? p.s1 : p.s2;
    ctx.fillRect(px, py, ts, ts);
    // Soil furrow lines
    ctx.fillStyle = p.s2;
    ctx.fillRect(px, py + 4, ts, 1);
    ctx.fillRect(px, py + 9, ts, 1);
    ctx.fillRect(px, py + 14, ts, 1);
    // Crop sprite from sheet
    if (tile.gid && this.sheetReady) {
      this._drawSprite(ctx, tile.gid, px, py, ts);
    }
  }

  _drawNativeTile(ctx, px, py, ts, tile, v, p) {
    // Lush green base
    ctx.fillStyle = (v & 1) ? p.n1 : p.n2;
    ctx.fillRect(px, py, ts, ts);
    // Draw plant based on type
    this._drawPlantDecor(ctx, px, py, ts, tile.plantType, v, p);
  }

  _drawInvasiveTile(ctx, px, py, ts, tile, v, p) {
    // Dark ground
    ctx.fillStyle = (v & 1) ? p.i1 : p.i2;
    ctx.fillRect(px, py, ts, ts);
    // Thorny cross-hatch
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 2); ctx.lineTo(px + ts - 2, py + ts - 2);
    ctx.moveTo(px + ts - 2, py + 2); ctx.lineTo(px + 2, py + ts - 2);
    ctx.stroke();
    // Tier glow (brighter = more dominant)
    if (tile.tier === 3) {
      ctx.fillStyle = 'rgba(200,50,50,0.15)';
      ctx.fillRect(px, py, ts, ts);
    } else if (tile.tier === 2) {
      ctx.fillStyle = 'rgba(200,100,50,0.10)';
      ctx.fillRect(px, py, ts, ts);
    }
    // Spiky thorns at edges
    ctx.fillStyle = '#3a1a1a';
    ctx.fillRect(px, py, 2, 2);
    ctx.fillRect(px + ts - 2, py, 2, 2);
    ctx.fillRect(px, py + ts - 2, 2, 2);
    ctx.fillRect(px + ts - 2, py + ts - 2, 2, 2);
  }

  _drawRemovingTile(ctx, px, py, ts, tile, v, p) {
    this._drawInvasiveTile(ctx, px, py, ts, tile, v, p);
    // Pulsing highlight to show active removal
    const pulse = 0.15 + 0.10 * Math.sin(this.animTick * 0.3);
    ctx.fillStyle = `rgba(255,255,100,${pulse})`;
    ctx.fillRect(px, py, ts, ts);
  }

  _drawEstablishingTile(ctx, px, py, ts, tile, v, p) {
    // Dim native-style tile
    ctx.fillStyle = (v & 1) ? p.n1 : p.n2;
    ctx.fillRect(px, py, ts, ts);
    // Plant decor at reduced opacity
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.animTick * 0.2);
    this._drawPlantDecor(ctx, px, py, ts, tile.plantType, v, p);
    ctx.globalAlpha = 1;
  }

  // ── Plant decoration (trees, flowers, shrubs, grass) ────────────────────────
  _drawPlantDecor(ctx, px, py, ts, plantType, v, p) {
    switch (plantType) {
      case 'tree': {
        // Trunk
        ctx.fillStyle = '#6a4a2a';
        ctx.fillRect(px + 6, py + 9, 4, 7);
        // Canopy
        ctx.fillStyle = (v & 2) ? p.leaf : p.leafAlt;
        ctx.fillRect(px + 3, py + 2, 10, 8);
        ctx.fillRect(px + 5, py + 1, 6, 1);
        break;
      }
      case 'flower': {
        // Stem
        ctx.fillStyle = '#3a7a3a';
        ctx.fillRect(px + 7, py + 7, 2, 8);
        // Petals
        ctx.fillStyle = p.flower;
        ctx.fillRect(px + 5, py + 4, 6, 4);
        // Centre
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(px + 7, py + 5, 2, 2);
        break;
      }
      case 'shrub': {
        ctx.fillStyle = (v & 2) ? p.leaf : p.leafAlt;
        ctx.fillRect(px + 2, py + 5, 12, 8);
        ctx.fillRect(px + 4, py + 3, 8, 3);
        break;
      }
      case 'vine': {
        ctx.fillStyle = '#3a8a3a';
        // Winding vine pattern
        ctx.fillRect(px + 2, py + 4, 3, 2);
        ctx.fillRect(px + 5, py + 6, 3, 2);
        ctx.fillRect(px + 8, py + 4, 3, 2);
        ctx.fillRect(px + 11, py + 6, 3, 2);
        // Small leaves
        ctx.fillStyle = p.leaf;
        ctx.fillRect(px + 3, py + 2, 2, 2);
        ctx.fillRect(px + 9, py + 2, 2, 2);
        break;
      }
      case 'fern': {
        ctx.fillStyle = p.leaf;
        // Frond shapes
        ctx.fillRect(px + 7, py + 3, 2, 12);
        ctx.fillRect(px + 4, py + 5, 3, 2);
        ctx.fillRect(px + 9, py + 5, 3, 2);
        ctx.fillRect(px + 3, py + 8, 4, 2);
        ctx.fillRect(px + 9, py + 8, 4, 2);
        break;
      }
      case 'grass':
      default: {
        // Tall grass blades
        ctx.fillStyle = p.leaf;
        ctx.fillRect(px + 3, py + 6, 2, 9);
        ctx.fillRect(px + 7, py + 4, 2, 11);
        ctx.fillRect(px + 11, py + 7, 2, 8);
        // Tips
        ctx.fillStyle = p.leafAlt;
        ctx.fillRect(px + 3, py + 5, 2, 1);
        ctx.fillRect(px + 7, py + 3, 2, 1);
        ctx.fillRect(px + 11, py + 6, 2, 1);
        break;
      }
    }
  }

  // ── Sprite from sheet by GID ────────────────────────────────────────────────
  _drawSprite(ctx, gid, px, py, destSize) {
    const col = (gid - 1) % SHEET.cols;
    const row = Math.floor((gid - 1) / SHEET.cols);
    ctx.drawImage(
      this.sheet,
      col * SHEET.tile, row * SHEET.tile, SHEET.tile, SHEET.tile,
      px, py, destSize, destSize
    );
  }

  // ── Building overlay ────────────────────────────────────────────────────────
  _drawBuilding(ctx, bld, ts) {
    const bx = bld.x * ts, by = bld.y * ts;
    const bw = bld.w * ts, bh = bld.h * ts;
    const roofH = Math.round(bh * 0.4);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(bx + 3, by + 3, bw, bh);

    // Wall
    ctx.fillStyle = bld.wall;
    ctx.fillRect(bx, by + roofH, bw, bh - roofH);

    // Wall detail — horizontal plank lines
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let ly = by + roofH + 4; ly < by + bh; ly += 5) {
      ctx.fillRect(bx, ly, bw, 1);
    }

    // Roof
    ctx.fillStyle = bld.roof;
    ctx.beginPath();
    ctx.moveTo(bx - 3, by + roofH);
    ctx.lineTo(bx + bw / 2, by);
    ctx.lineTo(bx + bw + 3, by + roofH);
    ctx.closePath();
    ctx.fill();

    // Door
    ctx.fillStyle = '#5a3a1a';
    const dw = Math.max(4, Math.round(ts * 0.5));
    const dh = Math.max(6, Math.round((bh - roofH) * 0.6));
    ctx.fillRect(bx + Math.round(bw / 2 - dw / 2), by + bh - dh, dw, dh);

    // Windows
    ctx.fillStyle = '#8acce8';
    const wy = by + roofH + 3;
    const wsz = Math.max(3, Math.round(ts * 0.35));
    if (bld.w >= 4) {
      ctx.fillRect(bx + ts * 0.6, wy, wsz, wsz);
      ctx.fillRect(bx + bw - ts * 0.6 - wsz, wy, wsz, wsz);
    }

    // Name plate
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bld.name, bx + bw / 2, by + bh + 9);
    ctx.textAlign = 'start';
  }

  // ── Farmer AI ───────────────────────────────────────────────────────────────

  /** Pick the next species tile for the farmer to visit */
  _farmerPickTarget() {
    const f = this.farmer;
    const W = this.mapW;
    // Collect one representative tile per unique species
    const speciesTiles = new Map(); // speciesKey → tile index
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      let key = null;
      if (t.type === 'crop' && t.cropId) key = `crop:${t.cropId}`;
      else if (t.type === 'native' && t.plantId) key = `native:${t.plantId}`;
      else if (t.type === 'invasive' && t.invasiveId) key = `inv:${t.invasiveId}`;
      if (key && !speciesTiles.has(key)) speciesTiles.set(key, i);
    }
    if (speciesTiles.size === 0) {
      f.state = 'idle';
      return;
    }
    // Filter out recently visited species (unless all are visited)
    const allKeys = [...speciesTiles.keys()];
    let pool = allKeys.filter(k => !f.visitedRecent.has(k));
    if (pool.length === 0) { f.visitedRecent.clear(); pool = allKeys; }
    const pickKey = pool[Math.floor(Math.random() * pool.length)];
    const pick = speciesTiles.get(pickKey);
    f.tx = pick % W;
    f.ty = Math.floor(pick / W);
    f.state = 'walking';
    f.visitedRecent.add(pickKey);
    // Cap recent set
    if (f.visitedRecent.size > Math.min(15, speciesTiles.size - 1)) {
      const iter = f.visitedRecent.values();
      f.visitedRecent.delete(iter.next().value);
    }
  }

  /** Per-frame farmer update: walk toward target or dwell */
  _farmerUpdate() {
    const f = this.farmer;
    if (f.state === 'walking') {
      const dx = f.tx - f.x, dy = f.ty - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < FARMER_SPEED) {
        // Arrived
        f.x = f.tx; f.y = f.ty;
        f.state = 'dwelling';
        f.dwellTimer = DWELL_FRAMES;
        f.factIdx = 0;
        f.factTimer = 0;
        // Generate facts for current tile
        const idx = f.ty * this.mapW + f.tx;
        f.facts = speciesFacts(this.tiles[idx] || { type: 'free' }, this.engine);
        // Show first fact
        this._emitFact(f);
      } else {
        // Move toward target
        const mx = (dx / dist) * FARMER_SPEED;
        const my = (dy / dist) * FARMER_SPEED;
        f.x += mx; f.y += my;
        // Direction for sprite
        if (Math.abs(dx) > Math.abs(dy)) f.dir = dx > 0 ? 2 : 1;
        else f.dir = dy > 0 ? 0 : 3;
        // Walk frame toggle every 8 frames
        if (this.animTick % 8 === 0) f.frame = f.frame ? 0 : 1;
      }
    } else if (f.state === 'dwelling') {
      f.dwellTimer--;
      f.factTimer++;
      // Cycle to next fact
      if (f.factTimer >= FACT_INTERVAL && f.facts.length > 1) {
        f.factTimer = 0;
        f.factIdx = (f.factIdx + 1) % f.facts.length;
        this._emitFact(f);
      }
      if (f.dwellTimer <= 0) {
        f.state = 'idle';
        if (this.onSpeechUpdate) this.onSpeechUpdate(null);
        // Pick next target after a brief pause
        setTimeout(() => { if (this.running) this._farmerPickTarget(); }, 400);
      }
    } else {
      // Idle — wait for next target (handled by timeout above)
    }
  }

  _emitFact(f) {
    if (f.facts.length === 0) return;
    const fact = f.facts[f.factIdx % f.facts.length];
    if (this.onSpeechUpdate) {
      // Pass farmer pixel position so the bubble can position itself
      // Account for zoom + camera offset
      const scale = this.canvas.clientWidth / this.canvas.width;
      const z = this.zoom;
      this.onSpeechUpdate({
        ...fact,
        farmerPx: Math.round((f.x * TILE - this.camX) * z * scale),
        farmerPy: Math.round((f.y * TILE - this.camY) * z * scale),
        factNum:  f.factIdx + 1,
        factTotal: f.facts.length,
      });
    }
  }

  // ── Farmer sprite (drawn on canvas) ─────────────────────────────────────────
  _drawFarmer(ctx, ts) {
    const f = this.farmer;
    const px = Math.round(f.x * ts);
    const py = Math.round(f.y * ts);

    // Body (overalls blue)
    ctx.fillStyle = '#4a6a9f';
    ctx.fillRect(px + 4, py + 6, 8, 7);
    // Head (skin tone)
    ctx.fillStyle = '#e8c090';
    ctx.fillRect(px + 5, py + 2, 6, 5);
    // Hat (straw yellow)
    ctx.fillStyle = '#d4a040';
    ctx.fillRect(px + 3, py + 1, 10, 3);
    ctx.fillRect(px + 5, py + 0, 6, 1);
    // Eyes
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(px + 6, py + 4, 1, 1);
    ctx.fillRect(px + 9, py + 4, 1, 1);
    // Legs with walk cycle
    ctx.fillStyle = '#5a3a1a';
    if (f.state === 'walking' && f.frame === 1) {
      ctx.fillRect(px + 5, py + 13, 3, 3);
      ctx.fillRect(px + 9, py + 12, 3, 3);
    } else {
      ctx.fillRect(px + 5, py + 13, 3, 3);
      ctx.fillRect(px + 8, py + 13, 3, 3);
    }
    // Arms
    ctx.fillStyle = '#e8c090';
    ctx.fillRect(px + 2, py + 7, 2, 4);
    ctx.fillRect(px + 12, py + 7, 2, 4);

    // Dwelling indicator — small bouncing dot above head
    if (f.state === 'dwelling') {
      const bY = py - 3 + Math.sin(this.animTick * 0.25) * 2;
      ctx.fillStyle = '#ffdd44';
      ctx.fillRect(px + 7, bY, 2, 2);
    }
  }
}
