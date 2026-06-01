#!/usr/bin/env python3
"""
Delete all restaurant documents from every terminal in every airport,
then re-upload clean data using upload_to_firestore.py.

Run once to fix the duplicates:
  python clear_restaurants.py
"""

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = "/Users/junaidhoda/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json"

AIRPORT_IDS = ["gatwick", "heathrow", "birmingham", "manchester", "cdg", "fra"]


def delete_collection(col_ref, batch_size=400):
    docs = col_ref.limit(batch_size).stream()
    deleted = 0
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    if deleted >= batch_size:
        delete_collection(col_ref, batch_size)


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    for airport_id in AIRPORT_IDS:
        print(f"Clearing {airport_id}…")
        terminals = db.collection("airports").document(airport_id).collection("terminals").stream()
        for terminal in terminals:
            rest_col = terminal.reference.collection("restaurants")
            delete_collection(rest_col)
            print(f"  Cleared {terminal.id}")

    print("\nDone — now run upload_to_firestore.py to re-upload clean data.")


if __name__ == "__main__":
    main()
