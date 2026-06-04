#!/usr/bin/env python3
"""
Extract unique restaurants from all airport CSVs.

Outputs:
  unique_restaurants.csv   — deduplicated records with name, cuisine, airport count
  unique_names.txt         — plain name list for Cowork brand master prompt
"""

import csv
import re
from collections import defaultdict

import os as _os
_SCRIPT_DIR     = _os.path.dirname(_os.path.abspath(__file__))
_TOOLS_DIR      = _os.path.join(_SCRIPT_DIR, '..', '..')
RESTAURANTS_DIR = _os.path.join(_TOOLS_DIR, 'data', 'restaurants')
JSONS_DIR       = _os.path.join(_TOOLS_DIR, 'data', 'restaurants', 'jsons')
HELPER_DIR      = _os.path.join(_TOOLS_DIR, 'data', 'helper_data')
IMAGES_DIR      = _os.path.join(_TOOLS_DIR, 'airport_images')


CSV_DIR = RESTAURANTS_DIR

AIRPORT_CSVS = {
    "LGW": "gatwick_restaurants.csv",
    "LHR": "heathrow_restaurants.csv",
    "BHX": "bhx_restaurants.csv",
    "MAN": "man_restaurants.csv",
    "CDG": "cdg_restaurants.csv",
    "FRA": "fra_restaurants.csv",
    "HND": "hnd_restaurants.csv",
    "AUH": "auh_restaurants.csv",
    "DOH": "doh_restaurants.csv",
    "IST": "ist_restaurants.csv",
    "JFK": "jfk_restaurants.csv",
    "SIN": "sin_restaurants.csv",
    "LAX": "lax_restaurants.csv",
    "BKK": "bkk_restaurants.csv",
    "DXB": "dxb_restaurants.csv",
    "LGW": "lgw_restaurants.csv",
    "PKX": "pkx_restaurants.csv",
    "CAN": "can_restaurants.csv",
    "HKG": "hkg_restaurants.csv",
    "TPE": "tpe_restaurants.csv",
    "ICN": "icn_restaurants.csv",
    "NRT": "nrt_restaurants.csv",
    "GIG": "gig_restaurants.csv",
    "LIM": "lim_restaurants.csv",
    "LOS": "los_restaurants.csv",
    "JNB": "jnb_restaurants.csv",
    "WLG": "wlg_restaurants.csv",
    "SYD": "syd_restaurants.csv",
    "MEL": "mel_restaurants.csv",
    "KIX": "kix_restaurants.csv",
    "KUL": "kul_restaurants.csv",
    "MNL": "mnl_restaurants.csv",
    "DEL": "del_restaurants.csv",
    "BOM": "bom_restaurants.csv",
    "CMB": "cmb_restaurants.csv",
    "HAN": "han_restaurants.csv",
    "AMS": "ams_restaurants.csv",
    "ATH": "ath_restaurants.csv",
    "ATL": "atl_restaurants.csv",
    "DFW": "dfw_restaurants.csv",
    "BOS": "bos_restaurants.csv",
    "BRU": "bru_restaurants.csv",
    "DEN": "den_restaurants.csv",
    "DUB": "dub_restaurants.csv",
    "FCO": "fco_restaurants.csv",
    "IAH": "iah_restaurants.csv",
    "LAS": "las_restaurants.csv",
    "LGA": "lga_restaurants.csv",
    "LIS": "lis_restaurants.csv",
    "MAD": "mad_restaurants.csv",
    "MCO": "mco_restaurants.csv",
    "MEX": "mex_restaurants.csv",
    "MIA": "mia_restaurants.csv",
    "MUC": "muc_restaurants.csv",
    "ORD": "ord_restaurants.csv",
    "SEA": "sea_restaurants.csv",
    "YVR": "yvr_restaurants.csv",
    "YYZ": "yyz_restaurants.csv",
    "ZRH": "zrh_restaurants.csv",
}

OUTPUT_CSV   = _os.path.join(HELPER_DIR, "unique_restaurants.csv")
OUTPUT_NAMES = _os.path.join(HELPER_DIR, "unique_names.txt")


def key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def main():
    import os

    # name_key → best record
    seen: dict[str, dict] = {}
    # name_key → airports it appears in
    airports_map: dict[str, list[str]] = defaultdict(list)

    for code, filename in AIRPORT_CSVS.items():
        path = os.path.join(CSV_DIR, filename)
        if not os.path.exists(path):
            print(f"  MISSING: {filename}")
            continue

        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                name = (row.get("name") or "").strip()
                if not name:
                    continue
                k = key(name)
                airports_map[k].append(code)
                if k not in seen:
                    seen[k] = {
                        "name":     name,
                        "cuisine":  (row.get("cuisine") or "").strip(),
                        "example_airport": code,
                    }
                count += 1
        print(f"  {code}: {count} rows")

    records = []
    for k, rec in seen.items():
        ap = airports_map[k]
        rec["airport_count"] = len(ap)
        rec["airports"] = ", ".join(sorted(set(ap)))
        records.append(rec)

    records.sort(key=lambda r: (-r["airport_count"], r["name"].lower()))

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "cuisine", "airport_count", "airports", "example_airport"])
        writer.writeheader()
        writer.writerows(records)

    with open(OUTPUT_NAMES, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(rec["name"] + "\n")

    chains       = [r for r in records if r["airport_count"] > 1]
    independents = [r for r in records if r["airport_count"] == 1]

    print(f"\n{'='*50}")
    print(f"  Total independent restaurants: {len(records)}")
    print(f"  Independents (2+ airports):     {len(independents)}")
    print(f"  Independents:             {len(independents)}")
    print(f"{'='*50}")
    print(f"\nTop indepdnetns:")
    for r in independents:
        print(f"  {r['airport_count']:>3}x  {r['name']}")
    print(f"\nWrote {OUTPUT_CSV}")
    print(f"Wrote {OUTPUT_NAMES}")


if __name__ == "__main__":
    main()