#!/usr/bin/env python3
"""
Gatwick Airport Restaurant Fetcher
------------------------------------
Fetches every restaurant / dining venue at London Gatwick Airport using
the Overpass API (OpenStreetMap).  100 % free – no API key required.

What it collects
  name, amenity type, terminal (North/South), airside status, floor level,
  coordinates, address, phone, website, cuisine, opening hours, wheelchair
  access, takeaway availability, and all other OSM tags on record.

Outputs
  gatwick_restaurants.json   full structured data
  gatwick_restaurants.csv    flat spreadsheet-friendly format
  stdout                     human-readable summary

Usage
  pip install requests
  python fetch_gatwick_restaurants.py
"""

import csv
import json
import logging
import math
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

import requests

import os as _os
_SCRIPT_DIR     = _os.path.dirname(_os.path.abspath(__file__))
_TOOLS_DIR      = _os.path.join(_SCRIPT_DIR, '..', '..')
RESTAURANTS_DIR = _os.path.join(_TOOLS_DIR, 'data', 'restaurants')
JSONS_DIR       = _os.path.join(_TOOLS_DIR, 'data', 'restaurants', 'jsons')
HELPER_DIR      = _os.path.join(_TOOLS_DIR, 'data', 'helper_data')
IMAGES_DIR      = _os.path.join(_TOOLS_DIR, 'airport_images')


# ── Configuration ─────────────────────────────────────────────────────────────

# Bounding box that covers the entire Gatwick campus (both terminals + apron).
GATWICK_BBOX = (51.140, -0.210, 51.168, -0.150)   # (south, west, north, east)

# Geographic centre of each terminal building (derived from OSM venue centroids).
SOUTH_TERMINAL = (51.1562, -0.1630)
NORTH_TERMINAL = (51.1602, -0.1783)

# OSM amenity values that represent food / drink venues.
FOOD_AMENITIES = (
    "restaurant", "cafe", "bar", "fast_food",
    "food_court", "pub", "ice_cream", "juice_bar",
)

OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"
USER_AGENT   = "GatwickDiningResearch/1.0 (educational)"

MAX_RETRIES  = 4
OUTPUT_JSON  = _os.path.join(JSONS_DIR, "gatwick_restaurants.json")
OUTPUT_CSV   = _os.path.join(RESTAURANTS_DIR, "gatwick_restaurants.csv")

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Data Model ────────────────────────────────────────────────────────────────

@dataclass
class Restaurant:
    osm_id: int               = 0
    osm_type: str             = ""       # node | way | relation
    name: str                 = ""
    terminal: str             = ""       # South Terminal | North Terminal | Outside
    airside: Optional[bool]   = None     # True = past security, False = landside
    floor_level: str          = ""       # "1", "2", "3" etc.
    amenity_type: str         = ""       # restaurant, cafe, bar, fast_food …
    cuisine: str              = ""       # e.g. "asian", "burger", "coffee_shop"
    lat: float                = 0.0
    lon: float                = 0.0
    address: str              = ""
    phone: str                = ""
    website: str              = ""
    opening_hours: str        = ""       # raw OSM opening-hours string
    opening_hours_parsed: list[str] = field(default_factory=list)  # human-readable lines
    wheelchair: str           = ""       # yes | no | limited
    takeaway: str             = ""       # yes | no | only
    brand: str                = ""
    operator: str             = ""
    description: str          = ""
    extra_tags: dict          = field(default_factory=dict)   # any remaining OSM tags

# ── Overpass Query ────────────────────────────────────────────────────────────

def build_query() -> str:
    s, w, n, e = GATWICK_BBOX
    amenity_regex = "|".join(FOOD_AMENITIES)
    bbox = f"{s},{w},{n},{e}"
    return f"""[out:json][timeout:60];
(
  node["amenity"~"^({amenity_regex})$"]["name"]({bbox});
  way["amenity"~"^({amenity_regex})$"]["name"]({bbox});
  relation["amenity"~"^({amenity_regex})$"]["name"]({bbox});
);
out center tags;"""


