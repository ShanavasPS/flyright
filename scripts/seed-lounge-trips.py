"""Clock-relative lounge fixtures (docs/lounges.md) for a stopped test app.

Usage: python3 scripts/seed-lounge-trips.py <SQLite-directory> <scenario>
Scenarios:
  likely    AY5 HEL→JFK in 10 days, Finnair Plus Platinum saved, no boarding pass
  included  the same with a boarding pass carrying the Finnair Plus number
  none      the trip without any seeded membership
  travel    AY5 leaving in 2 h 30 min with the pass (the travel-day card, step 3);
            a new trip id each run, printed, since "Not today" is kept per trip
  unsaved   as travel, but no Finnair Plus saved: the pass offers to add it (step 5)
  pass      QR3 DOH→LHR leaving in 2 h 30 min, economy, with a Priority Pass
            (10 free visits, 4 used): Al Maha shows as a pass visit (step 4)
  clear     marks the fixtures deleted
Only rows whose ids start with "lounge-test-" are written; they are anonymous
and private. A signed-in app adopts anonymous trips and syncs them to that
account, so `clear` marks them deleted (the tombstone syncs) instead of
removing them, which would let the server copy come back. Memberships an account already has on the device
still count, so use a test installation for the exact wording. The airport
directory must be seeded on the deployment the app uses
(node scripts/lounges/seed.mjs HEL).
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
from zoneinfo import ZoneInfo

directory, scenario = Path(sys.argv[1]), sys.argv[2]
assert scenario in {"likely", "included", "none", "travel", "unsaved", "pass", "clear"}
now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
prefix = "lounge-test-"
journey = prefix + (f"{scenario}-{now:%H%M}" if scenario in {"travel", "unsaved", "pass"} else "out")
number = "600123454821"

# Days before: 15:40 Helsinki time in ten days, when every HEL lounge is
# open. Travel day: whatever the clock says, so a lounge may be closed.
helsinki = ZoneInfo("Europe/Helsinki")
departure = (
    now + timedelta(hours=2, minutes=30)
    if scenario in {"travel", "unsaved", "pass"}
    else (now + timedelta(days=10)).astimezone(helsinki).replace(hour=15, minute=40)
)
arrival = departure + timedelta(hours=9)


def boarding_pass() -> str:
    """IATA Resolution 792's example layout for AY5 HEL→JFK in business,
    with Finnair Plus in the frequent flyer fields and fast track."""
    day = departure.timetuple().tm_yday
    repeated = f"0141234567890 1AY AY {number.ljust(16)} 20KY"
    # Version 6, then the unique items' hex size (0x18 = 24) and the items.
    unique = "6180WW6225BAC 0014123456003"
    field = f">{unique}{len(repeated):02X}{repeated}"
    return f"M1TRAVELLER/TEST      EABC123 HELJFKAY 0005 {day:03d}J002A0025 1{len(field):02X}{field}"


with sqlite3.connect(directory / "flyright.db") as db:
    stamp = now.isoformat()
    db.execute(f"UPDATE journeys SET deleted_at = ?, updated_at = ? WHERE id LIKE '{prefix}%'", (stamp, stamp))
    db.execute(f"UPDATE memberships SET deleted_at = ?, updated_at = ? WHERE id LIKE '{prefix}%'", (stamp, stamp))
    db.execute(f"UPDATE lounge_passes SET deleted_at = ?, updated_at = ? WHERE id LIKE '{prefix}%'", (stamp, stamp))
    if scenario == "pass":
        db.execute("DELETE FROM journeys WHERE id = ?", (journey,))
        db.execute(f"DELETE FROM lounge_passes WHERE id = '{prefix}pp'")
        db.execute(
            """INSERT INTO journeys
            (id,user_id,mode,carrier,carrier_country,number,from_code,from_country,to_code,to_country,
             distance_km,scheduled_departure,scheduled_arrival,created_at,updated_at,source,private_trip,cabin)
            VALUES (?,NULL,'flight','Qatar Airways','QA','QR3','DOH','QA','LHR','GB',5222,?,?,?,?,'manual',1,'economy')""",
            (journey, departure.isoformat(), (departure + timedelta(hours=7)).isoformat(), now.isoformat(), now.isoformat()))
        db.execute(
            """INSERT INTO lounge_passes (id,user_id,network,plan,number,free_visits,used_before,renews_on,
             extra_visit_cents,guest_cents,currency,position,created_at,updated_at)
            VALUES (?,NULL,'priority-pass','Standard Plus','PP1234567890',10,4,?,3500,3500,'EUR',-1,?,?)""",
            (prefix + "pp", f"{now.year + 1}-03-31", now.isoformat(), now.isoformat()))
    elif scenario != "clear":
        db.execute("DELETE FROM journeys WHERE id = ?", (journey,))
        db.execute(f"DELETE FROM memberships WHERE id = '{prefix}ay'")
        with_pass = scenario in {"included", "travel", "unsaved"}
        db.execute(
            """INSERT INTO journeys
            (id,user_id,mode,carrier,carrier_country,number,from_code,from_country,to_code,to_country,
             distance_km,scheduled_departure,scheduled_arrival,created_at,updated_at,source,private_trip,
             pass_code,pass_format,pass_captured_at)
            VALUES (?,NULL,'flight','Finnair','FI','AY5','HEL','FI','JFK','US',6610,?,?,?,?,'manual',1,?,?,?)""",
            (journey, departure.isoformat(), arrival.isoformat(), now.isoformat(), now.isoformat(),
             boarding_pass() if with_pass else None, "aztec" if with_pass else None,
             now.isoformat() if with_pass else None))
        if scenario not in {"none", "unsaved"}:
            db.execute(
                """INSERT INTO memberships (id,user_id,programme,number,tier,tier_until,position,created_at,updated_at)
                VALUES (?,NULL,'ay',?,'Platinum','2027-03',-1,?,?)""",
                (prefix + "ay", number, now.isoformat(), now.isoformat()))
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
print("Marked the fixtures deleted" if scenario == "clear" else f"Seeded {scenario}: journey {journey} departing {departure.isoformat()}")
