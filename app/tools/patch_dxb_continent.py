#!/usr/bin/env python3
"""Patch DXB airport continent to 'Middle East' in Firestore."""

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = "/Users/junaidhoda/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json"

cred = credentials.Certificate(SERVICE_ACCOUNT)
firebase_admin.initialize_app(cred)
db = firestore.client()

ref = db.collection("airports").document("DXB")
doc = ref.get()
if not doc.exists:
    ref = db.collection("airports").document("dxb")
    doc = ref.get()

if doc.exists:
    ref.update({"continent": "Middle East"})
    print(f"Updated {ref.id}: continent → 'Middle East'")
else:
    print("DXB document not found in Firestore (tried 'DXB' and 'dxb')")
