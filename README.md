# Idle Ecologist — Text UI

A text-only browser build of Idle Ecologist that shares the same gameplay loop as the canvas prototype.

## Running locally

Open `index.html` via a local web server (ES modules require HTTP, not `file://`):

```bash
# Python
python -m http.server 8080

# Node / npx
npx serve .
```

Then visit `http://localhost:8080`.

## Project structure

| File | Purpose |
|---|---|
| `crops.js` | Crop type definitions + growth instance (shared with canvas build) |
| `activityRegistry.js` | Artisan activity descriptor (shared with canvas build) |
| `game.js` | Pure game engine — no DOM. All state, tick loop, auto-pilot, save/load |
| `main.js` | UI layer — builds and updates all tab panels |
| `style.css` | Dark-theme stylesheet |

## Tabs

- **Zones** — live progress bars for every farm zone and artisan workshop, buy/unlock buttons, crop/product selectors
- **Market** — auto-sell toggles for raw crops and artisan products
- **Stats** — grown/sold/lifetime gold per crop, artisan history, time spent
- **Schedule** — drag sliders to allocate 24h between Farming, Socializing, and Sleeping
- **Settings** — game speed, auto-pilot toggle, save/reset

## Save data

Stored in `localStorage` under key `idle-ecologist-text-v1` (separate from the canvas build which uses a different key).
