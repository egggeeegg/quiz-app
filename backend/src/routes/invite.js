import { Router } from "express";
import crypto from "crypto";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import * as inviteCodeModel from "../models/inviteCode.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, (req, res) => {
  try { res.json(inviteCodeModel.listAll()); }
  catch (e) { console.error("查询邀请码失败:", e.stack); res.status(500).json({ error: "查询失败" }); }
});

router.post("/generate", requireAuth, requireAdmin, (req, res) => {
  try {
    const { count = 1, type = "single", max_uses = 1 } = req.body;
    const results = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      inviteCodeModel.create(code, type, max_uses, req.user.id);
      results.push(code);
    }
    res.status(201).json({ codes: results, count });
  } catch (e) { console.error("生成邀请码失败:", e.stack); res.status(500).json({ error: "生成失败" }); }
});

router.put("/:id/toggle", requireAuth, requireAdmin, (req, res) => {
  try {
    const code = inviteCodeModel.findById(Number(req.params.id));
    if (!code) return res.status(404).json({ error: "不存在" });
    inviteCodeModel.toggleActive(req.params.id, !code.is_active);
    res.json({ ok: true, is_active: !code.is_active });
  } catch (e) { console.error("切换失败:", e.stack); res.status(500).json({ error: "操作失败" }); }
});

export default router;
