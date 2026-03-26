with open('main.js', encoding='utf-8') as f:
    lines = f.readlines()

# Find the ranch filter line and insert history after it
for i, line in enumerate(lines):
    if "key: 'ranch'" in line and 'Ranch Animals' in line:
        insert_idx = i + 1
        break

new_line = "    { key: 'history',   label: `\U0001F4CA History (${discoveredCount})` },\n"
lines.insert(insert_idx, new_line)

with open('main.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f"Inserted at line {insert_idx+1}: {repr(lines[insert_idx])}")
