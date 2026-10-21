import { all, get } from "../db.js";
export function findByType(type) { return all("SELECT * FROM questions WHERE type = ? ORDER BY id", [type]); }
export function findById(id) { return get("SELECT * FROM questions WHERE id = ?", [id]); }
export function countByType() {
  const rows = all("SELECT type, COUNT(*) as c FROM questions GROUP BY type");
  const map = {}; rows.forEach(r => { map[r.type] = r.c; }); return map;
}
export function findByIds(ids) {
  if (!ids.length) return [];
  return all(`SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
}
