import { Router } from "express";
import * as authService from "../services/authService.js";

const router = Router();

router.post("/register", (req, res) => {
  const { username, password, invite_code } = req.body;
  const deviceId = req.headers["x-device-id"] || "";
  const result = authService.register(username, password, invite_code, deviceId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(result.status).json(result.data);
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const deviceId = req.headers["x-device-id"] || "";
  const result = authService.login(username, password, deviceId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});

export default router;