def fetch_overpass() -> list[dict]:
    query = build_query()
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log.info("Querying Overpass API (attempt %d/%d) …", attempt, MAX_RETRIES)
            r = requests.get(
                OVERPASS_URL,
                params={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=60,
            )
            r.raise_for_status()
            data = r.json()
            elements = data.get("elements", [])
            log.info("Received %d elements from Overpass.", len(elements))
            return elements
        except requests.RequestException as exc:
            wait = 2 ** attempt
            log.warning("Request failed: %s — retrying in %ds", exc, wait)
            time.sleep(wait)
    log.error("All Overpass retries exhausted.")
    return []

# ── Coordinate Helpers ────────────────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Returns distance in metres between two lat/lon points."""
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _terminal_for(lat: float, lon: float) -> str:
    """
    Assign a venue to the nearest terminal.
    Venues more than 600 m from either terminal centre are marked 'Outside'.
    """
    d_south = _haversine(lat, lon, *SOUTH_TERMINAL)
    d_north = _haversine(lat, lon, *NORTH_TERMINAL)
    if min(d_south, d_north) > 900:
        return "Outside Airport"
    return "South Terminal" if d_south <= d_north else "North Terminal"

# ── Opening Hours Parser ──────────────────────────────────────────────────────

_DAY_EXPAND = {
    "Mo": "Monday",   "Tu": "Tuesday",  "We": "Wednesday",
    "Th": "Thursday", "Fr": "Friday",   "Sa": "Saturday",
    "Su": "Sunday",
}

def _expand_days(token: str) -> str:
    """Turn 'Mo-Fr' or 'Sa' into readable day strings."""
    if "-" in token:
        start, end = token.split("-", 1)
        return f"{_DAY_EXPAND.get(start, start)}–{_DAY_EXPAND.get(end, end)}"
    return _DAY_EXPAND.get(token, token)


def parse_opening_hours(raw: str) -> list[str]:
    """
    Convert an OSM opening-hours string into a list of human-readable lines.
    Handles the most common patterns; unknown syntax is returned as-is.
    """
    if not raw:
        return []
    if raw.strip() == "24/7":
        return ["Open 24 hours, 7 days a week"]

    lines = []
    for rule in raw.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        parts = rule.split(" ", 1)
        if len(parts) == 2:
            days_raw, hours = parts
            days = _expand_days(days_raw)
            lines.append(f"{days}: {hours}")
        else:
            lines.append(rule)
    return lines

# ── Parsing ───────────────────────────────────────────────────────────────────

# Tags we promote to dedicated fields; the rest go into extra_tags.
_KNOWN_TAGS = {
    "name", "amenity", "cuisine", "opening_hours",
    "phone", "contact:phone", "website", "contact:website",
    "addr:housename", "addr:street", "addr:city",
    "addr:postcode", "addr:county",
    "airside", "level",
    "wheelchair", "takeaway",
    "brand", "operator",
    "description",
}


def _coords(element: dict) -> tuple[float, float]:
    if "lat" in element:
        return element["lat"], element["lon"]
    c = element.get("center", {})
    return c.get("lat", 0.0), c.get("lon", 0.0)


def _address(tags: dict) -> str:
    parts = [
        tags.get("addr:housename", ""),
        tags.get("addr:street", ""),
        tags.get("addr:city", ""),
        tags.get("addr:postcode", ""),
    ]
    return ", ".join(p for p in parts if p)


def parse_element(el: dict) -> Restaurant:
    tags = el.get("tags", {})
    lat, lon = _coords(el)

    airside_raw = tags.get("airside", "").lower()
    airside: Optional[bool] = (
        True  if airside_raw == "yes" else
        False if airside_raw == "no"  else
        None
    )

    oh_raw = tags.get("opening_hours", "")
    phone = tags.get("phone") or tags.get("contact:phone", "")
    website = tags.get("website") or tags.get("contact:website", "")

    extra = {k: v for k, v in tags.items() if k not in _KNOWN_TAGS}

    return Restaurant(
        osm_id               = el.get("id", 0),
        osm_type             = el.get("type", ""),
        name                 = tags.get("name", ""),
        terminal             = _terminal_for(lat, lon),
        airside              = airside,
        floor_level          = tags.get("level", ""),
        amenity_type         = tags.get("amenity", ""),
        cuisine              = tags.get("cuisine", "").replace(";", ", "),
        lat                  = lat,
        lon                  = lon,
        address              = _address(tags),
        phone                = phone,
        website              = website,
        opening_hours        = oh_raw,
        opening_hours_parsed = parse_opening_hours(oh_raw),
        wheelchair           = tags.get("wheelchair", ""),
        takeaway             = tags.get("takeaway", ""),
        brand                = tags.get("brand", ""),
        operator             = tags.get("operator", ""),
        description          = tags.get("description", ""),
        extra_tags           = extra,
    )

# ── Deduplication ─────────────────────────────────────────────────────────────

def deduplicate(restaurants: list[Restaurant]) -> list[Restaurant]:
    """
    OSM sometimes has both a node and a way for the same venue.
    Keep the richer record (more non-empty fields).
    """
    def _score(r: Restaurant) -> int:
        d = asdict(r)
        return sum(1 for v in d.values() if v not in (None, "", [], {}))

    seen: dict[str, Restaurant] = {}
    for r in restaurants:
        key = r.name.lower().strip()
        if key not in seen or _score(r) > _score(seen[key]):
            seen[key] = r
    return list(seen.values())

# ── Output ────────────────────────────────────────────────────────────────────

def write_json(restaurants: list[Restaurant]) -> None:
    with open(OUTPUT_JSON, "w", encoding="utf-8") as fh:
        json.dump([asdict(r) for r in restaurants], fh, indent=2, ensure_ascii=False)
    log.info("JSON saved → %s  (%d venues)", OUTPUT_JSON, len(restaurants))


def write_csv(restaurants: list[Restaurant]) -> None:
    if not restaurants:
        return
    rows = []
    for r in restaurants:
        rows.append({
            "name":             r.name,
            "terminal":         r.terminal,
            "amenity_type":     r.amenity_type,
            "airside":          r.airside,
            "floor_level":      r.floor_level,
            "cuisine":          r.cuisine,
            "lat":              r.lat,
            "lon":              r.lon,
            "address":          r.address,
            "phone":            r.phone,
            "website":          r.website,
            "opening_hours":    r.opening_hours,
            "wheelchair":       r.wheelchair,
            "takeaway":         r.takeaway,
            "brand":            r.brand,
            "osm_id":           r.osm_id,
            "osm_type":         r.osm_type,
        })
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    log.info("CSV  saved → %s", OUTPUT_CSV)


AMENITY_ICON = {
    "restaurant": "🍽",
    "cafe":       "☕",
    "bar":        "🍺",
    "pub":        "🍺",
    "fast_food":  "🍔",
    "food_court": "🏬",
    "ice_cream":  "🍦",
    "juice_bar":  "🥤",
}


def print_summary(restaurants: list[Restaurant]) -> None:
    divider = "═" * 72
    total = len(restaurants)
    print(f"\n{divider}")
    print(f"  London Gatwick Airport — Restaurants & Dining  ({total} venues)")
    print(f"  Data: © OpenStreetMap contributors, ODbL licence")
    print(divider)

    for group_name in ("South Terminal", "North Terminal", "Outside Airport"):
        group = sorted(
            [r for r in restaurants if r.terminal == group_name],
            key=lambda x: x.name.lower(),
        )
        if not group:
            continue
        print(f"\n  ▸ {group_name}  ({len(group)} venues)")
        print("  " + "─" * 68)

        for r in group:
            icon = AMENITY_ICON.get(r.amenity_type, "•")
            airside_label = (
                " [Airside]"  if r.airside is True  else
                " [Landside]" if r.airside is False else
                ""
            )
            level_label = f" · Floor {r.floor_level}" if r.floor_level else ""
            print(f"\n  {icon} {r.name}{airside_label}{level_label}")
            print(f"    Type     : {r.amenity_type.replace('_', ' ').title()}"
                  + (f" — {r.cuisine}" if r.cuisine else ""))
            if r.address:
                print(f"    Address  : {r.address}")
            print(f"    Coords   : {r.lat:.6f}, {r.lon:.6f}")
            if r.phone:
                print(f"    Phone    : {r.phone}")
            if r.website:
                print(f"    Website  : {r.website}")
            if r.opening_hours_parsed:
                print( "    Hours    :")
                for line in r.opening_hours_parsed:
                    print(f"               {line}")
            elif r.opening_hours:
                print(f"    Hours    : {r.opening_hours}")
            flags = []
            if r.wheelchair == "yes":    flags.append("Wheelchair accessible")
            if r.wheelchair == "limited": flags.append("Limited wheelchair access")
            if r.takeaway == "yes":      flags.append("Takeaway available")
            if r.takeaway == "only":     flags.append("Takeaway only")
            if flags:
                print(f"    Features : {', '.join(flags)}")

    print(f"\n{divider}\n")

# ── Entry Point ───────────────────────────────────────────────────────────────

def main() -> None:
    log.info("Fetching Gatwick Airport dining venues from OpenStreetMap …")
    elements = fetch_overpass()

    if not elements:
        log.error("No data returned. Check your internet connection and retry.")
        return

    raw = [parse_element(el) for el in elements]
    restaurants = deduplicate(raw)
    restaurants.sort(key=lambda r: (r.terminal, r.name.lower()))

    log.info("After deduplication: %d unique venues.", len(restaurants))

    write_json(restaurants)
    write_csv(restaurants)
    print_summary(restaurants)


if __name__ == "__main__":
    main()
