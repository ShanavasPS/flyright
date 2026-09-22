"""Local SQLite fixtures for dedicated trip-grouping UI test installations.

Usage: python3 scripts/seed-trip-grouping-test.py <sqlite-file> simple|multi|connections|clear
Stop the test app before copying/seeding its DB; relaunch to read the fixture.
Only grouping-* rows are replaced. Do not point this at a personal installation.
"""
import sqlite3
import sys

db_path, layout = sys.argv[1:]
if layout not in {"simple", "multi", "connections", "clear"}:
    raise SystemExit("Expected simple, multi, connections or clear")
rows = [
    ("out", "AY5", "HEL", "FI", "JFK", "US", "2027-06-01T14:00", "2027-06-01T15:55"),
    ("home", "AY8", "BOS", "US", "HEL", "FI", "2027-06-23T18:00", "2027-06-24T08:00"),
]
if layout == "simple":
    rows += [
        ("portugal", "AY1739", "HEL", "FI", "LIS", "PT", "2027-08-01T12:00", "2027-08-01T15:00"),
    ]
elif layout == "multi":
    rows += [
        ("canada-out", "AC701", "LGA", "US", "YYZ", "CA", "2027-06-10T10:00", "2027-06-10T11:40"),
        ("canada-back", "AC770", "YYZ", "CA", "BOS", "US", "2027-06-14T14:00", "2027-06-14T15:40"),
    ]
elif layout == "connections":
    rows = [
        ("out", "AY1331", "HEL", "FI", "LHR", "GB", "2027-06-01T09:00", "2027-06-01T10:10"),
        ("out-final", "BA175", "LHR", "GB", "JFK", "US", "2027-06-01T12:10", "2027-06-01T15:00"),
        ("home-first", "BA178", "JFK", "US", "LHR", "GB", "2027-06-23T18:30", "2027-06-24T06:30"),
        ("home", "AY8", "LHR", "GB", "HEL", "FI", "2027-06-24T08:30", "2027-06-24T13:20"),
    ]
elif layout == "clear":
    rows = []
with sqlite3.connect(db_path) as db:
    db.execute("DELETE FROM journeys WHERE id LIKE 'grouping-%'")
    for ident, number, origin, origin_country, destination, country, departure, arrival in rows:
        db.execute("""INSERT INTO journeys
            (id, user_id, mode, carrier, carrier_country, number, from_code, from_country,
             to_code, to_country, distance_km, scheduled_departure, scheduled_arrival,
             created_at, updated_at, source, private_trip)
            VALUES (?,NULL,'flight','Test airline','FI',?,?,?,?,?,1000,?,?,?,?,'manual',1)""",
            ("grouping-" + ident, number, origin, origin_country, destination, country,
             departure, arrival, "2026-09-22T00:00:00Z", "2026-09-22T00:00:00Z"))
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
print(f"Seeded {len(rows)} grouping fixtures ({layout})")
