#!/usr/bin/env python3
"""
Enrich airport restaurant CSVs with canonical data from chain_restaurants.json
and independents_enriched.json.

For each CSV row, matches the restaurant name against the reference files and
overwrites name, description, cuisine, and logo_url with canonical values.
logo_url is added as a new column if not already present.

Matching priority per row:
  1. Exact normalized name match against chains
  2. Exact normalized name match against independents for this airport
  3. Substring match against chains (handles "Starbucks - Terminal 3" style)
"""

import csv
import json
import re
import unicodedata
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_TOOLS_DIR = _SCRIPT_DIR.parent.parent
RESTAURANTS_DIR = _TOOLS_DIR / 'data' / 'restaurants'
HELPER_DIR = _TOOLS_DIR / 'data' / 'helper_data'

CHAINS_FILE = HELPER_DIR / 'chain_restaurants.json'
INDEPENDENTS_FILE = HELPER_DIR / 'independents_enriched.json'

FILENAME_TO_CODE = {
    'gatwick': 'LGW',
    'heathrow': 'LHR',
}


def norm(name: str) -> str:
    s = name.lower()
    s = s.replace('&', 'and')
    # Decompose accented chars (é→e, è→e, ü→u, etc.)
    s = unicodedata.normalize('NFKD', s)
    s = re.sub(r'[^a-z0-9]', '', s)
    # Normalise caffè/caffé → cafe so "Café Ritazza" matches "Caffè Ritazza"
    s = re.sub(r'caffe+', 'cafe', s)
    return s


def get_airport_code(stem: str) -> str:
    return FILENAME_TO_CODE.get(stem, stem.upper())


def load_chains(path: Path) -> tuple[dict, list, dict]:
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    lookup = {norm(e['name']): e for e in data}
    # Map norm_key → original_name for word-boundary matching on short keys
    original_names = {norm(e['name']): e['name'] for e in data}
    keys_sorted = sorted(lookup.keys(), key=len, reverse=True)
    return lookup, keys_sorted, original_names


def load_independents(path: Path) -> dict:
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    lookup = {}
    for e in data:
        key = (norm(e['name']), e.get('airport_code', '').upper())
        lookup[key] = e
    return lookup


def find_match(raw_name: str, norm_name: str, airport_code: str,
               chains: dict, chain_keys: list, original_names: dict, independents: dict):
    # Exact chain match
    if norm_name in chains:
        return chains[norm_name], 'chain'
    # Exact independent match
    entry = independents.get((norm_name, airport_code))
    if entry:
        return entry, 'independent'
    # Forward substring: chain key >= 5 chars contained in normalized restaurant name
    # e.g. "Starbucks - Gate B12" → matches "starbucks"
    for key in chain_keys:
        if len(key) >= 5 and key in norm_name:
            return chains[key], 'chain'
    # Short chain key (< 5 chars): word-boundary match on original name
    # e.g. "illy Café" → \billy\b, "KFC Kentucky..." → \bKFC\b
    # This avoids "illy" matching "Philly" or "paul" matching "Paulaner"
    for key in chain_keys:
        if len(key) < 5:
            original = original_names[key]
            pattern = r'(?<![a-zA-Z])' + re.escape(original) + r'(?![a-zA-Z])'
            if re.search(pattern, raw_name, re.IGNORECASE):
                return chains[key], 'chain'
    # Reverse substring: restaurant norm contained in chain key (min 5 chars)
    # e.g. "Costa" matches "costacoffee", "Giraffe" matches "giraffeworldkitchen"
    if len(norm_name) >= 5:
        for key in chain_keys:
            if norm_name in key:
                return chains[key], 'chain'
    return None, 'none'


def enrich_row(row: dict, airport_code: str,
               chains: dict, chain_keys: list, original_names: dict,
               independents: dict) -> str:
    name = row.get('name', '').strip()
    if not name:
        return 'none'

    entry, match_type = find_match(name, norm(name), airport_code, chains, chain_keys,
                                   original_names, independents)
    if not entry:
        return 'none'

    row['name'] = entry['name']

    desc = entry.get('description', '')
    if desc:
        row['description'] = desc

    cuisines = entry.get('cuisine', [])
    if cuisines:
        row['cuisine'] = ', '.join(cuisines)

    logo = entry.get('logo_url', '')
    row['logo_url'] = logo if logo else row.get('logo_url', '')

    return match_type


def process_csv(csv_path: Path, airport_code: str,
                chains: dict, chain_keys: list, original_names: dict,
                independents: dict) -> dict:
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    if not rows:
        return {'total': 0, 'chain': 0, 'independent': 0, 'none': 0}

    # Ensure key columns exist in schema
    for col in ('cuisine', 'description', 'logo_url'):
        if col not in fieldnames:
            fieldnames.append(col)

    # Ensure each row has those keys
    for row in rows:
        for col in ('cuisine', 'description', 'logo_url'):
            if col not in row:
                row[col] = ''

    stats = {'total': len(rows), 'chain': 0, 'independent': 0, 'none': 0}
    for row in rows:
        match_type = enrich_row(row, airport_code, chains, chain_keys, original_names, independents)
        stats[match_type] += 1

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)

    return stats


def main():
    print("Loading reference data …")
    chains, chain_keys, original_names = load_chains(CHAINS_FILE)
    independents = load_independents(INDEPENDENTS_FILE)
    print(f"  Chains:       {len(chains)}")
    print(f"  Independents: {len(independents)}")
    print()

    csv_files = sorted(RESTAURANTS_DIR.glob('*_restaurants.csv'))
    total = {'total': 0, 'chain': 0, 'independent': 0, 'none': 0}

    for csv_path in csv_files:
        stem = csv_path.stem.replace('_restaurants', '')
        code = get_airport_code(stem)
        stats = process_csv(csv_path, code, chains, chain_keys, original_names, independents)

        n = stats['total']
        matched = stats['chain'] + stats['independent']
        pct = f"{matched / n * 100:.0f}%" if n else "—"
        print(
            f"  {code:<6}  {csv_path.name:<38}"
            f"total={n:>4}  chain={stats['chain']:>3}  "
            f"indep={stats['independent']:>3}  unmatched={stats['none']:>3}  ({pct})"
        )
        for k in total:
            total[k] += stats[k]

    n = total['total']
    matched = total['chain'] + total['independent']
    print(f"\nFinished: {n} rows total, {matched} matched ({matched / n * 100:.1f}%)")
    print(f"  Chains: {total['chain']}  Independents: {total['independent']}  "
          f"Unmatched: {total['none']}")


if __name__ == '__main__':
    main()
