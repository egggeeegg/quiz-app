import crypto from "crypto";
import { SCORING, TYPES, MAX_SCORE } from "../config/index.js";
import { shuffle } from "../utils/helpers.js";
import * as questionModel from "../models/question.js";
import * as examModel from "../models/exam.js";
import * as mistakeModel from "../models/mistake.js";
import * as bankModel from "../models/bank.js";
import { get } from "../db.js";

/* ------------------------------------------------------------------ *
 * Exam sessions: the server owns which questions were handed out.
 * The client only gets a session id + question text (never answers),
 * and grading always uses the stored question ids + DB answers.
 * ------------------------------------------------------------------ */
const sessions = new Map();
const SESSION_TTL = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 5000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
}, 10 * 60 * 1000);
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

function createSession(userId, questions) {
  const sessionId = crypto.randomUUID();
  /* Snapshot type + answer at generation time. Grading must not depend on the
     current question row: an import can update or archive it mid-exam. */
  const items = questions.map(q => {
    if (q._placeholder) return null;
    const row = questionModel.findById(q.id);
    if (!row) return null;
    const hasOptions = row.type === "判断" || Object.keys(parseOptions(row.options)).length > 0;
    return { id: row.id, type: row.type, answer: row.answer || "", hasOptions };
  });
  sessions.set(sessionId, {
    userId: userId || null,
    items,
    createdAt: Date.now(),
    consumed: false,
  });
  if (sessions.size > MAX_SESSIONS) {
    for (const key of sessions.keys()) {
      sessions.delete(key);
      if (sessions.size <= MAX_SESSIONS * 0.9) break;
    }
  }
  return sessionId;
}

