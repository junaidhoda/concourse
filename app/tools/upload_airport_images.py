#!/usr/bin/env python3
"""
Upload local airport images to Firebase Storage and update Firestore
airport documents with the resulting download URLs.

Usage:
  python3 upload_airport_images.py

Expected files in ./airport_images/:
  fra.jpg      Frankfurt
  cdg.jpg      Paris CDG
  man.jpg      Manchester
  bhx.jpg      Birmingham
  london.jpg   London (used for both LHR / LGW)
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore, storage

SERVICE_ACCOUNT = "/Users/junaidhoda/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json"
STORAGE_BUCKET   = "airport-app-20516.firebasestorage.app"
IMAGES_DIR       = "airport_images"

# Maps local filename → list of Firestore airport doc IDs that use it
IMAGE_MAP = {
    "fra.jpg":    ["fra"],
    "cdg.jpg":    ["cdg"],
    "man.jpg":    ["manchester"],
    "bhx.jpg":    ["birmingham"],
    "london.jpg": ["heathrow", "gatwick"],
}


def upload_and_update():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred, {"storageBucket": STORAGE_BUCKET})
    db     = firestore.client()
    bucket = storage.bucket()

    for filename, airport_ids in IMAGE_MAP.items():
        local_path = os.path.join(IMAGES_DIR, filename)
        if not os.path.exists(local_path):
            print(f"  SKIP  {filename}  (file not found)")
            continue

        # Upload to Firebase Storage
        blob_name = f"airport_images/{filename}"
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path, content_type="image/jpeg")

        # Make it publicly readable and get a permanent URL
        blob.make_public()
        url = blob.public_url
        print(f"  ✓  {filename}  →  {url}")

        # Update every airport doc that uses this image
        for airport_id in airport_ids:
            db.collection("airports").document(airport_id).set(
                {"image_url": url}, merge=True
            )
            print(f"       updated airports/{airport_id}")

    print("\nDone.")


if __name__ == "__main__":
    upload_and_update()
