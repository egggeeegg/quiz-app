import api from "../api/index.js";
import { useExamStore } from "../stores/exam.js";

export function useAnswerSubmit() {
  const { state, answeredCount } = useExamStore();

  function selectOption(i, letter) { if (!state.submitted) state.answers[i] = letter; }

  function toggleMulti(i, letter) {
    if (state.submitted) return;
    const cur = state.answers[i] || "";
    const s = new Set(cur.split("").filter(Boolean));
    s.has(letter) ? s.delete(letter) : s.add(letter);
    state.answers[i] = Array.from(s).sort().join("");
  }

  async function submitExam() {
    if (state.submitted || state.loading) return;
    if (!state.sessionId) {
      alert("试卷已失效，请重新组卷");
      return;
    }
    state.loading = true;
    try {
      const res = await api.post("/exams/submit", {
        session_id: state.sessionId,
        answers: state.answers,
        exam_name: "",
      });
      const data = res.data;

      /* Correct answers only arrive after grading — hydrate the local paper for review/export. */
      if (Array.isArray(data.correctAnswers)) {
        data.correctAnswers.forEach((answer, i) => {
          if (state.questions[i]) state.questions[i].answer = answer;
        });
      }
      if (Array.isArray(data.details)) {
        data.details.forEach((d, i) => {
          if (d?.type && state.questions[i]) state.questions[i].type = d.type;
        });
      }

      state.submitted = true;
      state.examId = data.examId;
      state.examName = data.examName || "";
      state.results = { totalScore: data.totalScore, details: data.details || [] };
    } catch (e) {
      /* No client-side fallback: without the answer key we cannot grade honestly. */
      alert("提交失败: " + (e.response?.data?.error || e.message));
    } finally {
      state.loading = false;
    }
  }

  return { selectOption, toggleMulti, submitExam, answeredCount };
}
