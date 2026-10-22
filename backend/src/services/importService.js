import path from "path";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { begin, commit, rollback, exec } from "../db.js";
import * as bankModel from "../models/bank.js";
import * as questionModel from "../models/question.js";
import * as batchModel from "../models/importBatch.js";
import { contentHash, QUESTION_TYPES, OPTION_LETTERS } from "../utils/questionText.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 10000;
const MAX_QUESTION_LEN = 2000;
const MAX_OPTION_LEN = 500;
const MAX_ANALYSIS_LEN = 2000;

let importing = false;

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function normalizeHeader(key) {
  return String(key || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) out[normalizeHeader(key)] = value;
  return out;
}

function firstValue(raw, keys) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function cellText(cell) {
  const value = cell?.value;
  if (value && typeof value === "object") {
    if (value.richText) return value.richText.map(part => part.text).join("");
    if (value.text) return String(value.text);
    if (value.result !== undefined) return String(value.result);
  }
  return cell?.text ?? "";
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw httpError(400, "XLSX 中没有工作表");
  if (sheet.rowCount < 2) return [];

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = normalizeHeader(cellText(cell));
  });

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj = {};
    let hasValue = false;
    for (let c = 1; c < headers.length; c++) {
      if (!headers[c]) continue;
      const text = cellText(row.getCell(c));
      if (String(text).trim() !== "") hasValue = true;
      obj[headers[c]] = text;
    }
    if (hasValue) rows.push(obj);
  }
  return rows;
}

function parseJson(buffer) {
  let data;
  try {
    data = JSON.parse(stripBom(buffer.toString("utf8")));
  } catch (e) {
    throw httpError(400, "JSON 解析失败: " + e.message);
  }
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.questions)) return data.questions;
  throw httpError(400, "JSON 必须是题目数组，或包含 questions 数组的对象");
}

export async function parseFile(buffer, filename) {
  if (!buffer || buffer.length === 0) throw httpError(400, "文件为空");
  if (buffer.length > MAX_FILE_BYTES) throw httpError(413, "文件超过 10 MB 限制");

  const ext = path.extname(filename || "").toLowerCase();
  let rows;
  if (ext === ".json") {
    rows = parseJson(buffer);
  } else if (ext === ".csv") {
    let parsed;
    try {
      parsed = parseCsv(stripBom(buffer.toString("utf8")), {
        columns: true, bom: true, skip_empty_lines: true, trim: true,
      });
    } catch (e) {
      throw httpError(400, "CSV 解析失败: " + e.message);
    }
    rows = parsed;
  } else if (ext === ".xlsx") {
    try {
      rows = await parseXlsx(buffer);
    } catch (e) {
      if (e.status) throw e;
      throw httpError(400, "XLSX 解析失败: " + e.message);
    }
  } else {
    throw httpError(400, "只支持 .json / .csv / .xlsx");
  }

  if (rows.length > MAX_ROWS) throw httpError(413, `单次最多 ${MAX_ROWS} 行`);
  return rows.map(normalizeKeys);
}

function normalizeAnswer(raw, type) {
  let value = String(raw ?? "").normalize("NFKC").trim().toUpperCase();
  value = value.replace(/[\s,，、;；/|]/g, "");
  if (type === "判断") {
    if (["对", "正确", "√", "T", "TRUE", "是", "1"].includes(value)) return "对";
    if (["错", "错误", "×", "X", "F", "FALSE", "否", "0"].includes(value)) return "错";
    return value;
  }
  return value;
}

function buildOptions(raw) {
  if (raw.options && typeof raw.options === "object" && !Array.isArray(raw.options)) {
    const out = {};
    for (const letter of OPTION_LETTERS) {
      if (raw.options[letter] !== undefined) out[letter] = String(raw.options[letter]).trim();
    }
    return out;
  }
  const out = {};
  for (const letter of OPTION_LETTERS) {
    out[letter] = String(firstValue(raw, [`option_${letter.toLowerCase()}`, `option${letter.toLowerCase()}`, letter.toLowerCase()])).trim();
  }
  return out;
}

function normalizeRow(raw, index) {
  const type = String(raw.type ?? "").trim();
  const question = String(raw.question ?? "").trim();
  const externalId = String(raw.external_id ?? "").trim();
  return {
    row: index + 2,
    external_id: externalId || null,
    type,
    question,
    options: type === "判断" ? {} : buildOptions(raw),
    answer: normalizeAnswer(raw.answer, type),
    analysis: String(raw.analysis ?? "").trim(),
  };
}

