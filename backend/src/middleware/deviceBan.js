import { get } from "../db.js";

export function requireDeviceNotBanned(req, res, next) {
  /* Skip device ban check for device-ban management routes */
  if (req.path.startsWith("/api/device-bans")) return next();
  /* Also skip login/register so users can still attempt login */
  if (req.path.startsWith("/api/auth")) return next();

  try {
    const deviceId = req.headers["x-device-id"];
    if (!deviceId) return next();

    const banned = get("SELECT * FROM device_bans WHERE device_id = ?", [deviceId]);
    if (banned) {
      return res.status(403).json({ error: "该设备已被封禁，请联系管理员", code: "DEVICE_BANNED" });
    }
    next();
  } catch (e) {
    console.error("[deviceBan] 检查失败:", e.message);
    next();
  }
}
