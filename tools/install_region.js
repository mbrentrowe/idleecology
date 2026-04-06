const fs = require('fs');
const path = require('path');

function die(msg) { console.error(msg); process.exit(1); }

function usage() {
  console.log('Usage: node tools/install_region.js --ecoregion <file> --birds <file> --bundle <file>');
  process.exit(1);
}

const argv = process.argv.slice(2);
if (!argv.length) usage();

let ecoregionPath = null;
let birdsPath = null;
let bundlePath = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--ecoregion') ecoregionPath = argv[++i];
  else if (a === '--birds') birdsPath = argv[++i];
  else if (a === '--bundle') bundlePath = argv[++i];
  else usage();
}

if (!ecoregionPath || !birdsPath || !bundlePath) usage();

function readFileTrim(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { die(`Failed to read ${p}: ${e.message}`); }
}

const ecoregionCode = readFileTrim(ecoregionPath);
const birdsCode = readFileTrim(birdsPath);
const bundleCode = readFileTrim(bundlePath);

// try to extract region id from the ecoregion snippet using regex
const idMatch = ecoregionCode.match(/id:\s*['"]([a-z0-9_\-]+)['"]/i);
if (!idMatch) die('Could not extract region id from ecoregion file (expecting `id: \'region_id\'`).');
const regionId = idMatch[1];

function toImportVar(name) {
  // Make a safe JS identifier: uppercase and replace non-alnum with underscore
  let v = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!/^[A-Z]/.test(v)) v = 'R_' + v;
  return v;
}

const regionVar = toImportVar(regionId);

// Write birds file to repo root (birds_<regionId>.js)
const birdsOut = path.join(process.cwd(), `birds_${regionId}.js`);
fs.writeFileSync(birdsOut, birdsCode, 'utf8');
console.log(`Wrote birds file: ${birdsOut}`);

// Write region bundle into regions/<regionId>.js
const regionsDir = path.join(process.cwd(), 'regions');
if (!fs.existsSync(regionsDir)) die('regions/ directory not found in repo root.');
const bundleOut = path.join(regionsDir, `${regionId}.js`);
fs.writeFileSync(bundleOut, bundleCode, 'utf8');
console.log(`Wrote region bundle: ${bundleOut}`);

// Insert ecoregion code into ecoregions.js
const ecoregionsPath = path.join(process.cwd(), 'ecoregions.js');
let ecoregionsText = readFileTrim(ecoregionsPath);

function findArrayEndIndex(src, startIdx) {
  // Find the matching closing ] for the array starting at startIdx (index of '[')
  let i = startIdx;
  let depth = 0;
  let inStr = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) { inStr = null; }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
    if (ch === '[') { depth++; }
    else if (ch === ']') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

const marker = 'export const ECOREGIONS = [';
const markerIdx = ecoregionsText.indexOf(marker);
if (markerIdx === -1) die('Could not find ECOREGIONS declaration in ecoregions.js');
const bracketStart = ecoregionsText.indexOf('[', markerIdx);
const bracketEnd = findArrayEndIndex(ecoregionsText, bracketStart);
if (bracketEnd === -1) die('Failed to locate end of ECOREGIONS array in ecoregions.js');

// Prepare the snippet - trim leading/trailing whitespace
let snippet = ecoregionCode.trim();

// Make sure snippet begins with '{' or a comment+object; insert as-is with a preceding comma
const before = ecoregionsText.slice(0, bracketEnd).replace(/\s*$/,'');
const after = ecoregionsText.slice(bracketEnd);
let insertion = '\n\n' + snippet + '\n\n';

// If array currently not empty, ensure a trailing comma before inserting
const trimmedBefore = before.trimEnd();
if (!trimmedBefore.endsWith('[') && !trimmedBefore.endsWith(',')) insertion = ',' + insertion;

ecoregionsText = before + insertion + after;
fs.writeFileSync(ecoregionsPath, ecoregionsText, 'utf8');
console.log(`Inserted ecoregion entry into ${ecoregionsPath}`);

// Update regions/registry.js: add import and append to REGIONS array
const registryPath = path.join(process.cwd(), 'regions', 'registry.js');
let registryText = readFileTrim(registryPath);

// Insert import before the 'All available regions' comment
const insertBeforeMarker = '/** All available regions, in unlock order. */';
const commentIdx = registryText.indexOf(insertBeforeMarker);
if (commentIdx === -1) die('Could not find insertion point in registry.js');
// find line start of that comment
const importInsertPos = registryText.lastIndexOf('\n', commentIdx) + 1;
const importLine = `import ${regionVar} from './${regionId}.js';\n`;
registryText = registryText.slice(0, importInsertPos) + importLine + registryText.slice(importInsertPos);

// Now append to REGIONS array
const regionsMarker = 'export const REGIONS = [';
const regionsIdx = registryText.indexOf(regionsMarker);
if (regionsIdx === -1) die('Could not find REGIONS array in registry.js');
const regionsBracketStart = registryText.indexOf('[', regionsIdx);
const regionsBracketEnd = findArrayEndIndex(registryText, regionsBracketStart);
if (regionsBracketEnd === -1) die('Failed to locate end of REGIONS array in registry.js');

const regBefore = registryText.slice(0, regionsBracketEnd).replace(/\s*$/,'');
const regAfter = registryText.slice(regionsBracketEnd);
let regInsertion = `\n  ${regionVar},\n`;
// If array currently empty or already ends with comma, we still insert variable
registryText = regBefore + regInsertion + regAfter;

fs.writeFileSync(registryPath, registryText, 'utf8');
console.log(`Updated registry: added import and appended ${regionVar} to REGIONS in ${registryPath}`);

console.log('Region installation complete. Review changes and run tests if available.');
