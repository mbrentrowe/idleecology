Project: Idle Ecology
Purpose: Browser-based ecomap / ecology simulator and educational demo.

How to run
- Open index.html in a browser.
- For a local server: run dev_server.pl or: python -m http.server
- Build scripts: _build_ecomap.py regenerates built JS/HTML.

Entry points
- index.html  app shell
- main.js  app bootstrap
- ecomap.js  ecomap rendering and logic
- game.js  game loop / interactions
- region_builder.html and regions/  region builder + fixtures

Key modules & data
- birds.js, crops.js, invasives.js  species data
- regions/registry.js and regions/*.js  region definitions
- assets/region_builder_golden_fixture.js  test fixture
- _build_*.py, _patch.py, _rarity_patch.py  build/patch utilities

Assumptions
- Static site (no package.json); some build scripts use Python/Perl.
- Some pages reference remote APIs (Flora API, eBird).

Quick checks
- engine_sanity_test.html
- Use a local HTTP server to avoid CORS when loading local files.

Next actions
- Commit this file; update architecture diagram and ask assistant to ingest it.
