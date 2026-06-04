#!/usr/bin/env python3
"""
Heathrow Airport Restaurant Fetcher
--------------------------------------
Fetches every restaurant / dining venue at London Heathrow Airport
using the Overpass API (OpenStreetMap).  100 % free – no API key required.

Covers all four active terminals: T2, T3, T4, T5 (T1 permanently closed).

Outputs
  heathrow_restaurants.json   full structured data
  heathrow_restaurants.csv    flat spreadsheet-friendly format
  stdout                      human-readable summary

Usage
  pip install requests
  python fetch_heathrow_restaurants.py
"""

import csv
import json
import logging
import math
import re
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

# Bounding box covering all five terminal areas + immediate surroundings.
HEATHROW_BBOX = (51.450, -0.505, 51.485, -0.415)   # (south, west, north, east)

# Approximate centre of each active terminal building (derived from OSM data).
TERMINALS = {
    "Terminal 2": (51.4707, -0.4513),
    "Terminal 3": (51.4703, -0.4562),
    "Terminal 4": (51.4590, -0.4472),
    "Terminal 5": (51.4722, -0.4875),
}

# Venue must be within this distance (metres) of at least one terminal to be
# considered "inside the airport" rather than a nearby hotel/road restaurant.
AIRPORT_RADIUS_M = 700

FOOD_AMENITIES = (
    "restaurant", "cafe", "bar", "fast_food",
    "food_court", "pub", "ice_cream", "juice_bar",
)

OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"
USER_AGENT   = "HeathrowDiningResearch/1.0 (educational)"

MAX_RETRIES  = 4
OUTPUT_JSON  = _os.path.join(JSONS_DIR, "heathrow_restaurants.json")
OUTPUT_CSV   = _os.path.join(RESTAURANTS_DIR, "heathrow_restaurants.csv")

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
    osm_id: int                      = 0
    osm_type: str                    = ""
    name: str                        = ""
    terminal: str                    = ""
    airside: Optional[bool]          = None
    floor_level: str                 = ""
    amenity_type: str                = ""
    cuisine: str                     = ""
    lat: float                       = 0.0
    lon: float                       = 0.0
    address: str                     = ""
    phone: str                       = ""
    website: str                     = ""
    opening_hours: str               = ""
    opening_hours_parsed: list[str]  = field(default_factory=list)
    wheelchair: str                  = ""
    takeaway: str                    = ""
    brand: str                       = ""
    operator: str                    = ""
    description: str                 = ""
    extra_tags: dict                 = field(default_factory=dict)

# ── Overpass ──────────────────────────────────────────────────────────────────

def build_query() -> str:
    s, w, n, e = HEATHROW_BBOX
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

# ── Coordinate / Terminal Helpers ─────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Regex to extract "Terminal N" from address fields.
_TERMINAL_RE = re.compile(r"\bTerminal\s+(\d)\b", re.IGNORECASE)


def _terminal_from_tags(tags: dict) -> Optional[str]:
    """
    Try to read the terminal directly from OSM address tags before falling
    back to geometry.  Airport staff keep these very accurate.
    """
    for field in ("addr:housename", "addr:street", "description", "name"):
        value = tags.get(field, "")
        m = _TERMINAL_RE.search(value)
        if m:
            n = m.group(1)
            label = f"Terminal {n}"
            if label in TERMINALS:
                return label
    return None


def _terminal_from_coords(lat: float, lon: float) -> str:
    """Nearest-neighbour assignment; returns 'Outside Airport' if too far."""
    distances = {
        name: _haversine(lat, lon, tlat, tlon)
        for name, (tlat, tlon) in TERMINALS.items()
    }
    nearest_name = min(distances, key=distances.__getitem__)
    if distances[nearest_name] > AIRPORT_RADIUS_M:
        return "Outside Airport"
    return nearest_name


def assign_terminal(tags: dict, lat: float, lon: float) -> str:
    return _terminal_from_tags(tags) or _terminal_from_coords(lat, lon)

# ── Opening Hours Parser ──────────────────────────────────────────────────────

_DAY_EXPAND = {
    "Mo": "Monday", "Tu": "Tuesday", "We": "Wednesday",
    "Th": "Thursday", "Fr": "Friday", "Sa": "Saturday", "Su": "Sunday",
}


def _expand_days(token: str) -> str:
    if "-" in token:
        s, e = token.split("-", 1)
        return f"{_DAY_EXPAND.get(s, s)}–{_DAY_EXPAND.get(e, e)}"
    return _DAY_EXPAND.get(token, token)