function validateRow(row) {
  const errors = [];
  const warnings = [];
  const push = (field, code, message) => errors.push({ row: row.row, external_id: row.external_id, field, code, message });

  if (!QUESTION_TYPES.includes(row.type)) push("type", "INVALID_TYPE", `题型必须是 单选/多选/判断，实际为 "${row.type}"`);
  if (!row.question) push("question", "EMPTY_QUESTION", "题干为空");
  if (row.question.length > MAX_QUESTION_LEN) push("question", "QUESTION_TOO_LONG", `题干超过 ${MAX_QUESTION_LEN} 字符`);
  if (row.analysis.length > MAX_ANALYSIS_LEN) push("analysis", "ANALYSIS_TOO_LONG", `解析超过 ${MAX_ANALYSIS_LEN} 字符`);
  if (row.external_id && row.external_id.length > 100) push("external_id", "EXTERNAL_ID_TOO_LONG", "external_id 超过 100 字符");

  if (row.type === "单选" || row.type === "多选") {
    for (const letter of OPTION_LETTERS) {
      const value = row.options[letter] || "";
      if (!value) push(`option_${letter.toLowerCase()}`, "EMPTY_OPTION", `选项 ${letter} 为空`);
      else if (value.length > MAX_OPTION_LEN) push(`option_${letter.toLowerCase()}`, "OPTION_TOO_LONG", `选项 ${letter} 超过 ${MAX_OPTION_LEN} 字符`);
    }
  }

  if (!row.answer) push("answer", "EMPTY_ANSWER", "答案为空");
  else if (row.type === "单选" && !/^[A-D]$/.test(row.answer)) {
    push("answer", "INVALID_SINGLE_ANSWER", "单选答案必须是 A-D 中的一个字母");
  } else if (row.type === "多选") {
    const letters = row.answer.split("");
    if (letters.length < 2 || letters.length > 4 || letters.some(l => !OPTION_LETTERS.includes(l)) || new Set(letters).size !== letters.length) {
      push("answer", "INVALID_MULTI_ANSWER", "多选答案必须是 2-4 个不重复的 A-D 字母");
    }
  } else if (row.type === "判断" && !["对", "错"].includes(row.answer)) {
    push("answer", "INVALID_JUDGE_ANSWER", "判断答案必须是 对/错");
  }

  if (row.options && row.type !== "判断") {
    const values = OPTION_LETTERS.map(l => row.options[l]).filter(Boolean);
    if (new Set(values).size < values.length) warnings.push({ row: row.row, field: "options", code: "DUPLICATE_OPTION_TEXT", message: "存在文本完全相同的选项" });
  }

  return { errors, warnings };
}

export function validateRows(rows, bankId, mode) {
  const errors = [];
  const warnings = [];
  const valid = [];
  const seenExternal = new Map();
  const seenHash = new Map();

  rows.forEach((raw, index) => {
    const row = normalizeRow(raw, index);
    const result = validateRow(row);
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    if (row.external_id) {
      if (seenExternal.has(row.external_id)) {
        errors.push({ row: row.row, external_id: row.external_id, field: "external_id", code: "DUPLICATE_EXTERNAL_ID_IN_FILE", message: `文件内 external_id 重复（首次出现在第 ${seenExternal.get(row.external_id)} 行）` });
      } else {
        seenExternal.set(row.external_id, row.row);
        const existing = questionModel.findByExternalId(bankId, row.external_id);
        if (existing && mode === "append") {
          errors.push({ row: row.row, external_id: row.external_id, field: "external_id", code: "EXTERNAL_ID_EXISTS", message: "该 external_id 在题库中已存在，append 模式不允许覆盖" });
        } else if (existing && mode === "replace") {
          warnings.push({ row: row.row, field: "external_id", code: "EXTERNAL_ID_ARCHIVED", message: "replace 会归档旧题并插入新题，ID 不变更" });
        }
      }
    }

    const hash = contentHash(row.question);
    if (seenHash.has(hash)) {
      warnings.push({ row: row.row, field: "question", code: "DUPLICATE_IN_FILE", message: `与第 ${seenHash.get(hash)} 行题干重复` });
    } else {
      seenHash.set(hash, row.row);
    }
    const duplicate = questionModel.findByHash(bankId, hash);
    if (duplicate) {
      warnings.push({ row: row.row, field: "question", code: "DUPLICATE_IN_BANK", message: `题库中已存在相同题干（ID ${duplicate.id}）` });
    }

    if (result.errors.length === 0) valid.push({ ...row, content_hash: hash });
  });

  errors.sort((a, b) => a.row - b.row);
  return {
    total: rows.length,
    valid,
    errors,
    warnings,
    validCount: valid.length,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

function snapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    question: row.question,
    options: row.options,
    answer: row.answer,
    analysis: row.analysis || "",
    external_id: row.external_id || null,
    status: row.status,
    content_hash: row.content_hash,
    updated_at: row.updated_at,
  };
}

