import { Router } from "express";
import multer from "multer";
import * as bankModel from "../models/bank.js";
import * as questionModel from "../models/question.js";
import * as batchModel from "../models/importBatch.js";
import * as importService from "../services/importService.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { contentHash, QUESTION_TYPES, OPTION_LETTERS } from "../utils/questionText.js";

const router = Router();
router.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: importService.MAX_FILE_BYTES, files: 1 },
});

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

router.get("/banks", (req, res) => {
  res.json(bankModel.listAll());
});

router.post("/banks", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) throw badRequest("题库名称不能为空");
  if (name.length > 60) throw badRequest("题库名称最多 60 字符");
  try {
    const id = bankModel.create(name, String(req.body?.description || "").trim());
    res.status(201).json({ id, name });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) {
      const err = new Error("同名题库已存在");
      err.status = 409;
      throw err;
    }
    throw e;
  }
});

router.patch("/banks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!bankModel.findById(id)) throw Object.assign(new Error("题库不存在"), { status: 404 });
  const name = req.body?.name === undefined ? undefined : String(req.body.name).trim();
  const description = req.body?.description === undefined ? undefined : String(req.body.description).trim();
  if (name !== undefined && !name) throw badRequest("题库名称不能为空");
  bankModel.update(id, name, description);
  res.json({ ok: true });
});

router.post("/banks/:id/archive", (req, res) => {
  const id = Number(req.params.id);
  const bank = bankModel.findById(id);
  if (!bank) throw Object.assign(new Error("题库不存在"), { status: 404 });
  if (bank.is_default) throw badRequest("默认题库不能归档");
  bankModel.archive(id);
  res.json({ ok: true });
});

router.post("/banks/:id/validate", upload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) throw badRequest("缺少文件字段 file");
  const report = await importService.dryRun(Number(req.params.id), req.file.buffer, req.file.originalname);
  res.json(report);
}));

router.post("/banks/:id/import", upload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) throw badRequest("缺少文件字段 file");
  const mode = req.body?.mode || "append";
  const result = await importService.importBank({
    bankId: Number(req.params.id),
    adminId: req.user.id,
    buffer: req.file.buffer,
    filename: req.file.originalname,
    mode,
  });
  res.status(201).json(result);
}));

router.get("/imports", (req, res) => {
  const bankId = req.query.bank_id ? Number(req.query.bank_id) : null;
  res.json(batchModel.listByBank(bankId, Math.min(Number(req.query.limit) || 50, 200)));
});

router.get("/imports/:id", (req, res) => {
  const batch = batchModel.findById(Number(req.params.id));
  if (!batch) throw Object.assign(new Error("导入批次不存在"), { status: 404 });
  let report = {};
  try { report = JSON.parse(batch.report_json || "{}"); } catch {}
  res.json({ ...batch, report });
});

router.get("/imports/:id/errors.csv", (req, res) => {
  const batch = batchModel.findById(Number(req.params.id));
  if (!batch) throw Object.assign(new Error("导入批次不存在"), { status: 404 });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="import-${batch.id}-errors.csv"`);
  res.send(importService.errorsCsv(batch));
});

router.post("/imports/:id/rollback", (req, res) => {
  res.json(importService.rollbackBatch(Number(req.params.id)));
});

router.get("/questions", (req, res) => {
  const pageSize = Math.min(Math.max(Number(req.query.page_size) || 20, 1), 100);
  res.json(questionModel.list({
    bankId: req.query.bank_id ? Number(req.query.bank_id) : null,
    q: String(req.query.q || "").trim(),
    status: req.query.status === "archived" ? "archived" : "active",
    page: Number(req.query.page) || 1,
    pageSize,
  }));
});

router.patch("/questions/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = questionModel.findById(id);
  if (!current) throw Object.assign(new Error("题目不存在"), { status: 404 });

  const patch = {};
  if (req.body?.type !== undefined) {
    if (!QUESTION_TYPES.includes(req.body.type)) throw badRequest("题型不合法");
    patch.type = req.body.type;
  }
  if (req.body?.question !== undefined) {
    patch.question = String(req.body.question).trim();
    if (!patch.question) throw badRequest("题干不能为空");
    patch.content_hash = contentHash(patch.question);
  }
  if (req.body?.answer !== undefined) patch.answer = String(req.body.answer).trim().toUpperCase();
  if (req.body?.analysis !== undefined) patch.analysis = String(req.body.analysis).trim();
  if (req.body?.external_id !== undefined) patch.external_id = String(req.body.external_id || "").trim() || null;
  if (req.body?.options !== undefined) {
    if (!req.body.options || typeof req.body.options !== "object") throw badRequest("options 必须是对象");
    const options = {};
    for (const letter of OPTION_LETTERS) {
      if (req.body.options[letter] !== undefined) options[letter] = String(req.body.options[letter]).trim();
    }
    patch.options = options;
  }
  if (!Object.keys(patch).length) throw badRequest("没有可更新的字段");
  questionModel.update(id, patch);
  res.json({ ok: true });
});

router.post("/questions/:id/archive", (req, res) => {
  const id = Number(req.params.id);
  const current = questionModel.findById(id);
  if (!current) throw Object.assign(new Error("题目不存在"), { status: 404 });
  questionModel.archive(id);
  res.json({ ok: true });
});

router.get("/banks/:id/export", (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "json";
  const file = importService.exportBank(Number(req.params.id), format);
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.body);
});

router.get("/template.csv", (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="question-template.csv"');
  res.send(importService.templateCsv());
});

router.get("/template.xlsx", asyncRoute(async (req, res) => {
  const buffer = await importService.templateXlsx();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="question-template.xlsx"');
  res.send(buffer);
}));

export default router;
