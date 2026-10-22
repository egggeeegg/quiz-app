import { all, get, exec } from "../db.js";

export function create(name, description = "") {
  return exec("INSERT INTO question_banks (name, description) VALUES (?, ?)", [name.trim(), description.trim()]).lastInsertRowid;
}

export function findById(id) {
  return get("SELECT * FROM question_banks WHERE id = ?", [id]);
}

export function findDefault() {
  return get("SELECT * FROM question_banks WHERE is_default = 1 AND archived_at IS NULL");
}

export function listAll() {
  const banks = all("SELECT * FROM question_banks WHERE archived_at IS NULL ORDER BY is_default DESC, id");
  const counts = all(`SELECT bank_id, type, COUNT(*) AS c FROM questions
                      WHERE status = 'active' AND bank_id IS NOT NULL GROUP BY bank_id, type`);
  const map = new Map();
  for (const row of counts) {
    if (!map.has(row.bank_id)) map.set(row.bank_id, {});
    map.get(row.bank_id)[row.type] = row.c;
  }
  return banks.map(b => {
    const byType = map.get(b.id) || {};
    return { ...b, counts: byType, total: Object.values(byType).reduce((a, b2) => a + b2, 0) };
  });
}

export function listNames() {
  return all("SELECT id, name, description, is_default FROM question_banks WHERE archived_at IS NULL ORDER BY is_default DESC, id");
}

export function update(id, name, description) {
  if (name === undefined && description === undefined) return;
  exec("UPDATE question_banks SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?",
    [name ?? null, description ?? null, id]);
}

export function archive(id) {
  exec("UPDATE question_banks SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND is_default = 0", [id]);
}

/* Resolve a requested list of bank ids against active banks. Empty input means
   "all active banks". */
export function resolveIds(requested) {
  const active = all("SELECT id FROM question_banks WHERE archived_at IS NULL ORDER BY id").map(b => b.id);
  if (!Array.isArray(requested) || requested.length === 0) return active;
  const wanted = new Set(requested.map(Number).filter(n => Number.isInteger(n) && n > 0));
  return active.filter(id => wanted.has(id));
}

export function activeIds() {
  return all("SELECT id FROM question_banks WHERE archived_at IS NULL ORDER BY id").map(b => b.id);
}
