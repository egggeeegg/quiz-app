import { all, get, exec } from "../db.js";

export function create(bankId, adminId, filename, format, mode, total) {
  return exec(`INSERT INTO import_batches
    (bank_id, admin_id, filename, format, mode, status, total)
    VALUES (?, ?, ?, ?, ?, 'importing', ?)`,
    [bankId, adminId, filename, format, mode, total]).lastInsertRowid;
}

export function finish(id, stats) {
  exec(`UPDATE import_batches SET status = 'success', created_count = ?, updated_count = ?,
          archived_count = ?, skipped_count = ?, failed_count = ?, report_json = ?
        WHERE id = ?`,
    [stats.created, stats.updated, stats.archived || 0, stats.skipped, stats.failed,
      JSON.stringify(stats.report || {}), id]);
}

export function fail(id, stats = {}) {
  exec(`UPDATE import_batches SET status = 'failed', created_count = ?, updated_count = ?,
          archived_count = ?, skipped_count = ?, failed_count = ?, report_json = ?
        WHERE id = ?`,
    [stats.created || 0, stats.updated || 0, stats.archived || 0, stats.skipped || 0,
      stats.failed || 0, JSON.stringify(stats.report || {}), id]);
}

export function markRolledBack(id) {
  exec("UPDATE import_batches SET status = 'rolled_back', rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

export function findById(id) {
  return get("SELECT * FROM import_batches WHERE id = ?", [id]);
}

export function listByBank(bankId, limit = 50) {
  if (bankId) {
    return all(`SELECT b.*, u.username AS admin_name FROM import_batches b
                LEFT JOIN users u ON u.id = b.admin_id
                WHERE b.bank_id = ? ORDER BY b.id DESC LIMIT ?`, [bankId, limit]);
  }
  return all(`SELECT b.*, u.username AS admin_name FROM import_batches b
              LEFT JOIN users u ON u.id = b.admin_id
              ORDER BY b.id DESC LIMIT ?`, [limit]);
}

export function addItem(batchId, questionId, action, before, after) {
  exec(`INSERT INTO import_items (batch_id, question_id, action, before_json, after_json)
        VALUES (?, ?, ?, ?, ?)`,
    [batchId, questionId ?? null, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
}

export function items(batchId) {
  return all("SELECT * FROM import_items WHERE batch_id = ? ORDER BY id", [batchId]);
}

