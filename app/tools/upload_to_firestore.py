#!/usr/bin/env python3
"""
Upload airport restaurant data to Firestore.

Structure:
  airports/{airport_id}/
    terminals/{terminal_id}/
      restaurants/{auto-id}/
"""

import csv
import re
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = "/Users/junaidhoda/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json"

GATWICK_CSV  = "gatwick_restaurants.csv"
HEATHROW_CSV = "heathrow_restaurants.csv"
BHX_CSV      = "bhx_restaurants.csv"
MAN_CSV      = "man_restaurants.csv"
CDG_CSV      = "cdg_restaurants.csv"
FRA_CSV      = "fra_restaurants.csv"
DXB_CSV      = "dxb_restaurants.csv"
JFK_CSV      = "jfk_restaurants.csv"
LAX_CSV      = "lax_restaurants.csv"
SIN_CSV      = "sin_restaurants.csv"
IST_CSV      = "ist_restaurants.csv"
BKK_CSV      = "bkk_restaurants.csv"

# ── Helpers ───────────────────────────────────────────────────────────────────

def slug(s: str) -> str:
    """Turn 'South Terminal' → 'south_terminal' for use as a doc ID."""
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def parse_float(s: str):
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def clean(row: dict, extra_fields: dict) -> dict:
    """Build a Firestore-ready restaurant document from a CSV row."""
    return {
        # ── Core identity ──────────────────────────────────────────────
        "name":            row.get("name", "").strip(),
        "airside":         row.get("airside", "").strip(),       # Airside / Landside / Both
        "floor_level":     row.get("floor_level", "").strip(),

        # ── Location ───────────────────────────────────────────────────
        "lat":             parse_float(row.get("lat")),
        "lon":             parse_float(row.get("lon")),
        "address":         row.get("address", "").strip(),

        # ── Contact ────────────────────────────────────────────────────
        "phone":           row.get("phone", "").strip(),
        "website":         row.get("website", "").strip(),

        # ── Dining info (populate from CSV where available, else blank) ─
        "cuisine":         row.get("cuisine", "").strip(),       # e.g. "asian", "burger"
        "categories":      row.get("categories", "").strip(),    # e.g. "Restaurant, Gluten-free"
        "description":     row.get("description", "").strip(),

        # ── Opening hours ──────────────────────────────────────────────
        "opening_hours":   row.get("opening_hours", "").strip(), # raw OSM string
        "opening_monday":    "",   # e.g. "07:00-22:00"
        "opening_tuesday":   "",
        "opening_wednesday": "",
        "opening_thursday":  "",
        "opening_friday":    "",
        "opening_saturday":  "",
        "opening_sunday":    "",
        "open_24_7":         False,

        # ── Features ───────────────────────────────────────────────────
        "wheelchair_accessible": row.get("wheelchair", "").strip(),  # yes / no / limited
        "takeaway":        row.get("takeaway", "").strip(),           # yes / no / only
        "delivery":        "",
        "reservable":      "",
        "halal":           "",
        "vegetarian_options": "",
        "vegan_options":   "",
        "kids_menu":       "",

        # ── Metadata ───────────────────────────────────────────────────
        "verified_status": row.get("verified_status", "").strip(),
        "osm_id":          row.get("osm_id", "").strip(),
        **extra_fields,
    }

# ── Upload ────────────────────────────────────────────────────────────────────

