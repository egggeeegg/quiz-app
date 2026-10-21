import { onMounted, onUnmounted } from "vue";
import { useExamStore } from "../stores/exam.js";

export function useExamNavigation() {
  const { state } = useExamStore();

  function prevQuestion() { if (state.currentIndex > 0) state.currentIndex--; }
  function nextQuestion() { if (state.currentIndex < state.total - 1) state.currentIndex++; }
  function jumpTo(i) { if (i >= 0 && i < state.total) state.currentIndex = i; }

  function handleKeydown(e) {
    if (state.questions.length === 0) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); prevQuestion(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); nextQuestion(); }
  }
  onMounted(() => document.addEventListener("keydown", handleKeydown));
  onUnmounted(() => document.removeEventListener("keydown", handleKeydown));

  return { prevQuestion, nextQuestion, jumpTo };
}
