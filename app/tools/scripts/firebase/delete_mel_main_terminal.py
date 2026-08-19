#!/usr/bin/env python3
"""
Deletes only the old 'main_terminal' terminal (and its restaurants)
from the Melbourne airport document in Firestore.

Run this AFTER upload_to_firestore.py has already uploaded T1/T2/T3/T4.
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = os.path.expanduser("~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json")


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    airport_ref = db.collection("airports").document("melbourne")
    terminal_ref = airport_ref.collection("terminals").document("main_terminal")

    # Check it exists
    if not terminal_ref.get().exists:
        print("main_terminal not found in Melbourne — nothing to delete.")
        return

    # Delete all restaurants inside main_terminal
    restaurants = terminal_ref.collection("restaurants").stream()
    deleted = 0
    for rest_doc in restaurants:
        terminal_ref.collection("restaurants").document(rest_doc.id).delete()
        print(f"  Deleted restaurant: {rest_doc.id}")
        deleted += 1

    # Delete the terminal doc itself
    terminal_ref.delete()
    print(f"\nDeleted main_terminal ({deleted} restaurants removed).")
    print("Melbourne now only has T1, T2, T3, T4.")


if __name__ == "__main__":
    main()
