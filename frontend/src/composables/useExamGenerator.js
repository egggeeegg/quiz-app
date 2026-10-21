import api from "../api/index.js";
import { useExamStore } from "../stores/exam.js";

export function useExamGenerator() {
  const { state } = useExamStore();

  async function startExam(mode) {
    state.loading = true;
    try {
      const paperMode = mode === "review" || mode === "smart" ? mode : "normal";
      /* Questions are generated and owned by the server; answers never reach the browser. */
      const res = await api.post("/exams/generate", { mode: paperMode, limit: 50 });
      const qs = res.data.questions || [];

      if (!qs.length && paperMode === "review") {
        state.questions = [];
        state.answers = {};
        state.submitted = false;
        state.results = null;
        state.total = 0;
        state.sessionId = null;
        alert("暂无错题可重练，请先完成一次考试。");
        return;
      }

      state.questions = qs;
      state.answers = {};
      state.submitted = false;
      state.results = null;
      state.currentIndex = 0;
      state.total = qs.length;
      state.sessionId = res.data.sessionId || null;
      state.examId = null;
      state.examName = "";

      const c = n => qs.filter(q => q.type === n && !q._placeholder).length;
      console.log(paperMode === "review" ? "重练模式：" : paperMode === "smart" ? "智能组卷：" : "组卷完成：",
        `${c("单选")}单选/${c("多选")}多选/${c("判断")}判断`);
    } catch (e) {
      alert("获取题目失败: " + (e.response?.data?.error || e.message));
    } finally {
      state.loading = false;
    }
  }

  return { startExam };
}
