import bcrypt from "bcryptjs";
import * as userModel from "../models/user.js";
import * as inviteCodeModel from "../models/inviteCode.js";
import { generateToken } from "../middleware/auth.js";

export function register(username, password, inviteCode, deviceId) {
  const name = typeof username === "string" ? username.trim() : "";
  const pass = typeof password === "string" ? password : "";
  const code = typeof inviteCode === "string" ? inviteCode.trim() : "";

  if (deviceId && userModel.findDeviceBan(deviceId)) return { error: "该设备已被封禁", status: 403 };
  if (!name || !pass || name.length < 2 || pass.length < 4)
    return { error: "用户名至少2字符，密码至少4字符", status: 400 };
  if (!code) return { error: "需要邀请码才能注册", status: 400 };

  const ic = inviteCodeModel.findByCode(code);
  if (!ic || !ic.is_active) return { error: "邀请码无效或已作废", status: 400 };
  if ((ic.type === "single" && ic.used_count >= 1) || (ic.max_uses > 0 && ic.used_count >= ic.max_uses))
    return { error: "该邀请码已达最大使用次数", status: 400 };

  if (userModel.findByUsername(name)) return { error: "用户名已存在", status: 409 };

  const hash = bcrypt.hashSync(pass, 10);
  const result = userModel.create(name, hash, "user");
  const id = result.lastInsertRowid;
  inviteCodeModel.incrementUsed(ic.id);

  const { token, jti } = generateToken({ id, username: name, role: "user" });
  userModel.updateLastJti(id, jti);
  if (deviceId) userModel.updateDeviceId(id, deviceId);
  return { data: { id, token, username: name, role: "user" }, status: 201 };
}

export function login(username, password, deviceId) {
  /* Device bans must apply to login too, otherwise a banned device can simply sign in again. */
  if (deviceId && userModel.findDeviceBan(deviceId)) return { error: "该设备已被封禁，请联系管理员", status: 403 };

  const name = typeof username === "string" ? username.trim() : "";
  const pass = typeof password === "string" ? password : "";
  const user = userModel.findByUsername(name);
  if (!user || !bcrypt.compareSync(pass, user.password_hash))
    return { error: "用户名或密码错误", status: 401 };
  if (user.kicked_at) return { error: "账户已被管理员踢下线，请联系管理员", status: 403 };

  const { token, jti } = generateToken({ id: user.id, username: user.username, role: user.role || "user" });
  userModel.updateLastJti(user.id, jti);
  if (deviceId) userModel.updateDeviceId(user.id, deviceId);
  return { data: { id: user.id, token, username: user.username, role: user.role || "user" } };
}
