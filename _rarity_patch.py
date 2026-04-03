#!/usr/bin/env python3
"""Patch birds.js unlockCriteria based on eBird frequency data for zip 36863 (Phenix City, AL).

Rarity tiers based on eBird checklist frequency for Russell/Lee County, AL area:
  Tier 1 - Very Common (>40%): low thresholds, early unlocks
  Tier 2 - Common (20-40%): moderate thresholds
  Tier 3 - Fairly Common (5-20%): higher thresholds
  Tier 4 - Uncommon (1-5%): significantly higher
  Tier 5 - Rare (<1%): endgame unlocks
"""

import re, json

# bird_id -> new unlockCriteria dict
# Based on eBird frequency data for Phenix City, AL (36863) / Southeastern Piedmont
RARITY = {
    # ── Tier 1: Very Common (>40% of eBird checklists) ──────────────────────
    'american_robin':           { 'insectsDiscovered': 3, 'fruitingPlants': 1 },
    'northern_cardinal':        { 'insectsDiscovered': 4, 'plantsEstablished': 2 },
    'carolina_chickadee':       { 'insectsDiscovered': 5, 'plantsEstablished': 3 },
    'carolina_wren':            { 'insectsDiscovered': 5, 'hasPlantType': 'shrub' },
    'eastern_bluebird':         { 'insectsDiscovered': 6, 'plantsEstablished': 3 },
    'red_bellied_woodpecker':   { 'insectsDiscovered': 6, 'hasPlantType': 'tree' },
    'northern_mockingbird':     { 'insectsDiscovered': 6, 'fruitingPlants': 1, 'plantsEstablished': 3 },
    'american_crow':            { 'insectsDiscovered': 4, 'plantsEstablished': 2 },
    'mourning_dove':            { 'insectsDiscovered': 4, 'plantsEstablished': 3 },
    'european_starling':        { 'insectsDiscovered': 3, 'plantsEstablished': 2 },
    'house_sparrow':            { 'insectsDiscovered': 3, 'plantsEstablished': 2 },
    'brown_headed_cowbird':     { 'insectsDiscovered': 4, 'plantsEstablished': 2 },

    # ── Tier 2: Common (20-40%) ─────────────────────────────────────────────
    'american_goldfinch':       { 'plantsEstablished': 6, 'fruitingPlants': 2 },
    'eastern_towhee':           { 'insectsDiscovered': 14, 'hasPlantType': 'shrub', 'plantsEstablished': 7 },
    'downy_woodpecker':         { 'insectsDiscovered': 10, 'hasPlantType': 'tree', 'plantsEstablished': 5 },
    'eastern_phoebe':           { 'insectsDiscovered': 12, 'plantsEstablished': 5 },
    'red_winged_blackbird':     { 'insectsDiscovered': 12, 'plantsEstablished': 6 },
    'common_grackle':           { 'insectsDiscovered': 10, 'plantsEstablished': 5 },
    'red_tailed_hawk':          { 'insectsDiscovered': 16, 'plantsEstablished': 8 },
    'white_throated_sparrow':   { 'insectsDiscovered': 10, 'plantsEstablished': 5 },
    'northern_flicker':         { 'insectsDiscovered': 14, 'hasPlantType': 'tree', 'plantsEstablished': 7 },
    'white_breasted_nuthatch':  { 'insectsDiscovered': 12, 'hasPlantType': 'tree', 'plantsEstablished': 6 },
    'song_sparrow':             { 'insectsDiscovered': 12, 'hasPlantType': 'shrub', 'plantsEstablished': 6 },
    'pine_warbler':             { 'insectsDiscovered': 12, 'hasPlantType': 'tree', 'plantsEstablished': 7 },
    'yellow_rumped_warbler':    { 'insectsDiscovered': 10, 'fruitingPlants': 1, 'plantsEstablished': 5 },
    'turkey_vulture':           { 'insectsDiscovered': 18, 'plantsEstablished': 8 },
    'chipping_sparrow':         { 'insectsDiscovered': 8, 'plantsEstablished': 4 },
    'barn_swallow':             { 'insectsDiscovered': 14, 'plantsEstablished': 6 },
    'brown_thrasher':           { 'insectsDiscovered': 16, 'hasPlantType': 'shrub', 'plantsEstablished': 8 },
    'red_shouldered_hawk':      { 'insectsDiscovered': 16, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'indigo_bunting':           { 'insectsDiscovered': 18, 'plantsEstablished': 8 },
    'eastern_kingbird':         { 'insectsDiscovered': 16, 'plantsEstablished': 7 },
    'house_finch':              { 'insectsDiscovered': 8, 'plantsEstablished': 4 },
    'eurasian_collared_dove':   { 'insectsDiscovered': 6, 'plantsEstablished': 3 },
    'cedar_waxwing':            { 'insectsDiscovered': 14, 'fruitingPlants': 3 },
    'gray_catbird':             { 'insectsDiscovered': 14, 'fruitingPlants': 2, 'hasPlantType': 'shrub' },
    'dark_eyed_junco':          { 'insectsDiscovered': 8, 'plantsEstablished': 4 },
    'tree_swallow':             { 'insectsDiscovered': 12, 'plantsEstablished': 5 },
    'cliff_swallow':            { 'insectsDiscovered': 12, 'plantsEstablished': 5 },
    'common_ground_dove':       { 'insectsDiscovered': 8, 'plantsEstablished': 4 },
    'common_yellowthroat':      { 'insectsDiscovered': 16, 'plantsEstablished': 7 },
    'white_crowned_sparrow':    { 'insectsDiscovered': 10, 'plantsEstablished': 5 },
    'fish_crow':                { 'insectsDiscovered': 10, 'plantsEstablished': 5 },
    'purple_finch':             { 'insectsDiscovered': 10, 'plantsEstablished': 5 },
    'white_winged_dove':        { 'insectsDiscovered': 10, 'plantsEstablished': 5 },
    'palm_warbler':             { 'insectsDiscovered': 12, 'hasPlantType': 'shrub', 'plantsEstablished': 6 },
    'northern_house_wren':      { 'insectsDiscovered': 12, 'hasPlantType': 'shrub', 'plantsEstablished': 6 },
    'american_barn_owl':        { 'insectsDiscovered': 14, 'hasPlantType': 'flower' },
    'american_pipit':           { 'insectsDiscovered': 12, 'hasPlantType': 'flower' },
    'american_kestrel':         { 'insectsDiscovered': 14, 'hasPlantType': 'flower' },

    # ── Tier 3: Fairly Common (5-20%) ───────────────────────────────────────
    'baltimore_oriole':           { 'insectsDiscovered': 22, 'fruitingPlants': 3, 'hasPlantType': 'tree' },
    'coopers_hawk':               { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'barred_owl':                 { 'insectsDiscovered': 26, 'hasPlantType': 'tree', 'plantsEstablished': 12 },
    'summer_tanager':             { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'great_crested_flycatcher':   { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'northern_parula':            { 'insectsDiscovered': 24, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'red_eyed_vireo':             { 'insectsDiscovered': 24, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'yellow_throated_warbler':    { 'insectsDiscovered': 24, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'brown_creeper':              { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'eastern_screech_owl':        { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'eastern_meadowlark':         { 'insectsDiscovered': 22, 'hasPlantType': 'flower', 'plantsEstablished': 10 },
    'black_vulture':              { 'insectsDiscovered': 24, 'plantsEstablished': 10 },
    'pileated_woodpecker':        { 'insectsDiscovered': 26, 'hasPlantType': 'tree', 'plantsEstablished': 11 },
    'wild_turkey':                { 'insectsDiscovered': 24, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'orchard_oriole':             { 'insectsDiscovered': 22, 'fruitingPlants': 2, 'hasPlantType': 'tree' },
    'wood_thrush':                { 'insectsDiscovered': 26, 'hasPlantType': 'tree', 'plantsEstablished': 11 },
    'ovenbird':                   { 'insectsDiscovered': 26, 'hasPlantType': 'tree', 'plantsEstablished': 11 },
    'white_eyed_vireo':           { 'insectsDiscovered': 20, 'hasPlantType': 'shrub', 'plantsEstablished': 8 },
    'brown_headed_nuthatch':      { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'black_and_white_warbler':    { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'purple_martin':              { 'insectsDiscovered': 22, 'plantsEstablished': 9 },
    'bald_eagle':                 { 'insectsDiscovered': 30, 'plantsEstablished': 14, 'hasPlantType': 'tree' },
    'great_horned_owl':           { 'insectsDiscovered': 28, 'hasPlantType': 'tree', 'plantsEstablished': 12 },
    'northern_bobwhite':          { 'insectsDiscovered': 28, 'hasPlantType': 'flower', 'plantsEstablished': 14 },
    'scarlet_tanager':            { 'insectsDiscovered': 28, 'hasPlantType': 'tree', 'plantsEstablished': 12 },
    'northern_harrier':           { 'insectsDiscovered': 26, 'hasPlantType': 'flower', 'plantsEstablished': 12 },
    'eastern_whip_poor_will':     { 'insectsDiscovered': 26, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'chuck_wills_widow':          { 'insectsDiscovered': 24, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'red_headed_woodpecker':      { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'broad_winged_hawk':          { 'insectsDiscovered': 24, 'hasPlantType': 'tree', 'plantsEstablished': 10 },
    'prairie_warbler':            { 'insectsDiscovered': 22, 'hasPlantType': 'shrub', 'plantsEstablished': 9 },
    'northern_yellow_warbler':    { 'insectsDiscovered': 20, 'hasPlantType': 'shrub', 'plantsEstablished': 8 },
    'savannah_sparrow':           { 'insectsDiscovered': 20, 'hasPlantType': 'flower', 'plantsEstablished': 8 },
    'blue_headed_vireo':          { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'yellow_throated_vireo':      { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'field_sparrow':              { 'insectsDiscovered': 20, 'hasPlantType': 'flower', 'plantsEstablished': 8 },
    'painted_bunting':            { 'insectsDiscovered': 28, 'plantsEstablished': 12 },
    'yellow_bellied_sapsucker':   { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'red_breasted_nuthatch':      { 'insectsDiscovered': 22, 'hasPlantType': 'tree', 'plantsEstablished': 9 },
    'northern_rough_winged_swallow': { 'insectsDiscovered': 18, 'plantsEstablished': 7 },
    'orange_crowned_warbler':     { 'insectsDiscovered': 18, 'hasPlantType': 'tree', 'plantsEstablished': 7 },
    'nashville_warbler':          { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'wilsons_warbler':            { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'tennessee_warbler':          { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'golden_crowned_kinglet':     { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'winter_wren':                { 'insectsDiscovered': 20, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'yellow_breasted_chat':       { 'insectsDiscovered': 24, 'hasPlantType': 'shrub', 'plantsEstablished': 10 },
    'pine_siskin':                { 'insectsDiscovered': 18, 'hasPlantType': 'tree', 'plantsEstablished': 8 },
    'clay_colored_sparrow':       { 'insectsDiscovered': 22, 'hasPlantType': 'flower', 'plantsEstablished': 8 },
    'horned_lark':                { 'insectsDiscovered': 18, 'hasPlantType': 'flower', 'plantsEstablished': 7 },
    'vermilion_flycatcher':       { 'insectsDiscovered': 24, 'plantsEstablished': 10 },
    'swamp_sparrow':              { 'insectsDiscovered': 18, 'plantsEstablished': 8 },

    # ── Tier 4: Uncommon (1-5%) ─────────────────────────────────────────────
    'peregrine_falcon':           { 'insectsDiscovered': 38, 'plantsEstablished': 14 },
    'loggerhead_shrike':          { 'insectsDiscovered': 35, 'hasPlantType': 'shrub', 'plantsEstablished': 12 },
    'prothonotary_warbler':       { 'insectsDiscovered': 35, 'hasPlantType': 'tree', 'plantsEstablished': 14 },
    'louisiana_waterthrush':      { 'insectsDiscovered': 35, 'plantsEstablished': 14 },
    'swallow_tailed_kite':        { 'insectsDiscovered': 40, 'hasPlantType': 'tree', 'plantsEstablished': 16 },
    'sharp_shinned_hawk':         { 'insectsDiscovered': 30, 'hasPlantType': 'shrub', 'plantsEstablished': 10 },
    'merlin':                     { 'insectsDiscovered': 35, 'plantsEstablished': 12 },
    'fox_sparrow':                { 'insectsDiscovered': 32, 'hasPlantType': 'shrub', 'plantsEstablished': 10 },
    'hermit_thrush':              { 'insectsDiscovered': 28, 'hasPlantType': 'shrub', 'plantsEstablished': 10 },
    'worm_eating_warbler':        { 'insectsDiscovered': 35, 'hasPlantType': 'tree', 'plantsEstablished': 12 },
    'rusty_blackbird':            { 'insectsDiscovered': 32, 'plantsEstablished': 12 },
    'sedge_wren':                 { 'insectsDiscovered': 32, 'plantsEstablished': 12 },
    'marsh_wren':                 { 'insectsDiscovered': 32, 'plantsEstablished': 12 },
    'black_throated_green_warbler': { 'insectsDiscovered': 30, 'hasPlantType': 'tree', 'plantsEstablished': 12 },
    'northern_waterthrush':       { 'insectsDiscovered': 35, 'plantsEstablished': 12 },
    'vesper_sparrow':             { 'insectsDiscovered': 32, 'hasPlantType': 'flower', 'plantsEstablished': 12 },
    'short_eared_owl':            { 'insectsDiscovered': 40, 'hasPlantType': 'flower', 'plantsEstablished': 16 },
    'red_cockaded_woodpecker':    { 'insectsDiscovered': 45, 'hasPlantType': 'tree', 'plantsEstablished': 18 },
    'northern_bobwhite':          { 'insectsDiscovered': 28, 'hasPlantType': 'flower', 'plantsEstablished': 14 },  # duplicate override removed below
    'boat_tailed_grackle':        { 'insectsDiscovered': 35, 'plantsEstablished': 12 },

    # ── Tier 5: Rare (<1% — vagrants, irruptives, range-edge species) ───────
    'bachmans_sparrow':           { 'insectsDiscovered': 55, 'hasPlantType': 'flower', 'plantsEstablished': 20 },
    'henslows_sparrow':           { 'insectsDiscovered': 55, 'hasPlantType': 'flower', 'plantsEstablished': 20 },
    'grasshopper_sparrow':        { 'insectsDiscovered': 50, 'hasPlantType': 'flower', 'plantsEstablished': 18 },
    'prairie_falcon':             { 'insectsDiscovered': 55, 'plantsEstablished': 16 },
    'snow_bunting':               { 'insectsDiscovered': 50, 'plantsEstablished': 14 },
    'ash_throated_flycatcher':    { 'insectsDiscovered': 48, 'hasPlantType': 'shrub' },
    'bronzed_cowbird':            { 'insectsDiscovered': 45, 'plantsEstablished': 10 },
    'inca_dove':                  { 'insectsDiscovered': 45, 'plantsEstablished': 10 },
    'shiny_cowbird':              { 'insectsDiscovered': 45, 'plantsEstablished': 10 },
    'scaly_breasted_munia':       { 'insectsDiscovered': 45, 'plantsEstablished': 10 },
    'brewers_blackbird':          { 'insectsDiscovered': 40, 'plantsEstablished': 10 },
    'bullocks_oriole':            { 'insectsDiscovered': 48, 'fruitingPlants': 3, 'hasPlantType': 'tree' },
    'yellow_headed_blackbird':    { 'insectsDiscovered': 48, 'plantsEstablished': 14 },
    'western_kingbird':           { 'insectsDiscovered': 40, 'plantsEstablished': 12 },
    'western_meadowlark':         { 'insectsDiscovered': 48, 'hasPlantType': 'flower', 'plantsEstablished': 14 },
    'western_tanager':            { 'insectsDiscovered': 48, 'hasPlantType': 'tree', 'plantsEstablished': 14 },
    'red_crossbill':              { 'insectsDiscovered': 48, 'hasPlantType': 'tree', 'plantsEstablished': 14 },
}

# Remove the duplicate northern_bobwhite (already correctly in Tier 3)
# The one in Tier 4 was incorrectly duplicated
# northern_bobwhite stays at Tier 3 values

def format_criteria(criteria):
    """Format a criteria dict as a JS object literal."""
    parts = []
    # Maintain consistent key ordering
    for key in ['insectsDiscovered', 'plantsEstablished', 'fruitingPlants', 'hasPlantType']:
        if key in criteria:
            val = criteria[key]
            if isinstance(val, str):
                parts.append(f"{key}: '{val}'")
            else:
                parts.append(f"{key}: {val}")
    return '{ ' + ', '.join(parts) + ' }'

def patch():
    with open('birds.js', 'r') as f:
        content = f.read()

    patched = 0
    unpatched = []

    # Find each bird entry and replace its unlockCriteria
    for bird_id, criteria in RARITY.items():
        # Match: unlockCriteria: { ... }, in the context of this bird's entry
        # We need to find the bird_id entry and its unlockCriteria line
        pattern = re.compile(
            r"(  " + re.escape(bird_id) + r":\s*\{.*?unlockCriteria:\s*)"
            r"(\{[^}]+\})",
            re.DOTALL
        )
        new_val = format_criteria(criteria)
        match = pattern.search(content)
        if match:
            content = pattern.sub(lambda m: m.group(1) + new_val, content, count=1)
            patched += 1
        else:
            unpatched.append(bird_id)

    with open('birds.js', 'w') as f:
        f.write(content)

    print(f"Patched {patched}/{len(RARITY)} birds")
    if unpatched:
        print(f"Failed to patch: {unpatched}")

    # Report birds in file but NOT in RARITY (keeping old criteria)
    all_ids = re.findall(r"^\s{2}(\w+):\s*\{", content, re.MULTILINE)
    bird_ids = [bid for bid in all_ids if bid not in ('id', 'name', 'sci', 'icon', 'role', 'note', 'desc', 'attractedBy', 'unlockCriteria')]
    # Actually find just the top-level keys before the colon-space-{
    bird_ids = re.findall(r"^  (\w+): \{$", content, re.MULTILINE)
    missing = [bid for bid in bird_ids if bid not in RARITY]
    if missing:
        print(f"\nBirds in file but NOT reclassified ({len(missing)}):")
        for m in missing:
            print(f"  - {m}")

if __name__ == '__main__':
    patch()
