#!/usr/bin/env python3
"""
_build_ecomap.py — Download official EPA/CEC Level II ecoregion boundaries
and regenerate ecomap.js with accurate polygon data.

Usage:
    python3 _build_ecomap.py

Requirements (tries in order):
  1. ogr2ogr (from GDAL package) — preferred
     Install: apt install gdal-bin  OR  brew install gdal
  2. pyshp (pure Python shapefile reader) — fallback
     Install: pip install pyshp

The script downloads the CEC North America Level II ecoregion shapefile,
converts/reprojects it to WGS84 lat/lon, simplifies polygons for efficient
canvas rendering, and outputs ecomap.js.
"""

import json, math, os, struct, subprocess, sys, tempfile, textwrap, zipfile
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR / 'ecomap.js'

# ── Download URLs (tried in order) ─────────────────────────────────────────
SHAPEFILE_URLS = [
    'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/na_cec_eco_l2.zip',
    'https://gaftp.epa.gov/EPADataCommons/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level2.zip',
    'https://gaftp.epa.gov/EPADataCommons/ORD/Ecoregions/cec_na/na_cec_eco_l2.zip',
]

# ── Lambert Azimuthal Equal Area parameters (CEC standard for NA) ──────────
R_SPHERE = 6370997.0  # Earth sphere radius in meters
CENTER_LAT_DEG = 45.0
CENTER_LON_DEG = -100.0
CENTER_LAT = math.radians(CENTER_LAT_DEG)
CENTER_LON = math.radians(CENTER_LON_DEG)
SIN_CENTER = math.sin(CENTER_LAT)
COS_CENTER = math.cos(CENTER_LAT)

# ── Color palette matching official EPA Level II map ───────────────────────
COLORS = {
    '1.1': '#94b4d1',
    '2.1': '#9b89b8', '2.2': '#a898c0', '2.3': '#b5a9c8', '2.4': '#8878a8',
    '3.1': '#2e7d6f', '3.2': '#3a8a7a', '3.3': '#4a9a8a', '3.4': '#1e6d5f',
    '4.1': '#4faaa3',
    '5.1': '#3a7a5a', '5.2': '#4a8a4a', '5.3': '#5a9a6a', '5.4': '#4a7a3a',
    '6.1': '#2a6a3a', '6.2': '#3a8a4a',
    '7.1': '#2a8a5a',
    '8.1': '#6aaa5a', '8.2': '#8aba6a', '8.3': '#7aaa4a', '8.4': '#5a9a4a', '8.5': '#6a9a3a',
    '9.2': '#b8c060', '9.3': '#c8b860', '9.4': '#c8a850', '9.5': '#d0c070', '9.6': '#b89840',
    '10.1': '#c8b878', '10.2': '#d4a858',
    '11.1': '#c89a48',
    '12.1': '#a88838', '12.2': '#b89848',
    '13.1': '#8a7a3a', '13.2': '#9a8a4a', '13.3': '#7a6a2a',
    '14.1': '#d48878', '14.2': '#c47868', '14.3': '#d49888', '14.4': '#b46858', '14.5': '#c48070',
    '15.1': '#2aaa6a', '15.2': '#3aba7a', '15.3': '#1a9a5a', '15.4': '#4aca8a',
    '15.5': '#2aaa7a', '15.6': '#3aba6a',
}

# Simplification tolerance in degrees (~0.05° ≈ 5km)
SIMPLIFY_TOLERANCE = 0.05

# ── Download & extract ─────────────────────────────────────────────────────

