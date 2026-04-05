#!/usr/bin/env node
/**
 * _build_ecomap.js — Download official EPA/CEC Level II ecoregion boundaries
 * and regenerate ecomap.js with accurate polygon data.
 *
 * Usage:
 *     node _build_ecomap.js
 *
 * Requirements: Node.js >= 14 (uses built-in https, zlib, buffer).
 * No npm packages needed.
 *
 * The script downloads the CEC NA Level II ecoregion shapefile,
 * reads it with a built-in binary parser, reprojects from Lambert Azimuthal
 * Equal Area to WGS84, simplifies polygons, and writes ecomap.js.
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const zlib  = require('zlib');

const OUTPUT = path.join(__dirname, 'ecomap.js');

// ── Download URLs ─────────────────────────────────────────────────────────
const URLS = [
  'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/na_cec_eco_l2.zip',
  'https://gaftp.epa.gov/EPADataCommons/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level2.zip',
  'https://gaftp.epa.gov/EPADataCommons/ORD/Ecoregions/cec_na/na_cec_eco_l2.zip',
];

// ── LAEA projection constants ─────────────────────────────────────────────
const R = 6370997;
const DEG = Math.PI / 180;
const CENTER_LAT = 45 * DEG;
const CENTER_LON = -100 * DEG;
const SIN0 = Math.sin(CENTER_LAT);
const COS0 = Math.cos(CENTER_LAT);

// ── Color palette (official EPA Level II) ─────────────────────────────────
const COLORS = {
  '1.1':'#94b4d1',
  '2.1':'#9b89b8','2.2':'#a898c0','2.3':'#b5a9c8','2.4':'#8878a8',
  '3.1':'#2e7d6f','3.2':'#3a8a7a','3.3':'#4a9a8a','3.4':'#1e6d5f',
  '4.1':'#4faaa3',
  '5.1':'#3a7a5a','5.2':'#4a8a4a','5.3':'#5a9a6a','5.4':'#4a7a3a',
  '6.1':'#2a6a3a','6.2':'#3a8a4a',
  '7.1':'#2a8a5a',
  '8.1':'#6aaa5a','8.2':'#8aba6a','8.3':'#7aaa4a','8.4':'#5a9a4a','8.5':'#6a9a3a',
  '9.2':'#b8c060','9.3':'#c8b860','9.4':'#c8a850','9.5':'#d0c070','9.6':'#b89840',
  '10.1':'#c8b878','10.2':'#d4a858',
  '11.1':'#c89a48',
  '12.1':'#a88838','12.2':'#b89848',
  '13.1':'#8a7a3a','13.2':'#9a8a4a','13.3':'#7a6a2a',
  '14.1':'#d48878','14.2':'#c47868','14.3':'#d49888','14.4':'#b46858','14.5':'#c48070',
  '15.1':'#2aaa6a','15.2':'#3aba7a','15.3':'#1a9a5a','15.4':'#4aca8a',
  '15.5':'#2aaa7a','15.6':'#3aba6a',
};

const SIMPLIFY_TOLERANCE = 0.05;

// ── HTTP download helper ──────────────────────────────────────────────────

function download(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'EcoMapBuilder/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(download(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Zip reader (minimal, handles only stored & deflated entries) ──────────

function readZipEntries(buf) {
  const entries = [];
  // Find End of Central Directory
  let eocdOff = buf.length - 22;
  while (eocdOff >= 0 && buf.readUInt32LE(eocdOff) !== 0x06054b50) eocdOff--;
  if (eocdOff < 0) throw new Error('Not a valid ZIP');

  const cdOffset = buf.readUInt32LE(eocdOff + 16);
  const cdCount  = buf.readUInt16LE(eocdOff + 10);

  let off = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method    = buf.readUInt16LE(off + 10);
    const compSize  = buf.readUInt32LE(off + 20);
    const uncompSz  = buf.readUInt32LE(off + 24);
    const nameLen   = buf.readUInt16LE(off + 28);
    const extraLen  = buf.readUInt16LE(off + 30);
    const commentLn = buf.readUInt16LE(off + 32);
    const localOff  = buf.readUInt32LE(off + 42);
    const name      = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');

    // Read local file header to find data offset
    const lhOff       = localOff;
    const lhNameLen   = buf.readUInt16LE(lhOff + 26);
    const lhExtraLen  = buf.readUInt16LE(lhOff + 28);
    const dataOff     = lhOff + 30 + lhNameLen + lhExtraLen;
    const compressed  = buf.slice(dataOff, dataOff + compSize);

    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressed);
    } else {
      data = null; // unsupported
    }

    entries.push({ name, data, size: uncompSz });
    off += 46 + nameLen + extraLen + commentLn;
  }
  return entries;
}

// ── Shapefile binary reader ───────────────────────────────────────────────

function readSHP(buf) {
  const shapes = [];
  let off = 100; // skip file header

  while (off + 8 < buf.length) {
    const contentLen = buf.readInt32BE(off + 4);
    off += 8;
    const recEnd = off + contentLen * 2;
    if (off + 4 > buf.length) break;

    const shpType = buf.readInt32LE(off);
    off += 4;

    if (shpType === 0) {
      shapes.push(null);
      off = recEnd;
      continue;
    }

    if (shpType === 5 || shpType === 15 || shpType === 25) {
      // Skip bounding box (32 bytes)
      off += 32;
      const numParts  = buf.readInt32LE(off);
      const numPoints = buf.readInt32LE(off + 4);
      off += 8;

      const parts = [];
      for (let i = 0; i < numParts; i++) {
        parts.push(buf.readInt32LE(off));
        off += 4;
      }

      const points = [];
      for (let i = 0; i < numPoints; i++) {
        const x = buf.readDoubleLE(off);
        const y = buf.readDoubleLE(off + 8);
        points.push([x, y]);
        off += 16;
      }

      shapes.push({ parts, points });
      off = recEnd; // skip Z/M data if present
    } else {
      off = recEnd;
      shapes.push(null);
    }
  }
  return shapes;
}

function readDBF(buf) {
  const numRecs    = buf.readUInt32LE(4);
  const headerSize = buf.readUInt16LE(8);
  const recordSize = buf.readUInt16LE(10);

  const fields = [];
  let off = 32;
  while (off < headerSize - 1 && buf[off] !== 0x0D) {
    const name = buf.slice(off, off + 11).toString('ascii').replace(/\0+$/, '');
    const type = String.fromCharCode(buf[off + 11]);
    const size = buf[off + 16];
    fields.push({ name, type, size });
    off += 32;
  }

  const records = [];
  off = headerSize;
  for (let i = 0; i < numRecs; i++) {
    const rec = {};
    let pos = off + 1; // skip deletion flag
    for (const f of fields) {
      const raw = buf.slice(pos, pos + f.size).toString('latin1').trim();
      if (f.type === 'N' || f.type === 'F') {
        rec[f.name] = raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10);
        if (isNaN(rec[f.name])) rec[f.name] = 0;
      } else {
        rec[f.name] = raw;
      }
      pos += f.size;
    }
    records.push(rec);
    off += recordSize;
  }
  return { fields: fields.map(f => f.name), records };
}

// ── Inverse LAEA: projected meters → WGS84 ───────────────────────────────

function inverseLAEA(x, y) {
  const rho = Math.sqrt(x * x + y * y);
  if (rho < 1e-10) return [-100, 45];

  const c    = 2 * Math.asin(Math.min(rho / (2 * R), 1));
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);

  const lat = Math.asin(cosC * SIN0 + y * sinC * COS0 / rho);
  const lon = CENTER_LON + Math.atan2(x * sinC, rho * COS0 * cosC - y * SIN0 * sinC);

  return [lon / DEG, lat / DEG];
}

// ── Douglas-Peucker simplification ────────────────────────────────────────

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0)
    return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.sqrt((p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2);
}

function simplify(coords, tol) {
  if (coords.length <= 3) return coords;
  let dmax = 0, idx = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const d = perpDist(coords[i], coords[0], coords[coords.length - 1]);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > tol) {
    const left  = simplify(coords.slice(0, idx + 1), tol);
    const right = simplify(coords.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [coords[0], coords[coords.length - 1]];
}

// ── Process features ──────────────────────────────────────────────────────

function findField(names, pattern) {
  const pat = pattern.toLowerCase();
  return names.find(n => n.toLowerCase().includes(pat));
}

function processData(shapes, dbf) {
  const codeField = findField(dbf.fields, 'l2code') || findField(dbf.fields, 'l2_code');
  const nameField = findField(dbf.fields, 'l2name') || findField(dbf.fields, 'l2_name');

  if (!codeField) {
    console.error('Available fields:', dbf.fields);
    throw new Error('Cannot find Level II code field');
  }
  console.log(`  Using: code=${codeField}, name=${nameField || '(none)'}`);

  const regions = {};
  const len = Math.min(shapes.length, dbf.records.length);

  for (let i = 0; i < len; i++) {
    const shp = shapes[i];
    if (!shp) continue;

    const rec  = dbf.records[i];
    const code = String(rec[codeField] || '').trim();
    const name = nameField ? String(rec[nameField] || '') : code;
    if (!code) continue;

    if (!regions[code]) regions[code] = { code, name, polygons: [] };

    // Split shape into rings by parts
    const partsIdx = [...shp.parts, shp.points.length];
    for (let j = 0; j < partsIdx.length - 1; j++) {
      const ring = shp.points.slice(partsIdx[j], partsIdx[j + 1]);
      // Reproject to WGS84
      const lonlat = ring.map(([x, y]) => inverseLAEA(x, y));
      // Simplify
      const simplified = simplify(lonlat, SIMPLIFY_TOLERANCE);
      if (simplified.length >= 4) {
        regions[code].polygons.push(
          simplified.map(([lon, lat]) => [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100])
        );
      }
    }
  }
  return regions;
}

// ── Generate JS output ────────────────────────────────────────────────────

function generateJS(regions) {
  const codes = Object.keys(regions).sort((a, b) => {
    const [a1, a2] = a.split('.').map(Number);
    const [b1, b2] = b.split('.').map(Number);
    return a1 - b1 || a2 - b2;
  });

  const entries = codes.map(code => {
    const r = regions[code];
    const color = COLORS[code] || '#888888';
    const nameEsc = r.name.replace(/'/g, "\\'");
    const polys = r.polygons.map(p =>
      '      [' + p.map(c => `[${c[0]},${c[1]}]`).join(',') + ']'
    ).join(',\n');
    return `  {\n    code: '${code}', name: '${nameEsc}',\n    color: '${color}',\n    polygons: [\n${polys}\n    ]\n  }`;
  });

  return `// ecomap.js — EPA/CEC Level II ecoregion polygon boundaries for North America
// Generated by _build_ecomap.js from official EPA shapefile data.
// Projection: Lambert Azimuthal Equal Area (CEC standard for North America)
//
// Source: EPA/CEC Level II Ecoregions of North America
// https://www.epa.gov/eco-research/ecoregions-north-america

// ── Ecoregion polygon data ──────────────────────────────────────────────────
export const ECOREGION_POLYGONS = [
${entries.join(',\n')}
];

// ── Lambert Azimuthal Equal Area projection ───────────────────────────────────
const DEG = Math.PI / 180;
const R = 6370997;
const PHI0 = 45 * DEG;
const LAM0 = -100 * DEG;
const SIN0 = Math.sin(PHI0);
const COS0 = Math.cos(PHI0);

export const MAP_BOUNDS = {
  left:   -4400000,
  right:   3900000,
  top:     4700000,
  bottom: -3400000,
};

export function projectPoint(lon, lat, bounds = MAP_BOUNDS) {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const cosD = Math.cos(lam - LAM0);
  const sinD = Math.sin(lam - LAM0);
  const inner = 1 + SIN0 * sinPhi + COS0 * cosPhi * cosD;
  const k = R * Math.sqrt(2 / Math.max(inner, 1e-10));
  const px = k * cosPhi * sinD;
  const py = k * (COS0 * sinPhi - SIN0 * cosPhi * cosD);
  return {
    x: (px - bounds.left) / (bounds.right - bounds.left),
    y: 1 - (py - bounds.bottom) / (bounds.top - bounds.bottom),
  };
}

export function projectPolygon(coords, bounds = MAP_BOUNDS) {
  return coords.map(([lon, lat]) => projectPoint(lon, lat, bounds));
}

export function inverseProjectPoint(normX, normY, bounds = MAP_BOUNDS) {
  const px = bounds.left + normX * (bounds.right - bounds.left);
  const py = bounds.bottom + (1 - normY) * (bounds.top - bounds.bottom);
  const rho = Math.sqrt(px * px + py * py);
  if (rho < 1e-10) return { lon: -100, lat: 45 };
  const c = 2 * Math.asin(Math.min(rho / (2 * R), 1));
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const lat = Math.asin(cosC * SIN0 + py * sinC * COS0 / rho) / DEG;
  const lon = (LAM0 + Math.atan2(px * sinC, rho * COS0 * cosC - py * SIN0 * sinC)) / DEG;
  return { lon, lat };
}

export const US_BORDER = [
  [-124.7,48.4],[-122.8,48.9],[-117,49],[-110,49],[-104,49],
  [-100,49],[-97.2,49],[-95.2,49],[-95.1,48.6],[-89.5,48],
  [-84.7,46.6],[-82.5,45.3],[-82.5,42.3],[-79.8,42.8],[-79,43.3],
  [-76.8,43.6],[-75,44.8],[-71.5,45],[-70.9,43.3],[-69.7,44.3],
  [-66.9,44.8],[-67.8,47.1],[-69,47.4],[-71.1,45.3],[-74.7,41.1],
  [-73.7,40.6],[-72,41.2],[-71.4,41.5],[-70.6,41.8],[-69.9,41.7],
  [-75.5,39.1],[-75.6,38.4],[-76,37.6],[-76,36.9],[-75.8,35.5],
  [-77.9,34.3],[-79.6,33.1],[-80.5,32.1],[-80.8,31.2],[-81.2,30.3],
  [-80.6,28.8],[-80.2,27.2],[-80,26],[-80.1,25.1],[-81,25.2],
  [-81.5,24.5],[-82.2,24.6],[-82.2,26.6],[-83.6,28.8],[-84.8,29.7],
  [-85.6,30.1],[-87.5,30.3],[-88.5,30.2],[-89.6,30.1],[-89.5,28.9],
  [-91.8,29.5],[-93.8,29.7],[-94.8,29.3],[-96.4,28.5],[-97.1,26],
  [-97.7,25.9],[-99.1,26.4],[-100.3,28.7],[-103.3,29],[-104.5,29.6],
  [-106.4,31.7],[-108.2,31.8],[-111.1,31.3],[-114.7,32.7],
  [-117.1,32.5],[-117.6,33.5],[-118.3,34.1],[-120.6,34.8],
  [-121.8,36.8],[-122.4,37.8],[-122.8,38.5],[-123.7,39.3],
  [-124.2,40.7],[-124.3,42],[-124.1,43.5],[-124,44.6],[-124.5,46.3],
  [-124.7,48.4]
];

export const CODE_TO_GAME_ID = {
  '8.3': 'se_usa_plains',
};
`;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══ Building ecomap.js from EPA Level II data ═══\n');

  // Step 1: Download
  console.log('Step 1: Downloading shapefile...');
  let zipBuf = null;
  for (const url of URLS) {
    console.log(`  Trying: ${url}`);
    try {
      zipBuf = await download(url);
      console.log(`  ✓ Downloaded ${zipBuf.length.toLocaleString()} bytes\n`);
      break;
    } catch (e) {
      console.log(`  ✗ Failed: ${e.message}`);
    }
  }
  if (!zipBuf) {
    console.error('\nERROR: Could not download shapefile.');
    console.error('Download manually from: https://www.epa.gov/eco-research/ecoregions-north-america');
    process.exit(1);
  }

  // Step 2: Extract
  console.log('Step 2: Extracting ZIP...');
  const entries = readZipEntries(zipBuf);
  console.log(`  ${entries.length} entries found`);

  const shpEntry = entries.find(e => e.name.toLowerCase().endsWith('.shp') && e.data);
  const dbfEntry = entries.find(e => e.name.toLowerCase().endsWith('.dbf') && e.data);
  if (!shpEntry || !dbfEntry) {
    console.error('  ERROR: Cannot find .shp/.dbf in ZIP');
    console.error('  Files:', entries.map(e => e.name).join(', '));
    process.exit(1);
  }
  console.log(`  SHP: ${shpEntry.name} (${shpEntry.data.length.toLocaleString()} bytes)`);
  console.log(`  DBF: ${dbfEntry.name} (${dbfEntry.data.length.toLocaleString()} bytes)\n`);

  // Step 3: Parse
  console.log('Step 3: Parsing shapefile...');
  const shapes = readSHP(shpEntry.data);
  const dbf    = readDBF(dbfEntry.data);
  console.log(`  ${shapes.length} shapes, ${dbf.records.length} records\n`);

  // Step 4: Process
  console.log('Step 4: Processing & simplifying...');
  const regions = processData(shapes, dbf);
  const totalPolys = Object.values(regions).reduce((s, r) => s + r.polygons.length, 0);
  const totalVerts = Object.values(regions).reduce((s, r) =>
    s + r.polygons.reduce((vs, p) => vs + p.length, 0), 0);
  console.log(`  ${Object.keys(regions).length} ecoregions, ${totalPolys} polygons, ${totalVerts} vertices\n`);

  // Step 5: Write
  console.log('Step 5: Writing ecomap.js...');
  const js = generateJS(regions);
  fs.writeFileSync(OUTPUT, js, 'utf8');
  console.log(`  ✓ ${OUTPUT} (${js.length.toLocaleString()} bytes)\n`);

  console.log('═══ Done! Reload the game to see the updated map. ═══');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
