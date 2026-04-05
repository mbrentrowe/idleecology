# Region Builder Planning

## Purpose

This document tracks planning work for expanding the region builder so it can generate materially complete, region-specific content rather than only plant and bird metadata.

The current priorities are:

1. True region-specific crops
2. Hosted-fauna data sufficient for gameplay
3. Builder UX improvements only after the data contracts are solid

## Current Findings

### Builder completeness

The builder does not yet capture everything needed for a strong region.

The major gaps are:

1. Crops are not truly region-specific yet
2. Plant-hosted fauna is still mostly placeholder content
3. Structured non-insect wildlife is not yet part of current gameplay

### Gameplay-critical plant support data

The most important missing mechanical field is plant-hosted fauna.

In the current game:

1. `insectsHosted` drives creature discovery
2. `insectsHosted` contributes to biosphere progression and prestige completion
3. Plant type and fruiting support bird attraction logic
4. `wildlifeNote` and `caterpillarSpp` are useful, but mostly descriptive today

## Crop Model Direction

### Decision

Use a shared base crop catalog with per-region crop profiles.

This is the recommended model because it preserves save compatibility and existing UI assumptions while still allowing real regional variation.

### Why this model

A full per-region crop catalog would create unnecessary duplication and higher migration risk.

A shared catalog plus per-region overrides allows:

1. Stable crop IDs
2. Shared art and growth-phase bindings
3. Region-specific timing, yields, seasonality, and availability
4. Safer save/load behavior across regions

### `cropProfiles` contract

Each region should be able to define an optional `cropProfiles` object keyed by crop ID.

Allowed override fields:

1. `name`
2. `sciName`
3. `growthTimePerPhase`
4. `yieldGold`
5. `marketIconGID`
6. `unlockCriteria`
7. `seasons`

Immutable fields:

1. `id`
2. `growthPhaseGIDs`
3. `growthPhaseNames`

Disable semantics:

1. A `cropProfiles` entry of `null` means that crop is disabled for the region
2. Disabled crops must not appear in `farmZoneDefs`

### Engine and UI implications

The effective crop set should be resolved in [game.js](./game.js) when the engine is created.

Important constraint:

1. [main.js](./main.js) currently reads the global crop catalog directly
2. That means region-specific crop overrides will not show up in UI unless [main.js](./main.js) is changed to read engine-resolved crops

### Crop validation requirements

The builder should validate:

1. `growthTimePerPhase` is positive
2. `yieldGold` is positive
3. `seasons` is a non-empty subset of the four game seasons
4. `unlockCriteria.totalSold` is non-negative when present
5. The selected crop lineup supports viable progression and seasonal coverage

## Hosted-Fauna Direction

### Decision

Treat `insectsHosted` as required gameplay data for any generated playable region.

This is the mechanical core. A region should not be considered complete if its plants still have placeholder host arrays.

### Required mechanical layer per plant

Each plant should provide:

1. `type`
2. `hasFruit` when applicable
3. `insectsHosted`
4. `biosphereBonus`
5. Existing plant progression fields already used by the engine

Each `insectsHosted` entry should include:

1. `name`
2. `sci`
3. `type`
4. `role`
5. `note`

Valid hosted-fauna types should match the current type set in [ecoregions.js](./ecoregions.js):

1. `butterfly`
2. `moth`
3. `bee`
4. `fly`
5. `beetle`
6. `wasp`
7. `bird`
8. `mammal`

### Descriptive and future-facing fields

These remain in scope, but they are additive rather than blocking:

1. `caterpillarSpp`
2. `wildlifeNote`
3. Future structured non-insect wildlife support such as `wildlifeSupported` or `supportTags`

The engine does not currently require structured non-insect wildlife, so that data should not block the first pass.

### Hosted-fauna lookup strategy

Use descending-confidence lookup rules:

1. Exact species match
2. Genus fallback
3. Family fallback
4. Conservative generalist fallback only when no curated host data exists

Generalist fallback should be flagged for manual review.

### Hosted-fauna validation requirements

The builder should validate:

1. Every plant in a playable region has a non-empty `insectsHosted` array
2. Every hosted creature uses a valid type
3. Duplicate hosted-creature names within the same plant are rejected
4. Bird unlock thresholds are satisfiable from the generated plant data
5. The total collection pool is large enough for the prestige threshold to be reachable

## Implementation Order

### Phase 1

Finalize the crop contract and implement `cropProfiles` support.

Primary files:

1. [regions/registry.js](./regions/registry.js)
2. [crops.js](./crops.js)
3. [game.js](./game.js)
4. [main.js](./main.js)
5. [regions/se_usa_plains.js](./regions/se_usa_plains.js)

### Phase 2

Finalize the hosted-fauna contract and lookup-table schema.

Primary files:

1. [ecoregions.js](./ecoregions.js)
2. [game.js](./game.js)
3. [prestige.js](./prestige.js)
4. [region_builder.html](./region_builder.html)

### Phase 3

After the data contracts are stable, add builder UX improvements:

1. Load JSON file inputs
2. Optional curl output saving to files
3. Validation and review tooling around crop and fauna completeness

## Open Planning Work

### Next planning pass

Define the hosted-fauna lookup-table schema in detail.

That pass should answer:

1. What the lookup table format is
2. How species, genus, and family keys are represented
3. How source confidence is stored
4. What a conservative fallback record looks like
5. What should be curated versus generated

## Key Decisions So Far

1. The builder must capture more than plant and bird metadata
2. True region-specific crops are required
3. The crop model should use a shared catalog plus `cropProfiles`
4. `insectsHosted` is required for a playable generated region
5. Structured non-insect wildlife is additive in the first pass
6. Builder UX improvements should come after the data contracts are nailed down