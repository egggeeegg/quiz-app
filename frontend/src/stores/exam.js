import { reactive, computed } from "vue";
import api from "../api/index.js";

/* Shared exam state — replaces reactive() in old useExam */
const state = reactive({
  questions: [], answers: {}, submitted: false, results: null,
  currentIndex: 0, total: 0, loading: false,
  /* sessionId identifies the paper on the server; grading is server-side. */
  sessionId: null, examId: null, examName: "",
});

const answeredCount = computed(() => Object.keys(state.answers).length);
const progressPct = computed(() => state.total > 0 ? Math.round(answeredCount.value / state.total * 100) : 0);

export function useExamStore() {
  return { state, answeredCount, progressPct };
}
