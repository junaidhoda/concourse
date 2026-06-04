#!/usr/bin/env python3
"""
Restaurant Status Verifier
-----------------------------
Cross-checks every venue in the Gatwick and Heathrow JSON files for
signs of permanent closure using three free signals:

  1. OSM disused:amenity query  – Overpass flags venues OSM editors have
                                   marked as closed/disused in the area.
  2. Website HTTP status        – 4xx/5xx or a domain-parking page strongly
                                   suggests the business no longer operates.
  3. Closure keywords           – Scans the venue's homepage for phrases
                                   like "permanently closed", "we have closed",
                                   "no longer open", etc.

Outputs
  status_report.json   machine-readable results (adds "status" field)
  status_report.txt    human-readable summary
  stdout               live progress + final summary

Usage
  python verify_restaurant_status.py
"""

import json
import logging
import re
import time
from dataclasses import dataclass
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

INPUT_FILES = {
    "Gatwick":  _os.path.join(JSONS_DIR, "gatwick_restaurants.json"),
    "Heathrow": _os.path.join(JSONS_DIR, "heathrow_restaurants.json"),
}

OUTPUT_JSON = _os.path.join(JSONS_DIR, "status_report.json")
OUTPUT_TXT  = _os.path.join(JSONS_DIR, "status_report.txt")

OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"

AIRPORT_BBOXES = {
    "Gatwick":  (51.140, -0.210, 51.168, -0.150),
    "Heathrow": (51.450, -0.505, 51.485, -0.415),
}

CLOSED_KEYWORDS = re.compile(
    r"permanently\s+closed|"
    r"we\s+(?:have\s+)?(?:permanently\s+)?closed|"
    r"this\s+(?:restaurant|location|venue|site|branch)\s+(?:has|is|have)\s+(?:now\s+)?closed|"
    r"no\s+longer\s+(?:open|operating|trading|serving)|"
    r"sadly\s+closed|"
    r"has\s+closed\s+(?:its\s+doors|permanently|down)|"
    r"closed\s+(?:permanently|for\s+good|down)|"
    r"restaurant\s+is\s+closed",
    re.IGNORECASE,
)

PARKING_KEYWORDS = re.compile(
    r"domain\s+(?:is\s+)?(?:for\s+sale|parking)|"
    r"this\s+domain\s+(?:has\s+expired|is\s+available)|"
    r"buy\s+this\s+domain|"
    r"godaddy|namecheap|sedo\.com|dan\.com",
    re.IGNORECASE,
)

REQUEST_TIMEOUT  = 10
RATE_LIMIT_S     = 0.4     # stay polite – ~2.5 req/s
MAX_RETRIES      = 2
USER_AGENT       = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class VenueStatus:
    name: str
    airport: str
    terminal: str
    website: str
    osm_disused: bool          = False   # OSM editors have marked it closed
    http_status: Optional[int] = None    # HTTP response code from their site
    site_closed_signal: bool   = False   # closure keywords found on page
    site_parked: bool          = False   # domain parked / for sale
    verdict: str               = "UNKNOWN"
    notes: str                 = ""

# ── Overpass: disused venues ──────────────────────────────────────────────────

FOOD_TYPES = "restaurant|cafe|bar|fast_food|food_court|pub|ice_cream|juice_bar"

def fetch_disused(airport: str) -> set[str]:
    """Return lowercase names of venues OSM has tagged as disused/closed."""
    s, w, n, e = AIRPORT_BBOXES[airport]
    bbox  = f"{s},{w},{n},{e}"
    query = f"""[out:json][timeout:30];
(
  node["disused:amenity"~"^({FOOD_TYPES})$"]["name"]({bbox});
  way["disused:amenity"~"^({FOOD_TYPES})$"]["name"]({bbox});
  node["amenity"~"^({FOOD_TYPES})$"]["name"]["disused"="yes"]({bbox});
  node["amenity"~"^({FOOD_TYPES})$"]["name"]["opening_hours"="closed"]({bbox});
  node["amenity"~"^({FOOD_TYPES})$"]["name"]["closed"="yes"]({bbox});
);
out tags;"""
    try:
        r = requests.get(
            OVERPASS_URL,
            params={"data": query},
            headers={"User-Agent": "StatusVerifier/1.0"},
            timeout=30,
        )
        r.raise_for_status()
        names = {
            el.get("tags", {}).get("name", "").lower().strip()
            for el in r.json().get("elements", [])
            if el.get("tags", {}).get("name")
        }
        log.info("OSM disused query for %s → %d closed/disused entries", airport, len(names))
        return names
    except Exception as exc:
        log.warning("OSM disused query failed for %s: %s", airport, exc)
        return set()

# ── Website check ─────────────────────────────────────────────────────────────

def check_website(url: str) -> tuple[Optional[int], bool, bool]:
    """
    Returns (http_status, closed_signal_found, is_parked).
    Follows up to 5 redirects; reads max 50 KB of the page body.
    """
    if not url:
        return None, False, False

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(
                url,
                headers=headers,
                timeout=REQUEST_TIMEOUT,
                allow_redirects=True,
                stream=True,
            )
            # Read up to 50 KB – enough to catch meta tags and above-fold text.
            content = b""
            for chunk in r.iter_content(chunk_size=4096):
                content += chunk
                if len(content) >= 50_000:
                    break
            text = content.decode("utf-8", errors="replace")

            closed  = bool(CLOSED_KEYWORDS.search(text))
            parked  = bool(PARKING_KEYWORDS.search(text))
            return r.status_code, closed, parked

        except requests.exceptions.SSLError:
            # Retry over HTTP if HTTPS fails
            if url.startswith("https://") and attempt == 1:
                url = url.replace("https://", "http://", 1)
                continue
            return None, False, False
        except requests.RequestException:
            if attempt < MAX_RETRIES:
                time.sleep(1)
                continue
            return None, False, False

    return None, False, False

