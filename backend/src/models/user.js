import { all, get, exec } from "../db.js";
export function findByUsername(username) { return get("SELECT * FROM users WHERE username = ?", [username]); }
export function findById(id) { return get("SELECT * FROM users WHERE id = ?", [id]); }
export function create(username, hash, role = "user") {
  return exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, hash, role]);
}
export function listAll() {
  return all(`SELECT u.*,(SELECT COUNT(*) FROM exam_results WHERE user_id=u.id) as exam_count,(SELECT COUNT(*) FROM user_mistakes WHERE user_id=u.id) as mistake_count FROM users u ORDER BY u.created_at DESC`);
}
export function kickById(id) {
  return exec("UPDATE users SET kicked_at = strftime('%s','now') WHERE id = ?", [id]);
}
export function updateDeviceId(id, deviceId) {
  return exec("UPDATE users SET last_device_id = ? WHERE id = ?", [deviceId, id]);
}

export function findDeviceBan(deviceId) {
  const row = get("SELECT * FROM device_bans WHERE device_id = ?", [deviceId]);
  return row || null;
}

export function updateLastJti(id, jti) {
  return exec("UPDATE users SET last_jti = ? WHERE id = ?", [jti, id]);
}

export function unkickById(id) {
  return exec("UPDATE users SET kicked_at = NULL WHERE id = ?", [id]);
}