def download_shapefile(tmp_dir):
    """Download and extract the EPA Level II shapefile. Returns path to .shp."""
    zip_path = os.path.join(tmp_dir, 'eco_l2.zip')

    for url in SHAPEFILE_URLS:
        print(f'  Trying: {url}')
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 EcoMapBuilder/1.0'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            with open(zip_path, 'wb') as f:
                f.write(data)
            print(f'  ✓ Downloaded {len(data):,} bytes')
            break
        except Exception as e:
            print(f'  ✗ Failed: {e}')
    else:
        print('\nERROR: Could not download shapefile from any URL.')
        print('You can manually download from:')
        print('  https://www.epa.gov/eco-research/ecoregions-north-america')
        print('Place the .zip in this directory and re-run.')
        sys.exit(1)

    extract_dir = os.path.join(tmp_dir, 'shp')
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)

    for root, _dirs, files in os.walk(extract_dir):
        for f in files:
            if f.lower().endswith('.shp'):
                return os.path.join(root, f)

    print('ERROR: No .shp file found in the downloaded archive.')
    sys.exit(1)

# ── Conversion approach 1: ogr2ogr (GDAL) ─────────────────────────────────

def try_ogr2ogr(shp_path, tmp_dir):
    """Convert shapefile to WGS84 GeoJSON using ogr2ogr. Returns GeoJSON dict or None."""
    try:
        subprocess.run(['ogr2ogr', '--version'], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None

    geojson_path = os.path.join(tmp_dir, 'eco_l2.geojson')
    cmd = ['ogr2ogr', '-f', 'GeoJSON', '-t_srs', 'EPSG:4326', geojson_path, shp_path]
    print(f'  Running: {" ".join(cmd)}')
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'  ogr2ogr failed: {result.stderr}')
        return None

    with open(geojson_path) as f:
        return json.load(f)

# ── Conversion approach 2: pyshp + manual reprojection ─────────────────────

def inverse_laea(x, y):
    """Inverse Lambert Azimuthal Equal Area: projected meters → (lon_deg, lat_deg)."""
    rho = math.sqrt(x * x + y * y)
    if rho < 1e-10:
        return (CENTER_LON_DEG, CENTER_LAT_DEG)

    c = 2.0 * math.asin(min(rho / (2.0 * R_SPHERE), 1.0))
    sin_c = math.sin(c)
    cos_c = math.cos(c)

    lat = math.asin(cos_c * SIN_CENTER + y * sin_c * COS_CENTER / rho)
    lon = CENTER_LON + math.atan2(x * sin_c, rho * COS_CENTER * cos_c - y * SIN_CENTER * sin_c)

    return (math.degrees(lon), math.degrees(lat))


def try_pyshp(shp_path):
    """Read shapefile with pyshp and manually reproject. Returns GeoJSON-like dict or None."""
    try:
        import shapefile
    except ImportError:
        print('  pyshp not found. Installing...')
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyshp'], check=True)
        import shapefile

    print('  Reading shapefile with pyshp...')
    sf = shapefile.Reader(shp_path)
    fields = [f[0] for f in sf.fields[1:]]  # skip DeletionFlag

    features = []
    for sr in sf.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        shp = sr.shape

        # Convert shape to GeoJSON-like geometry
        if shp.shapeType in (5, 15, 25):  # Polygon types
            parts = list(shp.parts) + [len(shp.points)]
            rings = []
            for i in range(len(parts) - 1):
                ring_pts = shp.points[parts[i]:parts[i + 1]]
                # Reproject from LAEA to WGS84
                ring_lonlat = [inverse_laea(px, py) for px, py in ring_pts]
                rings.append(ring_lonlat)

            # Build MultiPolygon or Polygon
            # Simple approach: each ring as its own polygon exterior
            # (proper handling would check winding direction for holes)
            geom = {'type': 'Polygon', 'coordinates': rings}
        else:
            continue

        features.append({
            'type': 'Feature',
            'properties': rec,
            'geometry': geom,
        })

    return {'type': 'FeatureCollection', 'features': features}

# ── Shapefile reading: raw binary fallback ─────────────────────────────────

