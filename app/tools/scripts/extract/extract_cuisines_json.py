#!/usr/bin/env python3
"""
Extract all unique cuisine values from chain_restaurants.json
with counts, sorted by frequency.

Outputs:
  unique_cuisines_chains.txt  — count + cuisine, sorted by frequency
"""

import json
from collections import Counter

import os as _os
_SCRIPT_DIR     = _os.path.dirname(_os.path.abspath(__file__))
_TOOLS_DIR      = _os.path.join(_SCRIPT_DIR, '..', '..')
HELPER_DIR      = _os.path.join(_TOOLS_DIR, 'data', 'helper_data')

INPUT_JSON = _os.path.join(HELPER_DIR, "chain_restaurants.json")
OUTPUT_TXT = _os.path.join(HELPER_DIR, "unique_cuisines_chains.txt")


def main():
    with open(INPUT_JSON, encoding="utf-8") as f:
        data = json.load(f)

    counter = Counter()
    for entry in data:
        cuisine = (entry.get("cuisine") or "").strip()
        if cuisine and cuisine.lower() != "null":
            counter[cuisine] += 1

    total_unique = len(counter)
    total_restaurants = sum(counter.values())

    lines = [
        f"Total unique cuisines: {total_unique}",
        f"Total chains with a cuisine: {total_restaurants}",
        "",
        f"{'Count':<8} Cuisine",
        "-" * 50,
    ]
    for cuisine, count in counter.most_common():
        lines.append(f"{count:<8} {cuisine}")

    output = "\n".join(lines)
    print(output)

    with open(OUTPUT_TXT, "w", encoding="utf-8") as f:
        f.write(output + "\n")

    print(f"\nWritten to {OUTPUT_TXT}")


if __name__ == "__main__":
    main()