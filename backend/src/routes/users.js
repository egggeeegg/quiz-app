import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import * as userModel from "../models/user.js";
import { all, exec, begin, commit, rollback } from "../db.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, (req, res) => {
  try { res.json(userModel.listAll()); }
  catch (e) { console.error("查询用户失败:", e.stack); res.status(500).json({ error: "查询失败" }); }
});

router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return res.status(400).json({ error: "不能删除自己" });
    const user = userModel.findById(id);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (user.role === "admin") return res.status(400).json({ error: "不能删除管理员" });
    begin();
    exec("DELETE FROM user_mistakes WHERE user_id = ?", [id]);
    exec("DELETE FROM user_answers WHERE exam_result_id IN (SELECT id FROM exam_results WHERE user_id = ?)", [id]);
    exec("DELETE FROM exam_results WHERE user_id = ?", [id]);
    exec("DELETE FROM users WHERE id = ?", [id]);
    commit();
    res.json({ ok: true });
  } catch (e) { rollback(); console.error("删除用户失败:", e.stack); res.status(500).json({ error: "删除失败" }); }
});

router.post("/:id/kick", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return res.status(400).json({ error: "不能踢自己下线" });
    const user = userModel.findById(id);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    userModel.kickById(id);
    res.json({ ok: true, message: "用户已被踢下线" });
  } catch (e) { console.error("踢用户失败:", e.stack); res.status(500).json({ error: "踢用户失败" }); }
});

router.post("/:id/unkick", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = userModel.findById(id);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    userModel.unkickById(id);
    res.json({ ok: true, message: "用户已解封" });
  } catch (e) { console.error("解封失败:", e.stack); res.status(500).json({ error: "解封失败" }); }
});

export default router;
