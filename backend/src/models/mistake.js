import { all, get, exec } from "../db.js";
export function findByUser(userId, filters = {}) {
  let sql = `SELECT m.*, q.type, q.question, q.options, q.answer as q_answer FROM user_mistakes m JOIN questions q ON m.question_id = q.id WHERE m.user_id = ?`;
  const params = [userId];
  if (filters.days) { sql += " AND m.last_reviewed_at >= datetime('now', '-' || ? || ' days')"; params.push(filters.days); }
  if (filters.minReview) { sql += " AND m.review_count >= ?"; params.push(filters.minReview); }
  if (filters.type) { sql += " AND q.type = ?"; params.push(filters.type); }
  if (filters.examId) { sql += " AND m.exam_result_id = ?"; params.push(filters.examId); }
  if (filters.sort === "urgent") { sql += " ORDER BY m.last_reviewed_at ASC, m.review_count ASC"; }
  else { sql += " ORDER BY m.last_reviewed_at DESC"; }
  const rows = all(sql, params);
  rows.forEach(r => { try { r.options = JSON.parse(r.options); } catch { r.options = {}; } });
  return rows;
}
export function record(userId, questionId, wrongAnswer, correctAnswer, examId) {
  return exec(`INSERT INTO user_mistakes (user_id, question_id, wrong_answer, correct_answer, exam_result_id) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, question_id) DO UPDATE SET
      wrong_answer = excluded.wrong_answer,
      correct_answer = excluded.correct_answer,
      exam_result_id = excluded.exam_result_id,
      review_count = review_count + 1,
      last_reviewed_at = CURRENT_TIMESTAMP`,
    [userId, questionId, wrongAnswer, correctAnswer, examId]);
}
export function incrementReview(userId, questionId) {
  exec("UPDATE user_mistakes SET review_count = review_count + 1, last_reviewed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND question_id = ?", [userId, questionId]);
}
