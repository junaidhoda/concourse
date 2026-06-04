#!/usr/bin/env python3
"""
Migrate restaurant documents from flat format to nested outlets format.

Before: airside, floor_level, opening_hours, open_24_7, takeaway,
        wheelchair_accessible, delivery, reservable, kids_menu at root level.

After:  outlets: [{ airside, level, open_24_7, opening_hours, takeaway,
                    wheelchair_accessible, delivery, reservable, kids_menu,
                    gate_area, location_notes }]
        Root-level outlet fields are deleted.
"""

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = "/Users/mustafakhan/Documents/Dev/concourse/airport-app-20516-firebase-adminsdk-fbsvc-5e55cc718c.json"

# Fields that belong in the outlet, not at restaurant root level
OUTLET_FIELDS = [
    'airside', 'floor_level', 'open_24_7', 'opening_hours',
    'takeaway', 'wheelchair_accessible', 'delivery', 'reservable', 'kids_menu',
]


def _safe_airside(value):
    v = (value or '').lower()
    return v if v in ('airside', 'landside', 'both') else 'airside'


def _bool_val(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == 'yes'
    return False


def migrate_restaurant(doc_ref, data):
    raw_outlets = data.get('outlets') or []

    if raw_outlets:
        # Has outlets already — fill in any missing outlet-level fields from root
        updated = []
        changed = False
        for o in raw_outlets:
            outlet = dict(o)
            def _fill(key, root_key=None, transform=None):
                nonlocal changed
                rk = root_key or key
                if key not in outlet or outlet[key] in ('', None):
                    raw = data.get(rk)
                    val = transform(raw) if transform else (raw or '')
                    outlet[key] = val
                    changed = True
            _fill('airside',               'airside',               _safe_airside)
            _fill('level',                 'floor_level')
            _fill('opening_hours',         'opening_hours')
            _fill('open_24_7',             'open_24_7',             lambda v: bool(v) if isinstance(v, bool) else False)
            _fill('takeaway',              'takeaway')
            _fill('wheelchair_accessible', 'wheelchair_accessible')
            _fill('delivery',              'delivery')
            _fill('reservable',            'reservable')
            _fill('kids_menu',             'kids_menu')
            if 'gate_area'      not in outlet: outlet['gate_area']      = ''; changed = True
            if 'location_notes' not in outlet: outlet['location_notes'] = ''; changed = True
            updated.append(outlet)

        if changed:
            update = {'outlets': updated}
            for field in OUTLET_FIELDS:
                if field in data:
                    update[field] = firestore.DELETE_FIELD
            doc_ref.update(update)
            return True

    else:
        # No outlets — build one from root-level fields
        outlet = {
            'gate_area':             '',
            'airside':               _safe_airside(data.get('airside')),
            'level':                 data.get('floor_level') or '',
            'location_notes':        '',
            'open_24_7':             bool(data.get('open_24_7')) if isinstance(data.get('open_24_7'), bool) else False,
            'opening_hours':         data.get('opening_hours') or '',
            'takeaway':              data.get('takeaway') or '',
            'wheelchair_accessible': data.get('wheelchair_accessible') or '',
            'delivery':              data.get('delivery') or '',
            'reservable':            data.get('reservable') or '',
            'kids_menu':             data.get('kids_menu') or '',
        }

        update = {'outlets': [outlet]}
        for field in OUTLET_FIELDS:
            if field in data:
                update[field] = firestore.DELETE_FIELD

        doc_ref.update(update)
        return True

    return False


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    airports = db.collection('airports').get()
    total = 0

    for airport_doc in airports:
        aid = airport_doc.id
        terminals = db.collection('airports').document(aid).collection('terminals').get()
        for t_doc in terminals:
            tid = t_doc.id
            restaurants = (
                db.collection('airports').document(aid)
                  .collection('terminals').document(tid)
                  .collection('restaurants').get()
            )
            migrated = 0
            for r_doc in restaurants:
                if migrate_restaurant(r_doc.reference, r_doc.to_dict()):
                    migrated += 1
                    total += 1
            if migrated:
                print(f"  {aid}/{tid}: migrated {migrated}")

    print(f"\nDone. {total} restaurants migrated.")


if __name__ == '__main__':
    main()
