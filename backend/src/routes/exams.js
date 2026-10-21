import { Router } from "express";
import { requireAuth, requireAuthOptional } from "../middleware/auth.js";
import * as examService from "../services/examService.js";

const router = Router();

router.post("/generate", requireAuthOptional, (req, res) => {
  try {
    const mode = ["review", "smart"].includes(req.body?.mode) ? req.body.mode : "normal";
    /* Wrong-review and smart papers are per-user; never silently fall back to a normal paper. */
    if (mode !== "normal" && !req.user) return res.status(401).json({ error: "请先登录后再使用该组卷模式" });

    const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 200);
    const { questions, sessionId } = examService.generateExam(req.user?.id, mode, limit);
    res.json({ questions, sessionId });
  } catch (e) {
    console.error("[exams] 组卷失败:", e.stack);
    res.status(e.status || 500).json({ error: "组卷失败: " + e.message });
  }
});

router.post("/submit", requireAuth, (req, res) => {
  try {
    const { session_id, answers, exam_name } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "缺少试卷标识，请重新组卷" });
    if (!answers || typeof answers !== "object") return res.status(400).json({ error: "缺少答案数据" });
    const result = examService.submitExam(req.user.id, session_id, answers, exam_name);
    res.json(result);
  } catch (e) {
    console.error("[exams] 提交失败:", e.stack);
    res.status(e.status || 500).json({ error: "提交失败: " + e.message });
  }
});

router.get("/history", requireAuth, (req, res) => {
  try {
    res.json(examService.getExamHistory(req.user.id));
  } catch (e) {
    console.error("[exams] 查询历史失败:", e.stack);
    res.status(e.status || 500).json({ error: "查询历史失败: " + e.message });
  }
});

export default router;
