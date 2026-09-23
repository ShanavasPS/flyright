"""Clock-relative, anonymous fixtures for a stopped, dedicated test app only.

Usage: python3 scripts/seed-live-trip-row.py <SQLite-directory> <scenario>
Scenarios: direct, connection, canada, homebound, stay, oneway, reminder, clear.
Refuses databases containing signed-in users' trips. Only its own rows are replaced.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import sqlite3
import sys

directory, scenario = Path(sys.argv[1]), sys.argv[2]
assert scenario in {"direct", "connection", "canada", "homebound", "stay", "oneway", "reminder", "clear"}
now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
day = timedelta(days=1)
hour = timedelta(hours=1)
prefix = "live-pointer-"
countries = {"HEL": "FI", "JFK": "US", "LGA": "US", "BOS": "US", "YYZ": "CA", "LHR": "GB"}

def flight(key, number, origin, destination, departure, duration):
    return (prefix + key, number, origin, destination, departure, departure + duration)

hero = None
if scenario in {"direct", "oneway", "reminder"}:
    departure = now + (18 if scenario == "reminder" else 1) * hour
    rows = [flight("out", "AY5", "HEL", "JFK", departure, 9 * hour)]
    if scenario != "oneway":
        rows += [flight("home", "AY8", "BOS", "HEL", departure + 22 * day, 8 * hour)]
    hero = rows[0]
elif scenario == "connection":
    rows = [flight("out", "AY1331", "HEL", "LHR", now + hour, 3 * hour),
            flight("next", "BA175", "LHR", "JFK", now + 6 * hour, 8 * hour),
            flight("home", "AY8", "BOS", "HEL", now + 22 * day, 8 * hour)]
    hero = rows[0]
elif scenario in {"canada", "homebound", "stay"}:
    home = now + hour if scenario == "homebound" else now + (5 if scenario == "stay" else 9) * day + hour
    rows = [flight("out", "AY5", "HEL", "JFK", home - 22 * day, 9 * hour),
            flight("canada-out", "AC701", "LGA", "YYZ", home - 13 * day, 2 * hour),
            flight("canada-back", "AC770", "YYZ", "BOS", home - 9 * day, 2 * hour),
            flight("home", "AY8", "BOS", "HEL", home, 8 * hour)]
    hero = None if scenario == "stay" else rows[-1] if scenario == "homebound" else rows[-2]
else:
    rows = []

with sqlite3.connect(directory / "flyright.db") as db:
    if db.execute("SELECT COUNT(*) FROM journeys WHERE user_id IS NOT NULL AND id NOT LIKE 'live-pointer-%'").fetchone()[0]:
        raise SystemExit("Refusing signed-in trip data. Use an anonymous dedicated test installation.")
    db.execute("DELETE FROM travel_day WHERE journey_id LIKE 'live-pointer-%'")
    db.execute("DELETE FROM journeys WHERE id LIKE 'live-pointer-%'")
    for ident, number, origin, destination, departure, arrival in rows:
        db.execute("""INSERT INTO journeys
            (id,user_id,mode,carrier,carrier_country,number,from_code,from_country,to_code,to_country,
             distance_km,scheduled_departure,scheduled_arrival,created_at,updated_at,source,private_trip)
            VALUES (?,NULL,'flight','Test airline','FI',?,?,?,?,?,1000,?,?,?,?,'manual',1)""",
            (ident, number, origin, countries[origin], destination, countries[destination],
             departure.isoformat(), arrival.isoformat(), now.isoformat(), now.isoformat()))
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
with sqlite3.connect(directory / "ExpoSQLiteStorage") as kv:
    kv.execute("DELETE FROM storage WHERE key LIKE 'travel-facts-live-pointer-%'")
    if hero:
        delayed = scenario == "canada"
        facts = {"delayMinutes": 45 if delayed else 0, "gate": "A12", "terminal": "2",
                 "checkInDesk": None, "baggageBelt": None, "boardingTime": None,
                 "estimatedDeparture": (hero[4] + (45 * timedelta(minutes=1) if delayed else timedelta())).isoformat(),
                 "estimatedArrival": (hero[5] + (45 * timedelta(minutes=1) if delayed else timedelta())).isoformat(),
                 "actualDeparture": None, "actualArrival": None, "position": None, "observedAt": now.isoformat()}
        kv.execute("INSERT OR REPLACE INTO storage (key,value) VALUES (?,?)", ("travel-facts-" + hero[0], json.dumps(facts)))
    kv.commit()
    kv.execute("PRAGMA wal_checkpoint(TRUNCATE)")
print(f"Seeded {scenario}: {len(rows)} anonymous flights; hero={hero[0] if hero else 'none'}")
