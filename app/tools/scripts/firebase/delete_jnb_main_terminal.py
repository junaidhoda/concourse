#!/usr/bin/env python3
"""
Deletes only the old 'main_terminal' terminal (and its restaurants)
from the OR Tambo airport document in Firestore.

Run this AFTER upload_to_firestore.py has already uploaded
International Terminal and Domestic Terminal.
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = os.path.expanduser("~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json")


def delete_terminal(db, airport_id, terminal_id):
    airport_ref = db.collection("airports").document(airport_id)
    terminal_ref = airport_ref.collection("terminals").document(terminal_id)

    if not terminal_ref.get().exists:
        print(f"'{terminal_id}' not found in {airport_id} — nothing to delete.")
        return

    restaurants = terminal_ref.collection("restaurants").stream()
    deleted = 0
    for rest_doc in restaurants:
        terminal_ref.collection("restaurants").document(rest_doc.id).delete()
        print(f"  Deleted restaurant: {rest_doc.id}")
        deleted += 1

    terminal_ref.delete()
    print(f"Deleted terminal '{terminal_id}' ({deleted} restaurants removed).")


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # OR Tambo is stored under both 'jnb' and 'ortambo' — clean both
    for airport_id in ["jnb", "ortambo"]:
        print(f"\n--- {airport_id} ---")
        delete_terminal(db, airport_id, "main_terminal")

    print("\nDone. OR Tambo now only has International Terminal and Domestic Terminal.")


if __name__ == "__main__":
    main()
