import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as userModel from "../models/user.js";
const SECRET = process.env.JWT_SECRET;
const INSECURE_SECRETS = new Set([
  "",
  "dev-secret-do-not-use-in-prod",
  "change-this-to-a-random-secret-string",
]);

if (!SECRET || INSECURE_SECRETS.has(SECRET) || SECRET.length < 24) {
  console.error("[auth] JWT_SECRET 未配置或强度不足。请在 .env 中设置至少 24 位的随机字符串。");
  console.error("[auth] 生成方式: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  process.exit(1);
}

export function generateToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role || "user" }, SECRET, { expiresIn: "7d", jwtid: jti });
  return { token, jti };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "未登录" });
  try {
    req.user = jwt.verify(header.split(" ")[1], SECRET);
    const u = userModel.findById(req.user.id);
    /* A token for a deleted account must not keep working. */
    if (!u) return res.status(401).json({ error: "账户不存在，请重新登录" });
    if (u.kicked_at) {
      return res.status(401).json({ error: "账户已被管理员踢下线，请重新登录" });
    }
    if (u.last_jti && u.last_jti !== (req.user.jti || '')) {
      return res.status(401).json({ error: "账号已在其他设备登录，请重新登录" });
    }
    /* Trust the current DB role, not the one baked into the token. */
    req.user.role = u.role || "user";
    next();
  } catch { return res.status(401).json({ error: "登录已过期" }); }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "权限不足" });
  next();
}

export function requireAuthOptional(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) { req.user = null; return next(); }
  try {
    req.user = jwt.verify(header.split(" ")[1], SECRET);
    const u = userModel.findById(req.user.id);
    if (!u || u.kicked_at) { req.user = null; return next(); }
    if (u.last_jti && u.last_jti !== (req.user.jti || '')) { req.user = null; return next(); }
    req.user.role = u.role || "user";
    next();
  } catch { req.user = null; next(); }
}