def parse_opening_hours(raw: str) -> list[str]:
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
        lines.append(f"{_expand_days(parts[0])}: {parts[1]}" if len(parts) == 2 else rule)
    return lines

# ── Parsing ───────────────────────────────────────────────────────────────────

_KNOWN_TAGS = {
    "name", "amenity", "cuisine", "opening_hours",
    "phone", "contact:phone", "website", "contact:website",
    "addr:housename", "addr:street", "addr:city",
    "addr:postcode", "addr:county",
    "airside", "level",
    "wheelchair", "takeaway",
    "brand", "operator", "description",
}


def _coords(el: dict) -> tuple[float, float]:
    if "lat" in el:
        return el["lat"], el["lon"]
    c = el.get("center", {})
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
    tags  = el.get("tags", {})
    lat, lon = _coords(el)

    airside_raw = tags.get("airside", "").lower()
    airside: Optional[bool] = (
        True  if airside_raw == "yes" else
        False if airside_raw == "no"  else
        None
    )

    oh_raw  = tags.get("opening_hours", "")
    phone   = tags.get("phone") or tags.get("contact:phone", "")
    website = tags.get("website") or tags.get("contact:website", "")
    extra   = {k: v for k, v in tags.items() if k not in _KNOWN_TAGS}

    return Restaurant(
        osm_id               = el.get("id", 0),
        osm_type             = el.get("type", ""),
        name                 = tags.get("name", ""),
        terminal             = assign_terminal(tags, lat, lon),
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
    """Keep the richer record when OSM has both a node and a way for one venue."""
    def _score(r: Restaurant) -> int:
        return sum(1 for v in asdict(r).values() if v not in (None, "", [], {}))

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
    rows = [{
        "name":          r.name,
        "terminal":      r.terminal,
        "amenity_type":  r.amenity_type,
        "airside":       r.airside,
        "floor_level":   r.floor_level,
        "cuisine":       r.cuisine,
        "lat":           r.lat,
        "lon":           r.lon,
        "address":       r.address,
        "phone":         r.phone,
        "website":       r.website,
        "opening_hours": r.opening_hours,
        "wheelchair":    r.wheelchair,
        "takeaway":      r.takeaway,
        "brand":         r.brand,
        "osm_id":        r.osm_id,
        "osm_type":      r.osm_type,
    } for r in restaurants]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    log.info("CSV  saved → %s", OUTPUT_CSV)


AMENITY_ICON = {
    "restaurant": "🍽",  "cafe": "☕",  "bar": "🍸",
    "pub": "🍺",  "fast_food": "🍔",  "food_court": "🏬",
    "ice_cream": "🍦",  "juice_bar": "🥤",
}

TERMINAL_ORDER = ["Terminal 2", "Terminal 3", "Terminal 4", "Terminal 5", "Outside Airport"]


def print_summary(restaurants: list[Restaurant]) -> None:
    divider = "═" * 72
    total = len(restaurants)
    print(f"\n{divider}")
    print(f"  London Heathrow Airport — Restaurants & Dining  ({total} venues)")
    print(f"  Data: © OpenStreetMap contributors, ODbL licence")
    print(divider)

    for group_name in TERMINAL_ORDER:
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
                " [Landside]" if r.airside is False else ""
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
            if r.wheelchair == "yes":     flags.append("Wheelchair accessible")
            if r.wheelchair == "limited": flags.append("Limited wheelchair access")
            if r.takeaway   == "yes":     flags.append("Takeaway available")
            if r.takeaway   == "only":    flags.append("Takeaway only")
            if flags:
                print(f"    Features : {', '.join(flags)}")

    print(f"\n{divider}\n")

# ── Entry Point ───────────────────────────────────────────────────────────────

def main() -> None:
    log.info("Fetching Heathrow Airport dining venues from OpenStreetMap …")
    elements = fetch_overpass()

    if not elements:
        log.error("No data returned. Check your internet connection and retry.")
        return

    raw = [parse_element(el) for el in elements]
    restaurants = deduplicate(raw)
    restaurants.sort(key=lambda r: (TERMINAL_ORDER.index(r.terminal)
                                    if r.terminal in TERMINAL_ORDER else 99,
                                    r.name.lower()))

    log.info("After deduplication: %d unique venues.", len(restaurants))

    write_json(restaurants)
    write_csv(restaurants)
    print_summary(restaurants)


if __name__ == "__main__":
    main()