function restoreSnapshot(snap) {
  exec(`UPDATE questions SET type = ?, question = ?, options = ?, answer = ?, analysis = ?,
          external_id = ?, status = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
    [snap.type, snap.question, snap.options, snap.answer, snap.analysis || "", snap.external_id,
      snap.status, snap.content_hash, snap.updated_at, snap.id]);
}

export async function dryRun(bankId, buffer, filename) {
  const bank = bankModel.findById(bankId);
  if (!bank || bank.archived_at) throw httpError(404, "题库不存在或已归档");
  const rows = await parseFile(buffer, filename);
  const report = validateRows(rows, bankId, "append");
  return {
    ...report,
    preview: report.valid.slice(0, 20).map(q => ({
      row: q.row, external_id: q.external_id, type: q.type, question: q.question,
      options: q.options, answer: q.answer, analysis: q.analysis,
    })),
  };
}

export async function importBank({ bankId, adminId, buffer, filename, mode = "append" }) {
  if (!["append", "upsert", "replace"].includes(mode)) throw httpError(400, "mode 必须是 append/upsert/replace");
  if (importing) throw httpError(409, "已有导入任务在执行，请稍后重试");

  const bank = bankModel.findById(bankId);
  if (!bank || bank.archived_at) throw httpError(404, "题库不存在或已归档");

  importing = true;
  try {
    const rows = await parseFile(buffer, filename);
    const report = validateRows(rows, bankId, mode);
    const format = path.extname(filename || "").slice(1).toLowerCase();

    if (report.errors.length > 0) {
      const failedId = batchModel.create(bankId, adminId, filename || "", format, mode, report.total);
      batchModel.fail(failedId, { failed: report.errors.length, report });
      throw httpError(422, `校验失败：${report.errors.length} 处错误，未写入任何数据`, { report, batchId: failedId });
    }

    const stats = { created: 0, updated: 0, archived: 0, skipped: 0, failed: 0, report: { warnings: report.warnings } };

    begin();
    let batchId;
    try {
      batchId = batchModel.create(bankId, adminId, filename || "", format, mode, report.total);

      if (mode === "replace") {
        for (const old of questionModel.exportByBank(bankId)) {
          const before = snapshot(old);
          questionModel.archive(old.id);
          const after = snapshot(questionModel.findById(old.id));
          batchModel.addItem(batchId, old.id, "archive", before, after);
          stats.archived++;
        }
      }

      for (const item of report.valid) {
        if (mode === "upsert" && item.external_id) {
          const existing = questionModel.findByExternalId(bankId, item.external_id);
          if (existing) {
            const before = snapshot(existing);
            questionModel.update(existing.id, {
              type: item.type, question: item.question, options: item.options, answer: item.answer,
              analysis: item.analysis, external_id: item.external_id, content_hash: item.content_hash,
              status: "active",
            });
            const after = snapshot(questionModel.findById(existing.id));
            batchModel.addItem(batchId, existing.id, "update", before, after);
            stats.updated++;
            continue;
          }
        }
        const id = questionModel.create({
          type: item.type, question: item.question, options: item.options, answer: item.answer,
          analysis: item.analysis, bank_id: bankId, external_id: item.external_id, content_hash: item.content_hash,
          source_file: filename || "",
        });
        batchModel.addItem(batchId, id, "create", null, snapshot(questionModel.findById(id)));
        stats.created++;
      }

      batchModel.finish(batchId, stats);
      commit();
    } catch (e) {
      rollback();
      throw e;
    }

    return { batchId, stats, warnings: report.warnings };
  } finally {
    importing = false;
  }
}

export function rollbackBatch(batchId) {
  const batch = batchModel.findById(batchId);
  if (!batch) throw httpError(404, "导入批次不存在");
  if (batch.status === "rolled_back") throw httpError(400, "该批次已回滚");
  if (batch.status !== "success") throw httpError(400, "只有成功的批次才能回滚");

  const items = batchModel.items(batchId);
  const conflicts = [];

  for (const item of items) {
    const before = item.before_json ? JSON.parse(item.before_json) : null;
    const after = item.after_json ? JSON.parse(item.after_json) : null;
    const current = item.question_id ? questionModel.findById(item.question_id) : null;

    if (item.action === "create") {
      if (!current) conflicts.push({ id: after?.id, code: "MISSING", message: "题目已被删除" });
      else if (current.updated_at !== after.updated_at) conflicts.push({ id: current.id, code: "MODIFIED", message: "题目在导入后被修改" });
      else if (questionModel.referenceCount(current.id) > 0) conflicts.push({ id: current.id, code: "REFERENCED", message: "题目已被考试或错题引用，不能删除" });
    } else if (item.action === "update") {
      if (!current) conflicts.push({ id: item.question_id, code: "MISSING", message: "题目已被删除" });
      else if (current.updated_at !== after.updated_at) conflicts.push({ id: current.id, code: "MODIFIED", message: "题目在导入后被再次修改" });
    } else if (item.action === "archive") {
      if (!current) conflicts.push({ id: item.question_id, code: "MISSING", message: "题目已被删除" });
      else if (current.status !== "archived" || current.updated_at !== after.updated_at) {
        conflicts.push({ id: current.id, code: "MODIFIED", message: "归档状态在导入后被修改" });
      }
    }
  }

  if (conflicts.length > 0) throw httpError(409, `回滚中止：${conflicts.length} 道题存在冲突`, { conflicts });

  begin();
  try {
    for (const item of [...items].reverse()) {
      const before = item.before_json ? JSON.parse(item.before_json) : null;
      if (item.action === "create") questionModel.remove(item.question_id);
      else if (item.action === "update") restoreSnapshot(before);
      else if (item.action === "archive") {
        exec("UPDATE questions SET status = 'active', updated_at = ? WHERE id = ?", [before.updated_at, item.question_id]);
      }
    }
    batchModel.markRolledBack(batchId);
    commit();
  } catch (e) {
    rollback();
    throw e;
  }

  return { batchId, rolledBackItems: items.length };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function errorsCsv(batch) {
  let report = {};
  try { report = JSON.parse(batch.report_json || "{}"); } catch {}
  const rows = [["row", "external_id", "field", "code", "message"].join(",")];
  for (const error of report.errors || []) {
    rows.push([error.row, error.external_id, error.field, error.code, error.message].map(csvCell).join(","));
  }
  return "\uFEFF" + rows.join("\n");
}

export function exportBank(bankId, format = "json") {
  const bank = bankModel.findById(bankId);
  if (!bank || bank.archived_at) throw httpError(404, "题库不存在或已归档");
  const rows = questionModel.exportByBank(bankId);
  const items = rows.map(q => ({
    external_id: q.external_id || `q-${q.id}`,
    type: q.type,
    question: q.question,
    options: q.options,
    answer: q.answer,
    analysis: q.analysis || "",
  }));

  if (format === "csv") {
    const header = ["external_id", "type", "question", "option_a", "option_b", "option_c", "option_d", "answer", "analysis"];
    const lines = [header.join(",")];
    for (const q of items) {
      lines.push([
        q.external_id, q.type, q.question, q.options.A || "", q.options.B || "",
        q.options.C || "", q.options.D || "", q.answer, q.analysis,
      ].map(csvCell).join(","));
    }
    return { filename: `bank-${bankId}.csv`, mime: "text/csv; charset=utf-8", body: "\uFEFF" + lines.join("\n") };
  }

  return { filename: `bank-${bankId}.json`, mime: "application/json; charset=utf-8", body: JSON.stringify(items, null, 2) };
}

export function templateCsv() {
  const header = "external_id,type,question,option_a,option_b,option_c,option_d,answer,analysis";
  const example = [
    'demo-1', '单选', 'HTTP 200 表示什么？', '请求成功', '资源不存在', '未认证', '服务端错误', 'A', '2xx 表示成功',
  ].map(csvCell).join(",");
  return "\uFEFF" + header + "\n" + example + "\n";
}

export async function templateXlsx() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("questions");
  sheet.addRow(["external_id", "type", "question", "option_a", "option_b", "option_c", "option_d", "answer", "analysis"]);
  sheet.addRow(["demo-1", "单选", "HTTP 200 表示什么？", "请求成功", "资源不存在", "未认证", "服务端错误", "A", "2xx 表示成功"]);
  sheet.addRow(["demo-2", "多选", "下列哪些是 HTTP 方法？", "GET", "POST", "DELETE", "JSON", "ABC", "JSON 是数据格式"]);
  sheet.addRow(["demo-3", "判断", "GET 请求应当是幂等的。", "", "", "", "", "对", ""]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
