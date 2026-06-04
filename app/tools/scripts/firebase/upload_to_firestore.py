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

import os as _os
_SCRIPT_DIR     = _os.path.dirname(_os.path.abspath(__file__))
_TOOLS_DIR      = _os.path.join(_SCRIPT_DIR, '..', '..')
RESTAURANTS_DIR = _os.path.join(_TOOLS_DIR, 'data', 'restaurants')
JSONS_DIR       = _os.path.join(_TOOLS_DIR, 'data', 'restaurants', 'jsons')
HELPER_DIR      = _os.path.join(_TOOLS_DIR, 'data', 'helper_data')
IMAGES_DIR      = _os.path.join(_TOOLS_DIR, 'airport_images')


SERVICE_ACCOUNT = "/Users/mustafakhan/Documents/Dev/concourse/airport-app-20516-firebase-adminsdk-fbsvc-5e55cc718c.json"

GATWICK_CSV  = _os.path.join(RESTAURANTS_DIR, "gatwick_restaurants.csv")
HEATHROW_CSV = _os.path.join(RESTAURANTS_DIR, "heathrow_restaurants.csv")
BHX_CSV      = _os.path.join(RESTAURANTS_DIR, "bhx_restaurants.csv")
MAN_CSV      = _os.path.join(RESTAURANTS_DIR, "man_restaurants.csv")
CDG_CSV      = _os.path.join(RESTAURANTS_DIR, "cdg_restaurants.csv")
FRA_CSV      = _os.path.join(RESTAURANTS_DIR, "fra_restaurants.csv")
HND_CSV      = _os.path.join(RESTAURANTS_DIR, "hnd_restaurants.csv")
AUH_CSV      = _os.path.join(RESTAURANTS_DIR, "auh_restaurants.csv")
DOH_CSV      = _os.path.join(RESTAURANTS_DIR, "doh_restaurants.csv")
IST_CSV      = _os.path.join(RESTAURANTS_DIR, "ist_restaurants.csv")
JFK_CSV      = _os.path.join(RESTAURANTS_DIR, "jfk_restaurants.csv")
SIN_CSV      = _os.path.join(RESTAURANTS_DIR, "sin_restaurants.csv")
LAX_CSV      = _os.path.join(RESTAURANTS_DIR, "lax_restaurants.csv")
BKK_CSV      = _os.path.join(RESTAURANTS_DIR, "bkk_restaurants.csv")
DXB_CSV      = _os.path.join(RESTAURANTS_DIR, "dxb_restaurants.csv")
LGW_CSV      = _os.path.join(RESTAURANTS_DIR, "lgw_restaurants.csv")
PKX_CSV      = _os.path.join(RESTAURANTS_DIR, "pkx_restaurants.csv")
CAN_CSV      = _os.path.join(RESTAURANTS_DIR, "can_restaurants.csv")
HKG_CSV      = _os.path.join(RESTAURANTS_DIR, "hkg_restaurants.csv")
TPE_CSV      = _os.path.join(RESTAURANTS_DIR, "tpe_restaurants.csv")
ICN_CSV      = _os.path.join(RESTAURANTS_DIR, "icn_restaurants.csv")
NRT_CSV      = _os.path.join(RESTAURANTS_DIR, "nrt_restaurants.csv")
GIG_CSV      = _os.path.join(RESTAURANTS_DIR, "gig_restaurants.csv")
LIM_CSV      = _os.path.join(RESTAURANTS_DIR, "lim_restaurants.csv")
LOS_CSV      = _os.path.join(RESTAURANTS_DIR, "los_restaurants.csv")
JNB_CSV      = _os.path.join(RESTAURANTS_DIR, "jnb_restaurants.csv")
WLG_CSV      = _os.path.join(RESTAURANTS_DIR, "wlg_restaurants.csv")
SYD_CSV      = _os.path.join(RESTAURANTS_DIR, "syd_restaurants.csv")
MEL_CSV      = _os.path.join(RESTAURANTS_DIR, "mel_restaurants.csv")
KIX_CSV      = _os.path.join(RESTAURANTS_DIR, "kix_restaurants.csv")
KUL_CSV      = _os.path.join(RESTAURANTS_DIR, "kul_restaurants.csv")
MNL_CSV      = _os.path.join(RESTAURANTS_DIR, "mnl_restaurants.csv")
DEL_CSV      = _os.path.join(RESTAURANTS_DIR, "del_restaurants.csv")
BOM_CSV      = _os.path.join(RESTAURANTS_DIR, "bom_restaurants.csv")
CMB_CSV      = _os.path.join(RESTAURANTS_DIR, "cmb_restaurants.csv")
HAN_CSV      = _os.path.join(RESTAURANTS_DIR, "han_restaurants.csv")

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
        "halal":           row.get("halal", "").strip(),
        "vegetarian_options": row.get("vegetarian_options", "").strip(),
        "vegan_options":   row.get("vegan_options", "").strip(),
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
        "name":      "London Gatwick Airport",
        "code":      "LGW",
        "city":      "London",
        "country":   "UK",
        "continent": "Europe",
        "lat":       51.1537,
        "lon":       -0.1821,
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
        "name":      "London Heathrow Airport",
        "code":      "LHR",
        "city":      "London",
        "country":   "UK",
        "continent": "Europe",
        "lat":       51.4700,
        "lon":       -0.4543,
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
        "name":      "Birmingham Airport",
        "code":      "BHX",
        "city":      "Birmingham",
        "country":   "UK",
        "continent": "Europe",
        "lat":       52.4538,
        "lon":       -1.7480,
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
        "name":      "Manchester Airport",
        "code":      "MAN",
        "city":      "Manchester",
        "country":   "UK",
        "continent": "Europe",
        "lat":       53.3537,
        "lon":       -2.2750,
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
        "name":      "Paris Charles de Gaulle Airport",
        "code":      "CDG",
        "city":      "Paris",
        "country":   "France",
        "continent": "Europe",
        "lat":       49.0097,
        "lon":       2.5477,
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
        "name":      "Frankfurt Airport",
        "code":      "FRA",
        "city":      "Frankfurt",
        "country":   "Germany",
        "continent": "Europe",
        "lat":       50.0379,
        "lon":       8.5622,
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

    # ── Istanbul ──────────────────────────────────────────────────────────────
    print("Uploading Istanbul …")
    ist_meta = {
        "name":      "Istanbul Airport",
        "code":      "IST",
        "city":      "Istanbul",
        "country":   "Turkey",
        "continent": "Europe",
        "lat":       41.2619,
        "lon":       28.7419,
    }
    with open(IST_CSV, encoding="utf-8") as f:
        ist_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in ist_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Istanbul"}) for r in rows]
        upload(db, "istanbul", ist_meta, terminal_name, docs)

    # ── JFK ───────────────────────────────────────────────────────────────────
    print("Uploading JFK …")
    jfk_meta = {
        "name":      "John F. Kennedy International Airport",
        "code":      "JFK",
        "city":      "New York",
        "country":   "USA",
        "continent": "North America",
        "lat":       40.6413,
        "lon":       -73.7781,
    }
    with open(JFK_CSV, encoding="utf-8") as f:
        jfk_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 4", "Terminal 5", "Terminal 7", "Terminal 8"]:
        rows = [r for r in jfk_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "JFK"}) for r in rows]
        upload(db, "jfk", jfk_meta, terminal_name, docs)

    # ── Singapore Changi ──────────────────────────────────────────────────────
    print("Uploading Singapore Changi …")
    sin_meta = {
        "name":      "Singapore Changi Airport",
        "code":      "SIN",
        "city":      "Singapore",
        "country":   "Singapore",
        "continent": "Asia",
        "lat":       1.3644,
        "lon":       103.9915,
    }
    with open(SIN_CSV, encoding="utf-8") as f:
        sin_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3", "Terminal 4", "Jewel Changi Airport"]:
        rows = [r for r in sin_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Singapore Changi"}) for r in rows]
        upload(db, "changi", sin_meta, terminal_name, docs)

    # ── LAX ───────────────────────────────────────────────────────────────────
    print("Uploading LAX …")
    lax_meta = {
        "name":      "Los Angeles International Airport",
        "code":      "LAX",
        "city":      "Los Angeles",
        "country":   "USA",
        "continent": "North America",
        "lat":       33.9425,
        "lon":       -118.4081,
    }
    with open(LAX_CSV, encoding="utf-8") as f:
        lax_rows = list(csv.DictReader(f))
    for terminal_name in [
        "Terminal 1", "Terminal 2", "Terminal 3", "Terminal 4",
        "Terminal 6", "Terminal 7", "Terminal 8",
        "Tom Bradley International Terminal",
    ]:
        rows = [r for r in lax_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "LAX"}) for r in rows]
        upload(db, "lax", lax_meta, terminal_name, docs)

    # ── Bangkok Suvarnabhumi ──────────────────────────────────────────────────
    print("Uploading Bangkok Suvarnabhumi …")
    bkk_meta = {
        "name":      "Suvarnabhumi Airport",
        "code":      "BKK",
        "city":      "Bangkok",
        "country":   "Thailand",
        "continent": "Asia",
        "lat":       13.6900,
        "lon":       100.7501,
    }
    with open(BKK_CSV, encoding="utf-8") as f:
        bkk_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in bkk_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Bangkok Suvarnabhumi"}) for r in rows]
        upload(db, "suvarnabhumi", bkk_meta, terminal_name, docs)

    # ── Dubai ─────────────────────────────────────────────────────────────────
    print("Uploading Dubai …")
    dxb_meta = {
        "name":      "Dubai International Airport",
        "code":      "DXB",
        "city":      "Dubai",
        "country":   "UAE",
        "continent": "Asia",
        "lat":       25.2532,
        "lon":       55.3657,
    }
    with open(DXB_CSV, encoding="utf-8") as f:
        dxb_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3"]:
        rows = [r for r in dxb_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Dubai"}) for r in rows]
        upload(db, "dubai", dxb_meta, terminal_name, docs)

    # ── London Gatwick (lgw) ──────────────────────────────────────────────────
    print("Uploading London Gatwick (lgw) …")
    lgw_meta = {
        "name":      "London Gatwick Airport",
        "code":      "LGW",
        "city":      "London",
        "country":   "UK",
        "continent": "Europe",
        "lat":       51.1537,
        "lon":       -0.1821,
    }
    with open(LGW_CSV, encoding="utf-8") as f:
        lgw_rows = list(csv.DictReader(f))
    for terminal_name in ["North Terminal", "South Terminal"]:
        rows = [r for r in lgw_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Gatwick"}) for r in rows]
        upload(db, "lgw", lgw_meta, terminal_name, docs)

    # ── Beijing Daxing ────────────────────────────────────────────────────────
    print("Uploading Beijing Daxing …")
    pkx_meta = {
        "name":      "Beijing Daxing International Airport",
        "code":      "PKX",
        "city":      "Beijing",
        "country":   "China",
        "continent": "Asia",
        "lat":       39.5099,
        "lon":       116.4109,
    }
    with open(PKX_CSV, encoding="utf-8") as f:
        pkx_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in pkx_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Beijing Daxing"}) for r in rows]
        upload(db, "daxing", pkx_meta, terminal_name, docs)

    # ── Guangzhou Baiyun ─────────────────────────────────────────────────────
    print("Uploading Guangzhou Baiyun …")
    can_meta = {
        "name":      "Guangzhou Baiyun International Airport",
        "code":      "CAN",
        "city":      "Guangzhou",
        "country":   "China",
        "continent": "Asia",
        "lat":       23.3924,
        "lon":       113.2988,
    }
    with open(CAN_CSV, encoding="utf-8") as f:
        can_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2"]:
        rows = [r for r in can_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Guangzhou Baiyun"}) for r in rows]
        upload(db, "baiyun", can_meta, terminal_name, docs)

    # ── Hong Kong ─────────────────────────────────────────────────────────────
    print("Uploading Hong Kong …")
    hkg_meta = {
        "name":      "Hong Kong International Airport",
        "code":      "HKG",
        "city":      "Hong Kong",
        "country":   "China",
        "continent": "Asia",
        "lat":       22.3080,
        "lon":       113.9185,
    }
    with open(HKG_CSV, encoding="utf-8") as f:
        hkg_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Midfield Concourse"]:
        rows = [r for r in hkg_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Hong Kong"}) for r in rows]
        upload(db, "hkg", hkg_meta, terminal_name, docs)

    # ── Taipei Taoyuan ────────────────────────────────────────────────────────
    print("Uploading Taipei Taoyuan …")
    tpe_meta = {
        "name":      "Taiwan Taoyuan International Airport",
        "code":      "TPE",
        "city":      "Taipei",
        "country":   "Taiwan",
        "continent": "Asia",
        "lat":       25.0777,
        "lon":       121.2326,
    }
    with open(TPE_CSV, encoding="utf-8") as f:
        tpe_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2"]:
        rows = [r for r in tpe_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Taipei Taoyuan"}) for r in rows]
        upload(db, "taoyuan", tpe_meta, terminal_name, docs)

    # ── Incheon ───────────────────────────────────────────────────────────────
    print("Uploading Incheon …")
    icn_meta = {
        "name":      "Incheon International Airport",
        "code":      "ICN",
        "city":      "Seoul",
        "country":   "South Korea",
        "continent": "Asia",
        "lat":       37.4491,
        "lon":       126.4509,
    }
    with open(ICN_CSV, encoding="utf-8") as f:
        icn_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Concourse"]:
        rows = [r for r in icn_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Incheon"}) for r in rows]
        upload(db, "incheon", icn_meta, terminal_name, docs)

    # ── Narita ────────────────────────────────────────────────────────────────
    print("Uploading Narita …")
    nrt_meta = {
        "name":      "Narita International Airport",
        "code":      "NRT",
        "city":      "Tokyo",
        "country":   "Japan",
        "continent": "Asia",
        "lat":       35.7720,
        "lon":       140.3929,
    }
    with open(NRT_CSV, encoding="utf-8") as f:
        nrt_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3"]:
        rows = [r for r in nrt_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Narita"}) for r in rows]
        upload(db, "narita", nrt_meta, terminal_name, docs)

    # ── Rio Galeão ────────────────────────────────────────────────────────────
    print("Uploading Rio Galeão …")
    gig_meta = {
        "name":      "Rio de Janeiro–Galeão International Airport",
        "code":      "GIG",
        "city":      "Rio de Janeiro",
        "country":   "Brazil",
        "continent": "South America",
        "lat":       -22.8099,
        "lon":       -43.2505,
    }
    with open(GIG_CSV, encoding="utf-8") as f:
        gig_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal", "Terminal 2"]:
        rows = [r for r in gig_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Rio Galeão"}) for r in rows]
        upload(db, "galeao", gig_meta, terminal_name, docs)

    # ── Lima ──────────────────────────────────────────────────────────────────
    print("Uploading Lima …")
    lim_meta = {
        "name":      "Jorge Chávez International Airport",
        "code":      "LIM",
        "city":      "Lima",
        "country":   "Peru",
        "continent": "South America",
        "lat":       -12.0219,
        "lon":       -77.1143,
    }
    with open(LIM_CSV, encoding="utf-8") as f:
        lim_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in lim_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Lima"}) for r in rows]
        upload(db, "lima", lim_meta, terminal_name, docs)

    # ── Lagos ─────────────────────────────────────────────────────────────────
    print("Uploading Lagos …")
    los_meta = {
        "name":      "Murtala Muhammed International Airport",
        "code":      "LOS",
        "city":      "Lagos",
        "country":   "Nigeria",
        "continent": "Africa",
        "lat":       6.5774,
        "lon":       3.3212,
    }
    with open(LOS_CSV, encoding="utf-8") as f:
        los_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in los_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Lagos"}) for r in rows]
        upload(db, "lagos", los_meta, terminal_name, docs)

    # ── Johannesburg OR Tambo ─────────────────────────────────────────────────
    print("Uploading Johannesburg OR Tambo …")
    jnb_meta = {
        "name":      "O.R. Tambo International Airport",
        "code":      "JNB",
        "city":      "Johannesburg",
        "country":   "South Africa",
        "continent": "Africa",
        "lat":       -26.1392,
        "lon":       28.2460,
    }
    with open(JNB_CSV, encoding="utf-8") as f:
        jnb_rows = list(csv.DictReader(f))
    for terminal_name in ["International Terminal", "Domestic Terminal", "Main Terminal"]:
        rows = [r for r in jnb_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "OR Tambo"}) for r in rows]
        upload(db, "ortambo", jnb_meta, terminal_name, docs)

    # ── Wellington ────────────────────────────────────────────────────────────
    print("Uploading Wellington …")
    wlg_meta = {
        "name":      "Wellington International Airport",
        "code":      "WLG",
        "city":      "Wellington",
        "country":   "New Zealand",
        "continent": "Oceania",
        "lat":       -41.3272,
        "lon":       174.8050,
    }
    with open(WLG_CSV, encoding="utf-8") as f:
        wlg_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal", "International Departures"]:
        rows = [r for r in wlg_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Wellington"}) for r in rows]
        upload(db, "wellington", wlg_meta, terminal_name, docs)

    # ── Sydney ────────────────────────────────────────────────────────────────
    print("Uploading Sydney …")
    syd_meta = {
        "name":      "Sydney Kingsford Smith Airport",
        "code":      "SYD",
        "city":      "Sydney",
        "country":   "Australia",
        "continent": "Oceania",
        "lat":       -33.9399,
        "lon":       151.1753,
    }
    with open(SYD_CSV, encoding="utf-8") as f:
        syd_rows = list(csv.DictReader(f))
    for terminal_name in ["T1 International", "T2 Domestic", "T3 Domestic"]:
        rows = [r for r in syd_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Sydney"}) for r in rows]
        upload(db, "sydney", syd_meta, terminal_name, docs)

    # ── Melbourne ─────────────────────────────────────────────────────────────
    print("Uploading Melbourne …")
    mel_meta = {
        "name":      "Melbourne Airport",
        "code":      "MEL",
        "city":      "Melbourne",
        "country":   "Australia",
        "continent": "Oceania",
        "lat":       -37.6690,
        "lon":       144.8410,
    }
    with open(MEL_CSV, encoding="utf-8") as f:
        mel_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in mel_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Melbourne"}) for r in rows]
        upload(db, "melbourne", mel_meta, terminal_name, docs)

    # ── Kansai ────────────────────────────────────────────────────────────────
    print("Uploading Kansai …")
    kix_meta = {
        "name":      "Kansai International Airport",
        "code":      "KIX",
        "city":      "Osaka",
        "country":   "Japan",
        "continent": "Asia",
        "lat":       34.4275,
        "lon":       135.2440,
    }
    with open(KIX_CSV, encoding="utf-8") as f:
        kix_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Aeroplaza"]:
        rows = [r for r in kix_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Kansai"}) for r in rows]
        upload(db, "kansai", kix_meta, terminal_name, docs)

    # ── Kuala Lumpur ──────────────────────────────────────────────────────────
    print("Uploading Kuala Lumpur …")
    kul_meta = {
        "name":      "Kuala Lumpur International Airport",
        "code":      "KUL",
        "city":      "Kuala Lumpur",
        "country":   "Malaysia",
        "continent": "Asia",
        "lat":       2.7456,
        "lon":       101.7072,
    }
    with open(KUL_CSV, encoding="utf-8") as f:
        kul_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal Building", "Satellite Building", "Contact Pier International", "Contact Pier Domestic"]:
        rows = [r for r in kul_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Kuala Lumpur"}) for r in rows]
        upload(db, "klia", kul_meta, terminal_name, docs)

    # ── Manila NAIA ───────────────────────────────────────────────────────────
    print("Uploading Manila NAIA …")
    mnl_meta = {
        "name":      "Ninoy Aquino International Airport",
        "code":      "MNL",
        "city":      "Manila",
        "country":   "Philippines",
        "continent": "Asia",
        "lat":       14.5086,
        "lon":       121.0194,
    }
    with open(MNL_CSV, encoding="utf-8") as f:
        mnl_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3"]:
        rows = [r for r in mnl_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Manila NAIA"}) for r in rows]
        upload(db, "naia", mnl_meta, terminal_name, docs)

    # ── Delhi ─────────────────────────────────────────────────────────────────
    print("Uploading Delhi …")
    del_meta = {
        "name":      "Indira Gandhi International Airport",
        "code":      "DEL",
        "city":      "New Delhi",
        "country":   "India",
        "continent": "Asia",
        "lat":       28.5665,
        "lon":       77.1031,
    }
    with open(DEL_CSV, encoding="utf-8") as f:
        del_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2", "Terminal 3", "Main Terminal"]:
        rows = [r for r in del_rows if r["terminal"] == terminal_name]
        if rows:
            docs = [clean(r, {"airport": "Delhi"}) for r in rows]
            upload(db, "delhi", del_meta, terminal_name, docs)

    # ── Mumbai ────────────────────────────────────────────────────────────────
    print("Uploading Mumbai …")
    bom_meta = {
        "name":      "Chhatrapati Shivaji Maharaj International Airport",
        "code":      "BOM",
        "city":      "Mumbai",
        "country":   "India",
        "continent": "Asia",
        "lat":       19.0896,
        "lon":       72.8656,
    }
    with open(BOM_CSV, encoding="utf-8") as f:
        bom_rows = list(csv.DictReader(f))
    for terminal_name in ["Terminal 1", "Terminal 2"]:
        rows = [r for r in bom_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Mumbai"}) for r in rows]
        upload(db, "mumbai", bom_meta, terminal_name, docs)

    # ── Colombo ───────────────────────────────────────────────────────────────
    print("Uploading Colombo …")
    cmb_meta = {
        "name":      "Bandaranaike International Airport",
        "code":      "CMB",
        "city":      "Colombo",
        "country":   "Sri Lanka",
        "continent": "Asia",
        "lat":       7.1803,
        "lon":       79.8842,
    }
    with open(CMB_CSV, encoding="utf-8") as f:
        cmb_rows = list(csv.DictReader(f))
    for terminal_name in ["Main Terminal"]:
        rows = [r for r in cmb_rows if r["terminal"] == terminal_name]
        docs = [clean(r, {"airport": "Colombo"}) for r in rows]
        upload(db, "colombo", cmb_meta, terminal_name, docs)

    # ── Hanoi Noi Bai ─────────────────────────────────────────────────────────
    # han_restaurants.csv is empty (no listings on airport website)

    print("\nDone.")


if __name__ == "__main__":
    main()
