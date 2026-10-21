import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let db = null;
let dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "quiz.db");
let inTx = false;
let saveTimer = null;

export async function initDB() {
  const SQL = await initSqlJs();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      kicked_at INTEGER DEFAULT NULL,
      last_jti TEXT DEFAULT NULL,
      last_device_id TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, question TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '{}', answer TEXT NOT NULL,
      source_file TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, total_score REAL DEFAULT 0, max_score REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS user_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_result_id INTEGER NOT NULL, question_id INTEGER NOT NULL,
      user_answer TEXT DEFAULT '', is_correct INTEGER DEFAULT 0, skipped INTEGER DEFAULT 0,
      FOREIGN KEY (exam_result_id) REFERENCES exam_results(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );
    CREATE TABLE IF NOT EXISTS user_mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, question_id INTEGER NOT NULL,
      wrong_answer TEXT NOT NULL, correct_answer TEXT NOT NULL,
      review_count INTEGER DEFAULT 1, last_reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES questions(id),
      UNIQUE(user_id, question_id)
    );
  `);
  save();
  /* Create invite_codes table */
  db.run(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      created_by INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS device_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      banned_by INTEGER DEFAULT NULL,
      reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (banned_by) REFERENCES users(id)
    );  `);
  save();
  /* Migration: ensure users.role column exists (idempotent) */
  try { db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); } catch(e) {}
  // T2: Migration 闁?add name to exam_results (for grouping by exam session)
  try { db.run("ALTER TABLE exam_results ADD COLUMN name TEXT DEFAULT ''"); } catch(e) {}
  // T2: Migration 闁?add exam_result_id to user_mistakes (link mistakes to exam sessions)
  try { db.run("ALTER TABLE user_mistakes ADD COLUMN exam_result_id INTEGER DEFAULT NULL REFERENCES exam_results(id)"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN kicked_at INTEGER DEFAULT NULL"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN last_jti TEXT DEFAULT NULL"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN last_device_id TEXT DEFAULT NULL"); } catch(e) {}
  /* Migration: fill NULL exam_result_id in user_mistakes for old records */
  try {
    db.run(`
      UPDATE user_mistakes SET exam_result_id = (
        SELECT MAX(ua.exam_result_id) FROM user_answers ua
        WHERE ua.question_id = user_mistakes.question_id
          AND ua.is_correct = 0 AND ua.skipped = 0
      ) WHERE exam_result_id IS NULL
    `);
    save();
  } catch(e) {}
  /* Bootstrap the first admin only on an empty user table.
     Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD, otherwise a random
     password is generated and printed once. No hardcoded default password. */
  const hasAdmin = get("SELECT id FROM users WHERE role = 'admin'");
  /* seed.js sets SKIP_ADMIN_BOOTSTRAP so the account is created (and its
     password logged) by the API process, not by an ephemeral seed run. */
  if (!hasAdmin && process.env.SKIP_ADMIN_BOOTSTRAP !== "1") {
    const adminUser = process.env.ADMIN_USERNAME || "admin";
    let adminPass = process.env.ADMIN_PASSWORD;
    let generated = false;
    if (!adminPass) {
      adminPass = crypto.randomBytes(9).toString("base64url");
      generated = true;
    }
    const hash = bcrypt.hashSync(adminPass, 10);
    exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')", [adminUser, hash]);
    console.log("========================================================");
    console.log("[初始化] 已创建管理员账户");
    console.log(`  用户名: ${adminUser}`);
    console.log(`  密码:   ${adminPass}${generated ? "  (随机生成，请立即保存)" : ""}`);
    console.log("  登录后请尽快修改密码。");
    console.log("========================================================");
  }
}

function save() {
  if (!db) return;
  try {
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  } catch (e) {
    console.error("[db] 写入数据库失败:", e.message);
  }
}

/* sql.js keeps the whole DB in memory; every exec used to rewrite the file.
   Coalesce writes and never persist mid-transaction. */
function scheduleSave() {
  if (inTx || saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 30);
  if (typeof saveTimer.unref === "function") saveTimer.unref();
}

export function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  save();
}

process.on("exit", () => { try { flush(); } catch {} });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { try { flush(); } catch {} process.exit(0); });
}

// Query helpers (sync, similar to better-sqlite3)
export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function exec(sql, params = []) {
  db.run(sql, params);
  /* Read last_insert_rowid BEFORE db.export() (it resets the counter in sql.js 1.11.0) */
  const info = get("SELECT last_insert_rowid() as _id, changes() as _changes");
  scheduleSave();
  return {
    changes: info._changes,
    lastInsertRowid: info._id,
  };
}

export function begin() {
  if (inTx) throw new Error("nested transaction is not supported");
  db.run("BEGIN");
  inTx = true;
}
export function commit() {
  if (!inTx) return;
  db.run("COMMIT");
  inTx = false;
  flush();
}
export function rollback() {
  if (!inTx) return;
  db.run("ROLLBACK");
  inTx = false;
}
