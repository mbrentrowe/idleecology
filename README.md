# Idle Ecologist — Text UI

A browser-based idle farming and conservation game with a modular engine + UI architecture.

Current core loop:

1. Grow crops for gold.
2. Expand land and allocate acres across farm, ranch, and native plants.
3. Earn conservation points and complete research.
4. Establish native host plants and discover wildlife.
5. Increase biosphere score to boost your global gold multiplier.

## Tutorial

For a guided walkthrough of the codebase and a hands-on feature exercise, see `TUTORIAL.md`.

## Running locally

Open `index.html` via a local web server (ES modules require HTTP, not `file://`):

```bash
# One-command launcher in this repo (uses Perl static server)
sh ./start.sh

# Python
python -m http.server 8080

# Node / npx
npx serve .
```

Then visit `http://localhost:8080`.

If you need another port, run `sh ./start.sh 9090`.

## In-Game Tutorial

- A guided first-run tutorial opens automatically for new players.
- Players can replay it from **Settings → Tutorial → Replay Tutorial**.

## Architecture

| File | Purpose |
|---|---|
| `game.js` | Pure simulation engine (no DOM): ticks, unlocks, economy, land, save/load |
| `main.js` | UI layer: tab rendering, controls, notifications, tutorial overlay |
| `crops.js` | Crop definitions and growth instance logic |
| `ranch.js` | Ranch animal definitions and progression data |
| `research.js` | Conservation research tree and bonuses |
| `ecoregions.js` | Native plants, hosted creatures, and collection data |
| `engine_sanity_test.html` | Lightweight browser sanity tests for engine behaviors |
| `style.css` | Global styles and component styling |

## Tabs

- **Crops** — unlock and run farm zones, allocate acres, hire workers, monitor growth phases
- **Ranch** — unlock animals via crop progress, allocate acreage, hire workers, track production
- **Conservation** — spend conservation points on research and biosphere upgrades
- **Native Garden** — establish native plants to support species discovery and biosphere growth
- **Land** — buy market parcels, manage shared acreage, view allocation pressure
- **Collection** — track discovered crops, plants, wildlife, and discovery history
- **Settings** — speed, pause, auto-pilot mode, tutorial replay, fullscreen/wake lock, save/reset

## Save Data

- Main save key: `idle-ecologist-text-v1`
- Data is stored in `localStorage`.
- Saves include timestamp metadata used for offline progression simulation on return.

## Dev Notes

- Engine/UI boundary is intentional: keep game logic in `game.js`, UI behavior in `main.js`.
- Use `engine_sanity_test.html` for quick regression checks when changing core simulation behavior.
- Ranch is feature-gated (disabled by default): set `ENABLE_RANCH = true` in `game.js` to re-enable Ranch UI + simulation systems.
- See `TUTORIAL.md` for a contributor walkthrough.
