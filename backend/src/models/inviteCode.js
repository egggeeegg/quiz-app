import { all, get, exec } from "../db.js";
export function findByCode(code) { return get("SELECT * FROM invite_codes WHERE code = ?", [code]); }
export function findById(id) { return get("SELECT * FROM invite_codes WHERE id = ?", [id]); }
export function create(code, type, maxUses, createdBy) {
  return exec("INSERT INTO invite_codes (code, type, max_uses, created_by) VALUES (?, ?, ?, ?)", [code, type, maxUses, createdBy]);
}
export function incrementUsed(id) { exec("UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?", [id]); }
export function listAll() {
  return all(`SELECT ic.*, u.username as creator_name FROM invite_codes ic LEFT JOIN users u ON ic.created_by = u.id ORDER BY ic.created_at DESC`);
}
export function toggleActive(id, active) { exec("UPDATE invite_codes SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]); }
