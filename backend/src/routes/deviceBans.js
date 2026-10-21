import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { all, exec, get } from "../db.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, (req, res) => {
  try {
    const bans = all("SELECT d.*, u.username as banned_by_name FROM device_bans d LEFT JOIN users u ON d.banned_by = u.id ORDER BY d.created_at DESC");
    res.json(bans);
  } catch (e) { console.error("查询封禁列表失败:", e.stack); res.status(500).json({ error: "查询失败" }); }
});

router.post("/", requireAuth, requireAdmin, (req, res) => {
  try {
    const { device_id, reason } = req.body;
    if (!device_id) return res.status(400).json({ error: "缺少 device_id" });
    const existing = get("SELECT id FROM device_bans WHERE device_id = ?", [device_id]);
    if (existing) return res.status(409).json({ error: "该设备已被封禁" });
    exec("INSERT INTO device_bans (device_id, banned_by, reason) VALUES (?, ?, ?)", [device_id, req.user.id, reason || ""]);
    res.json({ ok: true, message: "设备已封禁" });
  } catch (e) { console.error("封禁失败:", e.stack); res.status(500).json({ error: "封禁失败" }); }
});

router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    exec("DELETE FROM device_bans WHERE id = ?", [parseInt(req.params.id, 10)]);
    res.json({ ok: true, message: "已解封" });
  } catch (e) { console.error("解封失败:", e.stack); res.status(500).json({ error: "解封失败" }); }
});

export default router;