def upload(db, airport_id: str, airport_meta: dict,
           terminal_name: str, restaurants: list[dict]):
    terminal_id = slug(terminal_name)

    airport_ref  = db.collection("airports").document(airport_id)
    terminal_ref = airport_ref.collection("terminals").document(terminal_id)

    # Upsert airport + terminal metadata
    airport_ref.set(airport_meta, merge=True)
    terminal_ref.set({"name": terminal_name}, merge=True)

    rest_col = terminal_ref.collection("restaurants")

    added = 0
    for doc in restaurants:
        rest_col.add(doc)
        added += 1

    print(f"  {terminal_name}: uploaded {added} restaurants")


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # ── Gatwick ───────────────────────────────────────────────────────
    print("Uploading Gatwick …")
    gatwick_meta = {
        "name":    "London Gatwick Airport",
        "code":    "LGW",
        "city":    "London",
        "country": "UK",
        "lat":     51.1537,
        "lon":     -0.1821,
    }
    with open(GATWICK_CSV, encoding="utf-8") as f:
        gatwick_rows = list(csv.DictReader(f))

    for terminal_name in ["North Terminal", "South Terminal"]:
        rows = [r for r in gatwick_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Gatwick"}) for r in rows]
        upload(db, "gatwick", gatwick_meta, terminal_name, docs)

    # ── Heathrow ──────────────────────────────────────────────────────
    print("Uploading Heathrow …")
    heathrow_meta = {
        "name":    "London Heathrow Airport",
        "code":    "LHR",
        "city":    "London",
        "country": "UK",
        "lat":     51.4700,
        "lon":     -0.4543,
    }
    with open(HEATHROW_CSV, encoding="utf-8") as f:
        heathrow_rows = list(csv.DictReader(f))

    for terminal_name in ["Terminal 2", "Terminal 3", "Terminal 4", "Terminal 5"]:
        rows = [r for r in heathrow_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Heathrow"}) for r in rows]
        upload(db, "heathrow", heathrow_meta, terminal_name, docs)

    # ── Birmingham ────────────────────────────────────────────────────
    print("Uploading Birmingham …")
    bhx_meta = {
        "name":    "Birmingham Airport",
        "code":    "BHX",
        "city":    "Birmingham",
        "country": "UK",
        "lat":     52.4538,
        "lon":     -1.7480,
    }
    with open(BHX_CSV, encoding="utf-8") as f:
        bhx_rows = list(csv.DictReader(f))

    for terminal_name in ["Main Terminal"]:
        rows = [r for r in bhx_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Birmingham"}) for r in rows]
        upload(db, "birmingham", bhx_meta, terminal_name, docs)

    # ── Manchester ───────────────────────────────────────────────────
    print("Uploading Manchester …")
    man_meta = {
        "name":    "Manchester Airport",
        "code":    "MAN",
        "city":    "Manchester",
        "country": "UK",
        "lat":     53.3537,
        "lon":     -2.2750,
    }
    with open(MAN_CSV, encoding="utf-8") as f:
        man_rows = list(csv.DictReader(f))

    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3"]:
        rows = [r for r in man_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Manchester"}) for r in rows]
        upload(db, "manchester", man_meta, terminal_name, docs)

    # ── CDG ──────────────────────────────────────────────────────────
    print("Uploading CDG …")
    cdg_meta = {
        "name":    "Paris Charles de Gaulle Airport",
        "code":    "CDG",
        "city":    "Paris",
        "country": "France",
        "lat":     49.0097,
        "lon":     2.5477,
    }
    with open(CDG_CSV, encoding="utf-8") as f:
        cdg_rows = list(csv.DictReader(f))

    for terminal_name in [
        "Terminal 1", "Terminal 3",
        "Terminal 2A", "Terminal 2B", "Terminal 2C",
        "Terminal 2D", "Terminal 2E", "Terminal 2F", "Terminal 2G",
    ]:
        rows = [r for r in cdg_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "CDG"}) for r in rows]
        upload(db, "cdg", cdg_meta, terminal_name, docs)

    # ── Frankfurt ─────────────────────────────────────────────────────────
    print("Uploading Frankfurt …")
    fra_meta = {
        "name":    "Frankfurt Airport",
        "code":    "FRA",
        "city":    "Frankfurt",
        "country": "Germany",
        "lat":     50.0379,
        "lon":     8.5622,
    }
    with open(FRA_CSV, encoding="utf-8") as f:
        fra_rows = list(csv.DictReader(f))

    for terminal_name in [
        "Terminal 1 Area A", "Terminal 1 Area B",
        "Terminal 1 Area C", "Terminal 1 Area Z",
        "Terminal 2 Area D", "Terminal 2 Area E",
    ]:
        rows = [r for r in fra_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Frankfurt"}) for r in rows]
        upload(db, "fra", fra_meta, terminal_name, docs)

    # ── Dubai ─────────────────────────────────────────────────────────────
    print("Uploading Dubai …")
    dxb_meta = {
        "name":    "Dubai International Airport",
        "code":    "DXB",
        "city":    "Dubai",
        "country": "UAE",
        "lat":     25.2532,
        "lon":     55.3658,
    }
    with open(DXB_CSV, encoding="utf-8") as f:
        dxb_rows = list(csv.DictReader(f))

    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3"]:
        rows = [r for r in dxb_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Dubai"}) for r in rows]
        upload(db, "dubai", dxb_meta, terminal_name, docs)

    # ── JFK ───────────────────────────────────────────────────────────────
    print("Uploading JFK …")
    jfk_meta = {
        "name":    "John F. Kennedy International Airport",
        "code":    "JFK",
        "city":    "New York",
        "country": "USA",
        "lat":     40.6413,
        "lon":     -73.7781,
    }
    with open(JFK_CSV, encoding="utf-8") as f:
        jfk_rows = list(csv.DictReader(f))

    for terminal_name in ["Terminal 1", "Terminal 4", "Terminal 5", "Terminal 7", "Terminal 8"]:
        rows = [r for r in jfk_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "JFK"}) for r in rows]
        upload(db, "jfk", jfk_meta, terminal_name, docs)

    # ── LAX ───────────────────────────────────────────────────────────────
    print("Uploading LAX …")
    lax_meta = {
        "name":    "Los Angeles International Airport",
        "code":    "LAX",
        "city":    "Los Angeles",
        "country": "USA",
        "lat":     33.9425,
        "lon":     -118.4081,
    }
    with open(LAX_CSV, encoding="utf-8") as f:
        lax_rows = list(csv.DictReader(f))

    for terminal_name in [
        "Terminal 1", "Terminal 2", "Terminal 3", "Terminal 4",
        "Terminal 5", "Terminal 6", "Terminal 7", "Terminal 8",
        "Tom Bradley International",
    ]:
        rows = [r for r in lax_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "LAX"}) for r in rows]
        upload(db, "lax", lax_meta, terminal_name, docs)

    # ── Singapore ─────────────────────────────────────────────────────────
    print("Uploading Singapore Changi …")
    sin_meta = {
        "name":    "Singapore Changi Airport",
        "code":    "SIN",
        "city":    "Singapore",
        "country": "Singapore",
        "lat":     1.3545,
        "lon":     103.9890,
    }
    with open(SIN_CSV, encoding="utf-8") as f:
        sin_rows = list(csv.DictReader(f))

    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3", "Terminal 4"]:
        rows = [r for r in sin_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Singapore Changi"}) for r in rows]
        upload(db, "singapore", sin_meta, terminal_name, docs)

    # ── Istanbul ──────────────────────────────────────────────────────────
    print("Uploading Istanbul …")
    ist_meta = {
        "name":    "Istanbul Airport",
        "code":    "IST",
        "city":    "Istanbul",
        "country": "Turkey",
        "lat":     41.2617,
        "lon":     28.7436,
    }
    with open(IST_CSV, encoding="utf-8") as f:
        ist_rows = list(csv.DictReader(f))

    for terminal_name in ["Main Terminal", "GAP Terminal"]:
        rows = [r for r in ist_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Istanbul"}) for r in rows]
        upload(db, "istanbul", ist_meta, terminal_name, docs)

    # ── Bangkok ───────────────────────────────────────────────────────────
    print("Uploading Bangkok Suvarnabhumi …")
    bkk_meta = {
        "name":    "Suvarnabhumi Airport",
        "code":    "BKK",
        "city":    "Bangkok",
        "country": "Thailand",
        "lat":     13.6900,
        "lon":     100.7501,
    }
    with open(BKK_CSV, encoding="utf-8") as f:
        bkk_rows = list(csv.DictReader(f))

    for terminal_name in ["Main Terminal", "Satellite Terminal SAT-1"]:
        rows = [r for r in bkk_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Bangkok Suvarnabhumi"}) for r in rows]
        upload(db, "bangkok", bkk_meta, terminal_name, docs)

    print("\nDone.")


if __name__ == "__main__":
    main()
