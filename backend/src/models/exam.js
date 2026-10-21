import { all, get, exec } from "../db.js";
export function create(userId, name) {
  return exec("INSERT INTO exam_results (user_id, total_score, max_score, name) VALUES (?, 0, 100, ?)", [userId, name]);
}
export function updateScore(id, score) { exec("UPDATE exam_results SET total_score = ? WHERE id = ?", [score, id]); }
export function findByUser(userId) {
  return all("SELECT id, name, total_score, max_score, created_at FROM exam_results WHERE user_id = ? ORDER BY created_at DESC", [userId]);
}
export function insertAnswer(examId, questionId, userAnswer, isCorrect, skipped) {
  exec("INSERT INTO user_answers (exam_result_id, question_id, user_answer, is_correct, skipped) VALUES (?, ?, ?, ?, ?)",
    [examId, questionId, userAnswer, isCorrect ? 1 : 0, skipped ? 1 : 0]);
}
export function findAnswersByExam(examId) {
  return all("SELECT * FROM user_answers WHERE exam_result_id = ?", [examId]);
}
