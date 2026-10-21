import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as mistakeService from "../services/mistakeService.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  try {
    const { days, min_review, sort } = req.query;
    const mistakes = mistakeService.listMistakes(req.user.id, { days, minReview: min_review, sort });
    res.json(mistakes);
  } catch (e) { console.error("[mistakes] 查询失败:", e.stack); res.status(500).json({ error: "查询失败: " + e.message }); }
});

router.post("/review", requireAuth, (req, res) => {
  try {
    const { question_id } = req.body;
    if (!question_id) return res.status(400).json({ error: "缺少question_id" });
    mistakeService.markReviewed(req.user.id, question_id);
    res.json({ ok: true });
  } catch (e) { console.error("[mistakes] 更新失败:", e.stack); res.status(500).json({ error: "更新失败: " + e.message }); }
});

export default router;