function takeSession(sessionId, userId) {
  const s = sessions.get(sessionId);
  if (!s) throw httpError(400, "试卷已失效，请重新组卷");
  if (Date.now() - s.createdAt > SESSION_TTL) {
    sessions.delete(sessionId);
    throw httpError(400, "试卷已过期，请重新组卷");
  }
  if (s.consumed) throw httpError(409, "该试卷已提交，请重新组卷");
  if (s.userId && s.userId !== userId) throw httpError(403, "无权提交该试卷");
  if (!s.userId) s.userId = userId;
  return s;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseOptions(raw) {
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

/* Strip answer / source_file before handing questions to the client. */
function toPublicQuestion(row) {
  return {
    id: row.id,
    type: row.type,
    question: row.question,
    options: parseOptions(row.options),
  };
}

function mistakeToQuestion(m) {
  return {
    id: m.question_id,
    type: m.type,
    question: m.question,
    options: parseOptions(m.options),
    _is_mistake: true,
  };
}

function placeholder(type) {
  return { id: -1, type, question: "暂无题目", options: {}, _placeholder: true };
}

/* ------------------------------------------------------------------ *
 * Paper generation
 * ------------------------------------------------------------------ */
export function generateExam(userId, mode, limit, requestedBanks = []) {
  const bankIds = bankModel.resolveIds(requestedBanks);
  if (bankIds.length === 0) throw httpError(400, "没有可用的题库");
  if (mode === "review" && userId) return build(generateReview(userId, limit || 50), userId);
  if (mode === "smart" && userId) return build(generateSmart(userId, bankIds), userId);
  return build(generateNormal(bankIds), userId);
}

function build(questions, userId) {
  return { questions, sessionId: createSession(userId, questions) };
}

function generateNormal(bankIds) {
  const questions = [];
  for (const info of TYPES) {
    const pool = questionModel.findByType(info.name, bankIds);
    shuffle(pool);
    for (let j = 0; j < info.count; j++) {
      questions.push(j < pool.length ? toPublicQuestion(pool[j]) : placeholder(info.name));
    }
  }
  return questions;
}

function generateSmart(userId, bankIds) {
  const mistakes = mistakeModel.findByUser(userId);
  const questions = [];
  for (const info of TYPES) {
    const pool = questionModel.findByType(info.name, bankIds);
    shuffle(pool);
    const typeMistakes = shuffle(mistakes.filter(m => m.type === info.name).slice());
    const half = Math.floor(info.count / 2);
    const picked = [];
    const seen = new Set();

    for (const m of typeMistakes) {
      if (picked.length >= half) break;
      if (seen.has(m.question_id)) continue;
      seen.add(m.question_id);
      picked.push(mistakeToQuestion(m));
    }
    for (const q of pool) {
      if (picked.length >= info.count) break;
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      picked.push(toPublicQuestion(q));
    }
    while (picked.length < info.count) picked.push(placeholder(info.name));

    shuffle(picked);
    questions.push(...picked);
  }
  return questions;
}

function generateReview(userId, limit) {
  const pool = mistakeModel.findByUser(userId).map(mistakeToQuestion);
  shuffle(pool);
  return pool.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
}

function generateExamName(userId) {
  const count = get("SELECT COUNT(*) as cnt FROM exam_results WHERE user_id = ?", [userId]);
  return `模拟考试 #${(count?.cnt || 0) + 1}`;
}

/* ------------------------------------------------------------------ *
 * Grading — always against the database answer for the session's ids.
 * ------------------------------------------------------------------ */
function isCorrect(type, correctAnswer, userAnswer) {
  if (type === "多选") {
    const us = new Set(userAnswer.split(""));
    const as = new Set((correctAnswer || "").split(""));
    return us.size === as.size && [...us].every(x => as.has(x));
  }
  return userAnswer === correctAnswer;
}

export function submitExam(userId, sessionId, answers, examName) {
  if (typeof sessionId !== "string" || !sessionId) throw httpError(400, "缺少试卷标识，请重新组卷");
  if (!answers || typeof answers !== "object") throw httpError(400, "缺少答案数据");

  const session = takeSession(sessionId, userId);
  if (!Array.isArray(session.items) || session.items.length === 0) throw httpError(400, "试卷为空，请重新组卷");
  if (session.items.length > 200) throw httpError(400, "题目数量超出限制");

  const name = (typeof examName === "string" && examName.trim()) || generateExamName(userId);

  const graded = [];
  for (let i = 0; i < session.items.length; i++) {
    const item = session.items[i];
    if (!item) {
      graded.push({ index: i, correct: false, points: 0, attempted: false, skipped: true, type: "", answer: "" });
      continue;
    }
    const raw = answers[i];
    const ua = typeof raw === "string" ? raw.trim().slice(0, 20).toUpperCase() : "";
    const attempted = ua !== "" && item.hasOptions;
    const correctAnswer = item.answer || "";
    const correct = attempted && isCorrect(item.type, correctAnswer, ua);
    graded.push({
      index: i,
      correct,
      points: correct ? (SCORING[item.type] || 1) : 0,
      attempted,
      type: item.type,
      answer: correctAnswer,
      questionId: item.id,
      userAnswer: ua,
    });
  }

  /* Nothing is written until grading is fully resolved. */
  const examId = examModel.create(userId, name).lastInsertRowid;
  let totalScore = 0;
  for (const g of graded) {
    if (g.skipped) continue;
    totalScore += g.points;
    examModel.insertAnswer(examId, g.questionId, g.userAnswer, g.correct, !g.attempted);
    if (g.attempted && !g.correct) {
      mistakeModel.record(userId, g.questionId, g.userAnswer, g.answer, examId);
    }
  }
  totalScore = Math.min(totalScore, MAX_SCORE);
  examModel.updateScore(examId, totalScore);
  session.consumed = true;

  return {
    totalScore,
    details: graded,
    correctAnswers: graded.map(g => g.answer),
    examId,
    examName: name,
  };
}

export function getExamHistory(userId) {
  const exams = examModel.findByUser(userId);
  for (const exam of exams) {
    const mistakes = mistakeModel.findByUser(userId, { examId: exam.id });
    exam.mistakes = mistakes;
    exam.mistakeCount = mistakes.length;
  }
  return exams;
}
