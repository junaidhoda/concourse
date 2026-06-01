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
        # Use a deterministic ID so re-running the script overwrites rather than duplicates.
        doc_id = slug(f"{doc.get('name', '')}_{terminal_name}")
        rest_col.document(doc_id).set(doc)
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

    for terminal_name in ["Main Terminal", "Lounges"]:
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

    for terminal_name in ["Terminal 2", "Terminal 3", "Lounges"]:
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
        "Terminal 1, Area A", "Terminal 1, Area B",
        "Terminal 1, Area C", "Terminal 1, Area Z",
        "Terminal 2, Area D", "Terminal 2, Area E",
        "Terminal 3, Area H", "Terminal 3, Area J",
    ]:
        rows = [r for r in fra_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Frankfurt"}) for r in rows]
        upload(db, "fra", fra_meta, terminal_name, docs)

    print("\nDone.")


if __name__ == "__main__":
    main()
