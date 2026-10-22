import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDB } from "./db.js";
import authRouter from "./routes/auth.js";
import questionsRouter from "./routes/questions.js";
import examsRouter from "./routes/exams.js";
import mistakesRouter from "./routes/mistakes.js";
import inviteRouter from "./routes/invite.js";
import usersRouter from "./routes/users.js";
import deviceBansRouter from "./routes/deviceBans.js";
import banksRouter from "./routes/banks.js";
import adminRouter from "./routes/admin.js";
import { requireDeviceNotBanned } from "./middleware/deviceBan.js";

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(requireDeviceNotBanned);
app.use("/api/auth", authRouter);
app.use("/api/questions", questionsRouter);
app.use("/api/exams", examsRouter);
app.use("/api/mistakes", mistakesRouter);
app.use("/api/invites", inviteRouter);
app.use("/api/users", usersRouter);
app.use("/api/device-bans", deviceBansRouter);
app.use("/api/banks", banksRouter);
app.use("/api/admin", adminRouter);
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Initialize DB before accepting requests
initDB().then(() => {
  /* Global error handler for all API routes */
  app.use((err, req, res, next) => {
    console.error("[API Error]", err.stack || err.message || err);
    const body = {
      error: err.message || "服务器内部错误",
      code: err.status || 500,
    };
    if (err.report) body.report = err.report;
    if (err.batchId) body.batchId = err.batchId;
    if (err.conflicts) body.conflicts = err.conflicts;
    res.status(err.status || 500).json(body);
  });
  /* Catch unhandled promise rejections in routes */
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });
  app.listen(PORT, () => console.log(`[quiz-api] running on http://localhost:${PORT}`));
}).catch(err => {
  console.error("DB init failed:", err);
  process.exit(1);
});