def read_dbf(dbf_path):
    """Read a DBF file and return list of dicts."""
    with open(dbf_path, 'rb') as f:
        data = f.read()

    num_records = struct.unpack_from('<I', data, 4)[0]
    header_size = struct.unpack_from('<H', data, 8)[0]
    record_size = struct.unpack_from('<H', data, 10)[0]

    # Parse field descriptors (32 bytes each, starting at offset 32)
    fields = []
    offset = 32
    while offset < header_size - 1:
        if data[offset] == 0x0D:
            break
        name = data[offset:offset + 11].split(b'\x00')[0].decode('ascii')
        ftype = chr(data[offset + 11])
        fsize = data[offset + 16]
        fields.append((name, ftype, fsize))
        offset += 32

    records = []
    offset = header_size
    for _ in range(num_records):
        rec = {}
        pos = offset + 1  # skip deletion flag
        for name, ftype, fsize in fields:
            raw = data[pos:pos + fsize]
            val = raw.decode('latin-1', errors='replace').strip()
            if ftype in ('N', 'F'):
                try:
                    val = float(val) if '.' in val else int(val)
                except ValueError:
                    val = 0
            rec[name] = val
            pos += fsize
        records.append(rec)
        offset += record_size

    return records


def read_shp(shp_path):
    """Read a .shp file and return list of (parts, points)."""
    with open(shp_path, 'rb') as f:
        data = f.read()

    # File header: 100 bytes
    shape_type = struct.unpack_from('<i', data, 32)[0]
    shapes = []
    offset = 100

    while offset < len(data):
        # Record header: 8 bytes
        if offset + 8 > len(data):
            break
        rec_num, content_len = struct.unpack_from('>ii', data, offset)
        offset += 8
        rec_end = offset + content_len * 2

        if offset + 4 > len(data):
            break
        st = struct.unpack_from('<i', data, offset)[0]
        offset += 4

        if st == 0:  # Null shape
            shapes.append(None)
            offset = rec_end
            continue

        if st in (5, 15, 25):  # Polygon
            # Bounding box: 32 bytes
            offset += 32
            num_parts = struct.unpack_from('<i', data, offset)[0]
            num_points = struct.unpack_from('<i', data, offset + 4)[0]
            offset += 8

            parts = list(struct.unpack_from(f'<{num_parts}i', data, offset))
            offset += num_parts * 4

            points = []
            for i in range(num_points):
                x, y = struct.unpack_from('<dd', data, offset)
                points.append((x, y))
                offset += 16

            shapes.append((parts, points))

            # Skip any Z or M data
            offset = rec_end
        else:
            offset = rec_end

    return shapes


def try_raw_shapefile(shp_path):
    """Read shapefile with raw binary parsing + manual reprojection."""
    print('  Reading shapefile with raw binary parser...')
    dbf_path = shp_path.replace('.shp', '.dbf')
    if not os.path.exists(dbf_path):
        # Try case variations
        for ext in ['.DBF', '.Dbf']:
            alt = shp_path[:-4] + ext
            if os.path.exists(alt):
                dbf_path = alt
                break

    records = read_dbf(dbf_path)
    shapes = read_shp(shp_path)

    if len(records) != len(shapes):
        print(f'  WARNING: record count mismatch: {len(records)} records, {len(shapes)} shapes')

    features = []
    for i, (rec, shape) in enumerate(zip(records, shapes)):
        if shape is None:
            continue
        parts_idx, points = shape
        parts_idx = list(parts_idx) + [len(points)]

        rings = []
        for j in range(len(parts_idx) - 1):
            ring = points[parts_idx[j]:parts_idx[j + 1]]
            ring_lonlat = [inverse_laea(x, y) for x, y in ring]
            rings.append(ring_lonlat)

        features.append({
            'type': 'Feature',
            'properties': rec,
            'geometry': {'type': 'Polygon', 'coordinates': rings},
        })

    return {'type': 'FeatureCollection', 'features': features}


# ── Polygon simplification (Douglas-Peucker) ──────────────────────────────

