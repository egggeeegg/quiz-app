import { all, get, exec } from "../db.js";

function placeholders(list) {
  return list.map(() => "?").join(",");
}

export function findByType(type, bankIds = []) {
  let sql = "SELECT * FROM questions WHERE type = ? AND status = 'active'";
  const params = [type];
  if (Array.isArray(bankIds) && bankIds.length > 0) {
    sql += ` AND bank_id IN (${placeholders(bankIds)})`;
    params.push(...bankIds);
  }
  sql += " ORDER BY id";
  return all(sql, params);
}

export function countByType(bankIds = []) {
  let sql = "SELECT type, COUNT(*) as c FROM questions WHERE status = 'active'";
  const params = [];
  if (Array.isArray(bankIds) && bankIds.length > 0) {
    sql += ` AND bank_id IN (${placeholders(bankIds)})`;
    params.push(...bankIds);
  }
  sql += " GROUP BY type";
  const rows = all(sql, params);
  const map = {};
  rows.forEach(r => { map[r.type] = r.c; });
  return map;
}

export function findByIds(ids) {
  if (!ids.length) return [];
  return all(`SELECT * FROM questions WHERE id IN (${placeholders(ids)})`, ids);
}

export function findById(id) {
  return get("SELECT * FROM questions WHERE id = ?", [id]);
}

export function findByExternalId(bankId, externalId, activeOnly = true) {
  const status = activeOnly ? " AND status = 'active'" : "";
  return get(`SELECT * FROM questions WHERE bank_id = ? AND external_id = ?${status}`, [bankId, externalId]);
}

export function findByHash(bankId, hash, excludeId = null) {
  return get(`SELECT id, question FROM questions
              WHERE bank_id = ? AND content_hash = ? AND status = 'active'
                AND (? IS NULL OR id <> ?) LIMIT 1`,
    [bankId, hash, excludeId, excludeId]);
}

export function list({ bankId, q, status = "active", page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];
  if (bankId) { where.push("bank_id = ?"); params.push(bankId); }
  if (status) { where.push("status = ?"); params.push(status); }
  if (q) { where.push("question LIKE ?"); params.push(`%${q}%`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = get(`SELECT COUNT(*) AS c FROM questions ${clause}`, params).c;
  const offset = (Math.max(Number(page) || 1, 1) - 1) * pageSize;
  const rows = all(`SELECT * FROM questions ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  rows.forEach(r => { try { r.options = JSON.parse(r.options); } catch { r.options = {}; } });
  return { rows, total, page: Number(page) || 1, pageSize };
}

export function create(data) {
  return exec(`INSERT INTO questions
    (type, question, options, answer, analysis, source_file, bank_id, external_id, status, content_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`,
    [
      data.type, data.question, JSON.stringify(data.options || {}), data.answer, data.analysis || "",
      data.source_file || "", data.bank_id, data.external_id || null, data.content_hash,
    ]).lastInsertRowid;
}

const UPDATABLE = new Set(["type", "question", "options", "answer", "analysis", "external_id", "content_hash", "status"]);

export function update(id, patch) {
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!UPDATABLE.has(key) || value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(key === "options" ? JSON.stringify(value) : value);
  }
  if (!fields.length) return;
  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  exec(`UPDATE questions SET ${fields.join(", ")} WHERE id = ?`, params);
}

export function archive(id) {
  exec("UPDATE questions SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

export function remove(id) {
  exec("DELETE FROM questions WHERE id = ?", [id]);
}

export function referenceCount(questionId) {
  return get(`SELECT
    (SELECT COUNT(*) FROM user_answers WHERE question_id = ?) +
    (SELECT COUNT(*) FROM user_mistakes WHERE question_id = ?) AS c`,
    [questionId, questionId]).c;
}

export function exportByBank(bankId) {
  const rows = all("SELECT * FROM questions WHERE bank_id = ? AND status = 'active' ORDER BY id", [bankId]);
  rows.forEach(r => { try { r.options = JSON.parse(r.options); } catch { r.options = {}; } });
  return rows;
}
