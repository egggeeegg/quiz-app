import { Router } from "express";
import { all } from "../db.js";
import { requireAuthOptional } from "../middleware/auth.js";
import * as questionModel from "../models/question.js";

const router = Router();

function bankIdsFromQuery(query) {
  if (query.bank_ids) {
    return String(query.bank_ids).split(",").map(Number).filter(n => Number.isInteger(n) && n > 0);
  }
  if (query.bank_id) {
    const id = Number(query.bank_id);
    return Number.isInteger(id) && id > 0 ? [id] : [];
  }
  return [];
}

router.get("/", requireAuthOptional, (req, res) => {
  try {
    const { type } = req.query;
    const isAdmin = req.user?.role === "admin";
    const bankIds = bankIdsFromQuery(req.query);
    /* Never ship the answer key (or analysis) to ordinary clients. */
    const columns = isAdmin
      ? "*"
      : "id, type, question, options, bank_id, source_file, created_at";

    let sql = `SELECT ${columns} FROM questions WHERE status = 'active'`;
    const params = [];
    if (type) { sql += " AND type = ?"; params.push(type); }
    if (bankIds.length) {
      sql += ` AND bank_id IN (${bankIds.map(() => "?").join(",")})`;
      params.push(...bankIds);
    }
    sql += " ORDER BY id";

    const rows = all(sql, params);
    rows.forEach(r => { try { r.options = JSON.parse(r.options); } catch { r.options = {}; } });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/count", (req, res) => {
  try {
    res.json(questionModel.countByType(bankIdsFromQuery(req.query)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