# ── Verdict logic ─────────────────────────────────────────────────────────────

def compute_verdict(s: VenueStatus) -> tuple[str, str]:
    """
    Returns (verdict, notes) using a confidence-weighted decision tree.

    CLOSED        – high confidence the venue is no longer operating
    LIKELY_CLOSED – moderate confidence
    OPEN          – website active, no closure signals
    UNVERIFIED    – no website and not in OSM disused list
    """
    notes = []

    if s.osm_disused:
        notes.append("OSM editors have tagged this venue as disused/closed")
        return "CLOSED", "; ".join(notes)

    if s.http_status is not None:
        if s.site_parked:
            notes.append(f"Domain appears parked / for-sale (HTTP {s.http_status})")
            return "CLOSED", "; ".join(notes)
        if s.site_closed_signal:
            notes.append(f"Closure language found on website (HTTP {s.http_status})")
            return "CLOSED", "; ".join(notes)
        if s.http_status == 200:
            return "OPEN", "Website responded 200 OK, no closure signals detected"
        if s.http_status in (301, 302):
            notes.append(f"Website redirects (HTTP {s.http_status}) — may be restructured")
            return "LIKELY_OPEN", "; ".join(notes)
        if s.http_status in (404, 410):
            notes.append(f"Website returned HTTP {s.http_status} — page no longer exists")
            return "LIKELY_CLOSED", "; ".join(notes)
        if s.http_status >= 500:
            notes.append(f"Website returned server error HTTP {s.http_status}")
            return "UNVERIFIED", "; ".join(notes)

    return "UNVERIFIED", "No website listed in OSM; manual check recommended"

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    all_results: list[dict] = []

    for airport, filepath in INPUT_FILES.items():
        log.info("── %s ──────────────────────────────────", airport)

        try:
            with open(filepath, encoding="utf-8") as fh:
                venues = json.load(fh)
        except FileNotFoundError:
            log.error("File not found: %s  (run the fetch script first)", filepath)
            continue

        disused_names = fetch_disused(airport)
        time.sleep(1)

        for venue in venues:
            name    = venue.get("name", "")
            website = venue.get("website", "")
            terminal = venue.get("terminal", "")

            log.info("Checking: %s  [%s]", name, terminal)

            status = VenueStatus(
                name     = name,
                airport  = airport,
                terminal = terminal,
                website  = website,
            )

            status.osm_disused = name.lower().strip() in disused_names

            if website:
                (status.http_status,
                 status.site_closed_signal,
                 status.site_parked) = check_website(website)
                time.sleep(RATE_LIMIT_S)

            status.verdict, status.notes = compute_verdict(status)

            all_results.append({
                "name":               status.name,
                "airport":            status.airport,
                "terminal":           status.terminal,
                "verdict":            status.verdict,
                "notes":              status.notes,
                "website":            status.website,
                "http_status":        status.http_status,
                "osm_disused":        status.osm_disused,
                "site_closed_signal": status.site_closed_signal,
                "site_parked":        status.site_parked,
            })

    # ── JSON output ───────────────────────────────────────────────────────────
    with open(OUTPUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(all_results, fh, indent=2, ensure_ascii=False)
    log.info("Full results → %s", OUTPUT_JSON)

    # ── Text report ───────────────────────────────────────────────────────────
    verdict_order = ["CLOSED", "LIKELY_CLOSED", "LIKELY_OPEN", "OPEN", "UNVERIFIED"]
    verdicts_found = {v: [] for v in verdict_order}
    for r in all_results:
        verdicts_found.get(r["verdict"], verdicts_found["UNVERIFIED"]).append(r)

    lines = []
    lines.append("=" * 72)
    lines.append("  AIRPORT RESTAURANT STATUS REPORT")
    lines.append(f"  {len(all_results)} venues checked across Gatwick and Heathrow")
    lines.append("=" * 72)

    labels = {
        "CLOSED":        "CLOSED  (high confidence)",
        "LIKELY_CLOSED": "LIKELY CLOSED",
        "LIKELY_OPEN":   "LIKELY OPEN",
        "OPEN":          "OPEN  (website confirmed active)",
        "UNVERIFIED":    "UNVERIFIED  (no website — manual check needed)",
    }

    for verdict in verdict_order:
        group = verdicts_found[verdict]
        if not group:
            continue
        lines.append(f"\n{'─' * 72}")
        lines.append(f"  {labels[verdict]}  ({len(group)} venues)")
        lines.append(f"{'─' * 72}")
        for r in sorted(group, key=lambda x: (x["airport"], x["terminal"], x["name"])):
            lines.append(f"\n  {r['name']}")
            lines.append(f"    Airport  : {r['airport']}  |  {r['terminal']}")
            if r["website"]:
                lines.append(f"    Website  : {r['website']}")
                if r["http_status"]:
                    lines.append(f"    HTTP     : {r['http_status']}")
            if r["notes"]:
                lines.append(f"    Note     : {r['notes']}")

    lines.append(f"\n{'=' * 72}")
    report = "\n".join(lines)
    print(report)

    with open(OUTPUT_TXT, "w", encoding="utf-8") as fh:
        fh.write(report + "\n")
    log.info("Text report → %s", OUTPUT_TXT)


if __name__ == "__main__":
    main()
