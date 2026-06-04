#!/usr/bin/env python3
"""
Extract all unique cuisine values from independents_enriched.csv
with counts, sorted by frequency.

Outputs:
  unique_cuisines.txt  — count + cuisine, sorted by frequency
"""

import csv
from collections import Counter

import os as _os
_SCRIPT_DIR     = _os.path.dirname(_os.path.abspath(__file__))
_TOOLS_DIR      = _os.path.join(_SCRIPT_DIR, '..', '..')
RESTAURANTS_DIR = _os.path.join(_TOOLS_DIR, 'data', 'restaurants')
JSONS_DIR       = _os.path.join(_TOOLS_DIR, 'data', 'restaurants', 'jsons')
HELPER_DIR      = _os.path.join(_TOOLS_DIR, 'data', 'helper_data')
IMAGES_DIR      = _os.path.join(_TOOLS_DIR, 'airport_images')


INPUT_CSV  = _os.path.join(HELPER_DIR, "independents_enriched.csv")
OUTPUT_TXT = _os.path.join(HELPER_DIR, "unique_cuisines.txt")


def main():
    counter = Counter()

    with open(INPUT_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cuisine = (row.get("cuisine") or "").strip()
            if cuisine and cuisine.lower() != "null":
                counter[cuisine] += 1

    total_unique = len(counter)
    total_restaurants = sum(counter.values())

    lines = [
        f"Total unique cuisines: {total_unique}",
        f"Total restaurants with a cuisine: {total_restaurants}",
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