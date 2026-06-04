#!/usr/bin/env python3
"""
Delete specific airport documents from Firestore.
Recursively deletes: airports/{id}/terminals/{id}/restaurants/{id}

Does NOT touch: gatwick, heathrow, birmingham, manchester, cdg, fra, haneda, auh, doh
"""

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = "/Users/mustafakhan/Documents/Dev/concourse/airport-app-20516-firebase-adminsdk-fbsvc-5e55cc718c.json"

# Firestore document IDs to delete (mapped from CSV names)
DELETE = {
    "istanbul",       # IST
    "jfk",            # JFK
    "changi",         # SIN
    "lax",            # LAX
    "suvarnabhumi",   # BKK
    "dubai",          # DXB
    "lgw",            # LGW
    "daxing",         # PKX
    "baiyun",         # CAN
    "hkg",            # HKG
    "taoyuan",        # TPE
    "incheon",        # ICN
    "narita",         # NRT
    "galeao",         # GIG
    "lima",           # LIM
    "lagos",          # LOS
    "ortambo",        # JNB
    "wellington",     # WLG
    "sydney",         # SYD
    "melbourne",      # MEL
    "kansai",         # KIX
    "klia",           # KUL
    "naia",           # MNL
    "delhi",          # DEL
    "mumbai",         # BOM
    "colombo",        # CMB
}


def delete_airport(db, airport_id: str):
    airport_ref = db.collection("airports").document(airport_id)

    # Delete all restaurants inside every terminal
    terminals = airport_ref.collection("terminals").stream()
    for terminal_doc in terminals:
        terminal_ref = airport_ref.collection("terminals").document(terminal_doc.id)
        restaurants = terminal_ref.collection("restaurants").stream()
        for rest_doc in restaurants:
            terminal_ref.collection("restaurants").document(rest_doc.id).delete()
        terminal_ref.delete()
        print(f"    Deleted terminal: {terminal_doc.id}")

    airport_ref.delete()
    print(f"  Deleted airport:  {airport_id}")


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # Only delete the explicitly listed IDs that actually exist in Firestore
    all_airport_ids = {doc.id for doc in db.collection("airports").stream()}
    to_delete = sorted(DELETE & all_airport_ids)
    not_found = sorted(DELETE - all_airport_ids)

    if not_found:
        print(f"Note: {len(not_found)} ID(s) not found in Firestore (already gone or never uploaded): {not_found}\n")

    if not to_delete:
        print("Nothing to delete.")
        return

    print(f"Will delete {len(to_delete)} airport(s): {to_delete}\n")
    confirm = input("Type 'yes' to confirm: ").strip().lower()
    if confirm != "yes":
        print("Aborted.")
        return

    for airport_id in to_delete:
        delete_airport(db, airport_id)

    print("\nDone. Safe to re-run upload_to_firestore.py now.")


if __name__ == "__main__":
    main()
