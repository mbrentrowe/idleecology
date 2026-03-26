"""Find creature names that appear on more than one plant in ecoregions.js."""
import re, collections

with open('ecoregions.js', encoding='utf-8') as f:
    src = f.read()

# Split into per-plant chunks using the pattern: id: 'plant_id',
# Each chunk starts right after 'id:'
chunks = re.split(r"\bid:\s+'", src)

creature_by_name = collections.defaultdict(list)   # name  → [plant_id, ...]
creature_by_ckey = collections.defaultdict(list)   # ckey  → [plant_id, ...]
all_plants = []

for chunk in chunks[1:]:   # skip header before first plant
    plant_id_m = re.match(r"([\w]+)'", chunk)
    if not plant_id_m:
        continue
    plant_id = plant_id_m.group(1)

    # skip non-plant ids (e.g. ecoregion ids like 'se_usa_plains')
    if not re.search(r'insectsHosted', chunk[:3000]):
        continue

    all_plants.append(plant_id)
    names = re.findall(r"name:\s+'([^']+)'", chunk)
    # first name is the plant name itself; rest are insectsHosted entries
    for name in names[1:]:    # skip index 0 (plant name)
        def make_ckey(pid, n):
            return pid + '__' + re.sub(r'[^a-z0-9]+', '_', n.lower())
        creature_by_name[name].append(plant_id)
        creature_by_ckey[make_ckey(plant_id, name)].append(plant_id)

dups_by_name = {n: p for n, p in creature_by_name.items() if len(p) > 1}

print(f"Plants parsed:           {len(all_plants)}")
print(f"Total plant+creature combinations (ckeys): {sum(len(v) for v in creature_by_name.values())}")
print(f"Unique creature names:   {len(creature_by_name)}")
print(f"Unique ckeys:            {len(creature_by_ckey)}  (always = total combos since ckey encodes plant)")
print(f"Creature names on 2+ plants: {len(dups_by_name)}")
print()
for name, plants in sorted(dups_by_name.items()):
    print(f"  {name!r:42}  appears on: {plants}")
