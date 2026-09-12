import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
const P = 'com.shanavasshaji.flyright';
const remote = `/data/data/${P}/files/SQLite/flyright.db`;
const local = `/tmp/flyright-prune-${Date.now()}.db`;
execFileSync('sh', ['-c', `adb exec-out run-as ${P} cat ${remote} > ${local}`]);
for (const s of ['-wal', '-shm']) execFileSync('sh', ['-c', `adb shell run-as ${P} rm -f ${remote}${s} || true`]);
const KEEP = new Set(['AA2432|DFW|JFK','DL1085|JFK|SJU','AA33|JFK|LAX','UA1678|ORD|DEN','WN2011|LAS|LAX','B61085|JFK|MIA','DL428|SEA|JFK','AA1443|MIA|CUN','UA523|SFO|ORD','DL2117|ATL|SFO']);
const db = new DatabaseSync(local);
const rows = db.prepare('SELECT id, number, from_code, to_code, deleted_at, user_id FROM journeys').all();
const now = new Date().toISOString();
let killed = 0, kept = 0;
const upd = db.prepare('UPDATE journeys SET deleted_at = ?, updated_at = ? WHERE id = ?');
for (const r of rows) {
  const key = `${r.number}|${r.from_code}|${r.to_code}`;
  if (KEEP.has(key)) { kept++; continue; }
  if (!r.deleted_at) { upd.run(now, now, r.id); killed++; }
}
console.log({ total: rows.length, kept, killed, users: [...new Set(rows.map(r => r.user_id))] });
db.close();
execFileSync('sh', ['-c', `adb push ${local} /data/local/tmp/flyright.db >/dev/null && adb shell run-as ${P} cp /data/local/tmp/flyright.db files/SQLite/flyright.db && adb shell rm -f /data/local/tmp/flyright.db`]);
