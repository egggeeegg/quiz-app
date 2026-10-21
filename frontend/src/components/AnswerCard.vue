<template>
  <div class="answer-card" :class="{ 'mobile-show': visible }">
    <h3>答题卡</h3>
    <div class="card-progress">
      <div class="bar"><div class="bar-fill" :style="{ width: progressPct + '%' }"></div></div>
      <div class="label">{{ answeredCount }} / {{ total }}</div>
    </div>
    <div class="card-grid">
      <div v-for="i in total" :key="i"
        class="grid-num"
        :class="{
          answered: answeredSet.has(i - 1),
          current: (i - 1) === currentIndex,
          placeholder: questions[i - 1] && questions[i - 1]._placeholder
        }"
        @click="jumpTo(i - 1)">{{ i }}</div>
      <div v-if="!submitted && total > 0" class="grid-num submit-cell" @click="$emit('submit')">
        提交试卷（{{ answeredCount }}/{{ total }}）
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  questions: { type: Array, default: () => [] },
  answers: { type: Object, default: () => ({}) },
  currentIndex: { type: Number, default: 0 },
  submitted: Boolean,
  answeredCount: Number,
  progressPct: Number,
  total: Number,
  visible: Boolean,
});

const emit = defineEmits(["jump", "submit", "close"]);

const answeredSet = computed(() => {
  const s = new Set();
  for (const k of Object.keys(props.answers)) s.add(Number(k));
  return s;
});

function jumpTo(i) {
  if (props.questions[i] && props.questions[i]._placeholder) return;
  emit("jump", i);
  emit("close");
}
</script>

<style scoped>
.answer-card {
  position: fixed; top: 0; left: 0; width: 200px; height: 100vh;
  background: var(--card); border-right: 1px solid var(--border);
  padding: 16px; overflow-y: auto; z-index: 100;
  display: flex; flex-direction: column;
}
.answer-card h3 { font-size: 14px; margin-bottom: 8px; color: var(--text); }
.card-progress { margin-bottom: 12px; }
.card-progress .bar { width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
.card-progress .bar-fill { height: 100%; background: var(--primary); border-radius: 2px; transition: width .3s; }
.card-progress .label { font-size: 11px; color: var(--text-muted); }
.card-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; flex: 1; align-content: start; }
.grid-num {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer;
  border: 1.5px solid var(--border); background: #fff; color: var(--text-muted);
  transition: all .15s;
}
.grid-num:hover { border-color: var(--primary); }
.grid-num.answered { background: #fff; border-color: var(--primary); color: var(--primary); }
.grid-num.current { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.grid-num.placeholder { cursor: default; opacity: .3; }
.grid-num.submit-cell {
  grid-column: 1 / -1; background: #fff; color: var(--primary); border: 1.5px solid var(--primary);
  cursor: pointer; padding: 8px; aspect-ratio: auto; border-radius: 6px; font-size: 13px; font-weight: 600; margin-top: 4px;
}
.grid-num.submit-cell:hover { background: var(--primary-light); }

@media (max-width: 768px) {
  .answer-card { display: none; }
  .answer-card.mobile-show { display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1000; border-radius: 0; }
}
</style>