def _perp_dist(p, a, b):
    """Perpendicular distance from point p to line segment a-b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2)
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    proj_x, proj_y = a[0] + t * dx, a[1] + t * dy
    return math.sqrt((p[0] - proj_x) ** 2 + (p[1] - proj_y) ** 2)


def simplify_ring(coords, tolerance):
    """Douglas-Peucker simplification."""
    if len(coords) <= 3:
        return coords

    dmax = 0
    idx = 0
    for i in range(1, len(coords) - 1):
        d = _perp_dist(coords[i], coords[0], coords[-1])
        if d > dmax:
            dmax = d
            idx = i

    if dmax > tolerance:
        left = simplify_ring(coords[:idx + 1], tolerance)
        right = simplify_ring(coords[idx:], tolerance)
        return left[:-1] + right
    else:
        return [coords[0], coords[-1]]


# ── Process GeoJSON features → ecoregion data ─────────────────────────────

def find_l2_field(properties):
    """Find the Level II code field name in the feature properties."""
    candidates = ['NA_L2CODE', 'NA_L2Code', 'na_l2code', 'L2_CODE', 'NA_L2_COD']
    for c in candidates:
        if c in properties:
            return c
    # Try case-insensitive
    for key in properties:
        if 'l2' in key.lower() and 'code' in key.lower():
            return key
    return None


def find_l2_name_field(properties):
    """Find the Level II name field."""
    candidates = ['NA_L2NAME', 'NA_L2Name', 'na_l2name', 'L2_NAME']
    for c in candidates:
        if c in properties:
            return c
    for key in properties:
        if 'l2' in key.lower() and 'name' in key.lower():
            return key
    return None


def process_features(geojson):
    """Group features by Level II code, merge polygons, simplify."""
    features = geojson['features']

    # Find field names from first feature
    sample_props = features[0]['properties']
    code_field = find_l2_field(sample_props)
    name_field = find_l2_name_field(sample_props)

    if not code_field:
        print(f'  Available fields: {list(sample_props.keys())}')
        print('  ERROR: Cannot find Level II code field.')
        sys.exit(1)

    print(f'  Using fields: code={code_field}, name={name_field}')

    # Group polygons by L2 code
    regions = {}
    for feat in features:
        props = feat['properties']
        code = str(props.get(code_field, '')).strip()
        name = str(props.get(name_field, '')) if name_field else code

        if not code:
            continue

        geom = feat['geometry']
        coords = geom.get('coordinates', [])

        if geom['type'] == 'Polygon':
            rings_list = [coords]
        elif geom['type'] == 'MultiPolygon':
            rings_list = coords
        else:
            continue

        if code not in regions:
            regions[code] = {'code': code, 'name': name, 'polygons': []}

        for rings in rings_list:
            # Take only exterior ring (first ring), skip holes
            if rings and len(rings) > 0:
                exterior = rings[0] if isinstance(rings[0][0], (list, tuple)) else rings
                # Simplify
                simplified = simplify_ring(exterior, SIMPLIFY_TOLERANCE)
                if len(simplified) >= 4:  # Need at least 3 + closing point
                    # Round coordinates
                    rounded = [[round(p[0], 2), round(p[1], 2)] for p in simplified]
                    regions[code]['polygons'].append(rounded)

    return regions


# ── Generate JavaScript output ─────────────────────────────────────────────

def generate_js(regions):
    """Generate ecomap.js content from processed region data."""

    # Sort regions by code
    sorted_codes = sorted(regions.keys(), key=lambda c: [float(x) for x in c.split('.')])

    entries = []
    for code in sorted_codes:
        r = regions[code]
        color = COLORS.get(code, '#888888')
        name_escaped = r['name'].replace("'", "\\'")

        polys_str = []
        for poly in r['polygons']:
            coords_str = ','.join(f'[{p[0]},{p[1]}]' for p in poly)
            polys_str.append(f'[{coords_str}]')

        all_polys = ',\n      '.join(polys_str)
        entries.append(f"  {{\n    code: '{code}', name: '{name_escaped}',\n    color: '{color}',\n    polygons: [\n      {all_polys}\n    ]\n  }}")

    polygons_block = ',\n'.join(entries)

    # Generate US border from the existing data (or extract from features)
    # For now, we keep a simplified version
    js = textwrap.dedent("""\
    // ecomap.js — EPA/CEC Level II ecoregion polygon boundaries for North America
    // Generated by _build_ecomap.py from official EPA shapefile data.
    // Projection: Lambert Azimuthal Equal Area (CEC standard for North America)
    //
    // Source: EPA/CEC Level II Ecoregions of North America
    // https://www.epa.gov/eco-research/ecoregions-north-america

    // ── Ecoregion polygon data ──────────────────────────────────────────────────
    export const ECOREGION_POLYGONS = [
    %POLYGONS%
    ];

    // ── Lambert Azimuthal Equal Area projection ───────────────────────────────────
    const DEG = Math.PI / 180;
    const R = 6370997;           // Earth sphere radius (meters) — CEC standard
    const PHI0 = 45 * DEG;      // Center latitude
    const LAM0 = -100 * DEG;    // Center longitude
    const SIN0 = Math.sin(PHI0);
    const COS0 = Math.cos(PHI0);

    // Viewport bounds in projected meters (covers all of North America)
    export const MAP_BOUNDS = {
      left:   -4400000,
      right:   3900000,
      top:     4700000,
      bottom: -3400000,
    };

    /** Project [lon, lat] → {x, y} normalized 0..1 within viewport */
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

    /** Project a polygon [[lon,lat],...] → [{x,y},...] */
    export function projectPolygon(coords, bounds = MAP_BOUNDS) {
      return coords.map(([lon, lat]) => projectPoint(lon, lat, bounds));
    }

    /** Inverse project: normalized {x,y} in [0,1] → {lon, lat} degrees */
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

    // ── Simplified outlines for context ─────────────────────────────────────────
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

    // ── Level 2 code → game ecoregion mapping ──────────────────────────────────
    export const CODE_TO_GAME_ID = {
      '8.3': 'se_usa_plains',
    };
    """)

    js = js.replace('%POLYGONS%', polygons_block)
    return js


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    print('═══ Building ecomap.js from EPA Level II data ═══\n')

    with tempfile.TemporaryDirectory() as tmp_dir:
        # Step 1: Download
        print('Step 1: Downloading shapefile...')
        shp_path = download_shapefile(tmp_dir)
        print(f'  Shapefile: {shp_path}\n')

        # Step 2: Convert to GeoJSON
        print('Step 2: Converting to GeoJSON (WGS84)...')
        geojson = try_ogr2ogr(shp_path, tmp_dir)
        if geojson:
            print('  ✓ Used ogr2ogr\n')
        else:
            print('  ogr2ogr not available, trying pyshp...')
            try:
                geojson = try_pyshp(shp_path)
                print('  ✓ Used pyshp\n')
            except Exception as e:
                print(f'  pyshp failed: {e}')
                print('  Falling back to raw binary parser...')
                try:
                    geojson = try_raw_shapefile(shp_path)
                    print('  ✓ Used raw binary parser\n')
                except Exception as e2:
                    print(f'  Raw parser also failed: {e2}')
                    print('\nERROR: Cannot read shapefile. Install GDAL or pyshp:')
                    print('  apt install gdal-bin   OR   pip install pyshp')
                    sys.exit(1)

        print(f'  Found {len(geojson["features"])} features\n')

        # Step 3: Process features
        print('Step 3: Processing & simplifying polygons...')
        regions = process_features(geojson)
        total_polys = sum(len(r['polygons']) for r in regions.values())
        total_verts = sum(sum(len(p) for p in r['polygons']) for r in regions.values())
        print(f'  {len(regions)} ecoregions, {total_polys} polygons, {total_verts} vertices\n')

        # Step 4: Generate JS
        print('Step 4: Generating ecomap.js...')
        js_content = generate_js(regions)
        OUTPUT_FILE.write_text(js_content, encoding='utf-8')
        print(f'  ✓ Written to {OUTPUT_FILE} ({len(js_content):,} bytes)\n')

    print('═══ Done! Reload the game to see the updated map. ═══')


if __name__ == '__main__':
    main()
