import { Router } from "express";
import { all } from "../db.js";
import { requireAuthOptional } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuthOptional, (req, res) => {
  try {
    const { type } = req.query;
    const isAdmin = req.user?.role === "admin";
    /* Never ship the answer key to ordinary clients. */
    const columns = isAdmin ? "*" : "id, type, question, options, source_file, created_at";
    let sql = `SELECT ${columns} FROM questions`;
    const params = [];
    if (type) { sql += " WHERE type = ?"; params.push(type); }
    sql += " ORDER BY id";
    const rows = all(sql, params);
    rows.forEach(r => { try { r.options = JSON.parse(r.options); } catch { r.options = {}; } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/count", (req, res) => {
  try {
    const counts = {};
    const rows = all("SELECT type, COUNT(*) as c FROM questions GROUP BY type");
    rows.forEach(r => { counts[r.type] = r.c; });
    res.json(counts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
