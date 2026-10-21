<template>
  <div class="question-wrap">
    <!-- Navigation -->
    <div class="q-nav">
      <button class="btn btn-outline btn-sm" :disabled="currentIndex <= 0" @click="$emit('prev')">← 上一题</button>
      <span class="q-counter">第 {{ currentIndex + 1 }} / {{ total }} 题</span>
      <button class="btn btn-outline btn-sm" :disabled="currentIndex >= total - 1" @click="$emit('next')">下一题 →</button>
    </div>
    <!-- Question card -->
    <div class="card question-card">
      <div class="q-label">
        <span class="type-tag" :class="'type-' + typeClass">{{ question.type }}</span>
        第 {{ currentIndex + 1 }} 题
        <span v-if="!submitted && userAnswer" style="color:var(--correct)"> ✓ 已作答</span>
        <span v-if="submitted && result" :class="'answer-badge ' + (result.correct ? 'answer-correct' : 'answer-wrong')">
          {{ result.correct ? '✓ 正确(' + (SCORING[question.type] || 1) + '分)' : '✗ 错误(0分)' }}
        </span>
      </div>
      <div class="q-text">{{ question.question }}</div>

      <!-- 判断 -->
      <div v-if="question.type === '判断' && !isPlaceholder" class="options">
        <div v-for="opt in ['对', '错']" :key="opt"
          class="option" :class="optionClass(opt)"
          @click="$emit('select', currentIndex, opt)">
          <span class="choice-letter">{{ opt }}</span>
          <span>{{ opt === '对' ? '正确' : '错误' }}</span>
        </div>
      </div>

      <!-- 单选 -->
      <div v-else-if="question.type === '单选' && !isPlaceholder" class="options">
        <div v-for="(txt, letter) in question.options" :key="letter"
          class="option" :class="optionClass(letter)"
          @click="$emit('select', currentIndex, letter)">
          <span class="choice-letter">{{ letter }}</span>
          <span>{{ txt }}</span>
        </div>
      </div>

      <!-- 多选 -->
      <div v-else-if="question.type === '多选' && !isPlaceholder" class="options">
        <div v-for="(txt, letter) in question.options" :key="letter"
          class="option" :class="optionClass(letter)"
          @click="$emit('toggle', currentIndex, letter)">
          <span class="choice-letter">{{ letter }}</span>
          <span>{{ txt }}</span>
        </div>
      </div>

      <!-- 缺失选项提示 -->
      <div v-if="showMissingNotice" class="missing-notice">⚠️ 本题选项缺失，请跳过作答</div>

      <!-- 暂无题目 -->
      <div v-if="isPlaceholder" class="q-text" style="color:var(--text-muted)">暂无题目，请联系管理员补充题库。</div>

      <!-- 正确答案（提交后错误时） -->
      <div v-if="submitted && result && !result.correct && !isPlaceholder" class="review-analysis">
        正确答案: <strong>{{ question.answer }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  question: { type: Object, required: true },
  currentIndex: Number,
  total: Number,
  userAnswer: { type: String, default: "" },
  submitted: Boolean,
  result: Object,
  SCORING: Object,
});

const emit = defineEmits(["select", "toggle", "prev", "next"]);

const typeClass = computed(() => {
  if (props.question.type === "单选") return "type-dan";
  if (props.question.type === "多选") return "type-duo";
  if (props.question.type === "判断") return "type-pan";
  return "";
});

const isPlaceholder = computed(() => props.question._placeholder);
const showMissingNotice = computed(() => {
  return !isPlaceholder.value
    && props.question.type !== "判断"
    && Object.keys(props.question.options || {}).length === 0;
});

function optionClass(letter) {
  const ua = props.userAnswer || "";
  const sr = props.submitted && props.result;
  const classes = [];
  const isSelected = ua.includes(letter);

  if (isSelected && !sr) classes.push("selected");
  if (sr) {
    if ((props.question.answer || "").includes(letter)) classes.push("review-correct");
    else if (isSelected) classes.push("review-wrong");
  }
  return classes.join(" ");
}

</script>

<style scoped>
.q-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.q-nav .q-counter { font-size: 13px; color: var(--text-muted); }
.question-card { max-width: 720px; margin: 0 auto; }
.q-label { font-size: 13px; color: var(--text-muted); margin-bottom: 10px; }
.q-text { font-size: 16px; line-height: 1.7; margin-bottom: 16px; word-break: break-word; }
.type-tag { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-right: 6px; }
.type-dan { background: #fff; color: #1d4ed8; border: 1px solid #dbeafe; }
.type-duo { background: #fff; color: #be185d; border: 1px solid #fce7f3; }
.type-pan { background: #fff; color: #15803d; border: 1px solid #dcfce7; }
.options { display: flex; flex-direction: column; gap: 8px; }
.option {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px;
  border: 1.5px solid var(--border); border-radius: 10px; cursor: pointer; transition: all .15s;
  font-size: 15px; line-height: 1.5;
}
.option:hover { border-color: var(--primary); background: #fff; }
.option.selected { border-color: var(--primary); background: #fff; }
.option .choice-letter { background: #fff;
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%;
  background: var(--border); display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--text-muted);
}
.option.selected .choice-letter { background: #fff; color: var(--primary); border: 1.5px solid var(--primary); }
.option.review-correct { border-color: #22c55e; background: #fff; }
.option.review-correct .choice-letter { background: #fff; color: #22c55e; border: 1.5px solid #22c55e; }
.option.review-wrong { border-color: #ef4444; background: #fff; }
.option.review-wrong .choice-letter { background: #fff; color: #ef4444; border: 1.5px solid #ef4444; }
.answer-badge { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; }
.answer-correct { background: #fff; color: #15803d; border: 1px solid #86efac; }
.answer-wrong { background: #fff; color: #dc2626; border: 1px solid #fca5a5; }
.review-analysis { margin-top: 8px; padding: 8px 12px; background: #fff; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; color: var(--text-muted); }
.missing-notice { padding: 12px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 8px; margin-top: 8px; }
</style>