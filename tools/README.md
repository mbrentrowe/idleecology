Install generated region artifacts into the repo

This small Node script helps install the region bundle, birds module, and
ecoregion entry produced by the region builder into the repository.

Usage

1. Save the three generated outputs from the region builder into files:
   - `ecoregion.js` — the ecoregion object snippet (the object you add to `ECOREGIONS`)
   - `birds.js`     — the generated birds module (exported constants)
   - `bundle.js`    — the region bundle (the default export that aggregates region data)

2. Run the installer from the repository root:

```bash
node tools/install_region.js --ecoregion ./ecoregion.js --birds ./birds.js --bundle ./bundle.js
```

What it does

- Writes `birds_<regionId>.js` to the repository root.
- Writes `regions/<regionId>.js` with the provided bundle content.
- Inserts the provided ecoregion object into `ecoregions.js` (adds it to `ECOREGIONS`).
- Adds an import to `regions/registry.js` and appends the new region to the `REGIONS` array.

Notes & safety

- The script performs simple text insertion. Review changes before committing.
- It expects `ecoregions.js` and `regions/registry.js` to exist and follow the current project structure.
- Back up files or use VCS to inspect differences after running.
