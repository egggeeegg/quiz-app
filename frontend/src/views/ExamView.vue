<template>
  <div class="exam-layout">
    <!-- Answer Card Sidebar -->
    <AnswerCard
      :questions="state.questions"
      :answers="state.answers"
      :currentIndex="state.currentIndex"
      :submitted="state.submitted"
      :answeredCount="answeredCount"
      :progressPct="progressPct"
      :total="state.total"
      :visible="sidebarVisible"
      @jump="jumpTo"
      @submit="submitExam"
      @close="sidebarVisible = false"
    />

    <!-- Mobile toggle -->
    <button class="sidebar-toggle" @click="sidebarVisible = !sidebarVisible">📋</button>

    <!-- Main content -->
    <div class="main-content">
      <!-- Header -->
      <div class="header-bar">
        <div>
          <h1 style="font-size:22px">刷题系统</h1>
          <small v-if="state.total > 0" style="color:var(--text-muted)">题库 {{ totalQ }} 题 · 组卷 {{ state.total }} 题</small>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" @click="startPaper" :disabled="state.loading">
            {{ state.loading ? '加载中...' : isReviewMode ? '开始重练' : isSmartMode ? '智能组卷' : '开始组卷' }}
          </button>
          <button class="btn btn-outline btn-sm" @click="exportDocx" :disabled="!state.submitted">导出DOCX</button>
        </div>
      </div>

      <!-- Bank selector (normal paper only, before starting) -->
      <div v-if="banks.length > 1 && state.questions.length === 0 && !state.loading" class="card">
        <strong style="font-size:14px">组卷题库</strong>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
          <label v-for="b in banks" :key="b.id" style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" :value="b.id" v-model="selectedBanks" />
            {{ b.name }} <span style="color:var(--text-muted)">({{ b.total }})</span>
          </label>
        </div>
        <small v-if="selectedBanks.length === 0" style="color:var(--text-muted)">未选择时使用全部题库</small>
      </div>

      <!-- Loading state -->
      <div v-if="state.loading && state.questions.length === 0" class="card" style="text-align:center;padding:60px">
        <p>加载中...</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="state.questions.length === 0" class="card" style="text-align:center;padding:60px;color:var(--text-muted)">
        <h3 style="margin-bottom:8px;color:var(--text)">欢迎使用刷题系统</h3>
        <p>{{ isReviewMode ? '暂无错题可重练' : isSmartMode ? '暂无足够题目，请先补充题库' : '题库已加载，点击上方「开始组卷」开始考试' }}</p>
        <button class="btn btn-primary" style="margin-top:16px" @click="startPaper">{{ isReviewMode ? '📝 开始重练' : '📝 开始组卷' }}</button>
      </div>

      <!-- Exam in progress / result -->
      <template v-else>
        <!-- Controls bar -->
        <div class="controls">
          <span style="font-size:13px;color:var(--text-muted)">进度: {{ answeredCount }}/{{ state.total }}</span>
          <span v-if="state.submitted" style="font-size:13px;color:var(--primary);font-weight:600">得分: {{ state.results.totalScore }} 分</span>
          <span v-if="!state.submitted" style="font-size:12px;color:var(--text-muted);margin-left:8px">未答题可随时提交</span>
          <div style="margin-left:auto;display:flex;gap:6px">
              <button v-if="state.submitted" class="btn btn-sm btn-danger" @click="startPaper">重新组卷</button>
              <router-link v-if="state.submitted" to="/mistakes" class="btn btn-sm btn-outline" style="text-decoration:none">📝 查看错题集</router-link>
              <button v-if="!state.submitted" class="btn btn-sm btn-primary" @click="submitExam" :disabled="state.loading">
              {{ state.loading ? '提交中...' : '提交判分' }}
            </button>
          </div>
        </div>

        <!-- Current question -->
        <ExamQuestion
          :question="currentQ"
          :currentIndex="state.currentIndex"
          :total="state.total"
          :userAnswer="state.answers[state.currentIndex] || ''"
          :submitted="state.submitted"
          :result="currentResult"
          :SCORING="SCORING"
          @select="selectOption"
          @toggle="toggleMulti"
          @prev="prevQuestion"
          @next="nextQuestion"
        />

        <!-- Bottom nav -->
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:12px;max-width:720px;margin-left:auto;margin-right:auto">
          <button class="btn btn-outline btn-sm" :disabled="state.currentIndex <= 0" @click="prevQuestion">← 上一题</button>
          <span style="font-size:13px;color:var(--text-muted)">{{ state.currentIndex + 1 }} / {{ state.total }}</span>
          <button class="btn btn-outline btn-sm" :disabled="state.currentIndex >= state.total - 1" @click="nextQuestion">下一题 →</button>
        </div>

        <!-- Submit button (always clickable) -->
        <div v-if="!state.submitted" style="margin-top:16px;text-align:center">
          <button class="btn btn-primary" @click="submitExam" :disabled="state.loading">
            {{ state.loading ? '提交中...' : '提交判分' }}
          </button>
          <span v-if="answeredCount < state.total" style="font-size:12px;color:var(--text-muted);margin-left:8px">
            还剩 {{ state.total - answeredCount }} 题未答（未答题计0分）
          </span>
        </div>

      </template>
    </div>

    <!-- Sidebar overlay for mobile -->
    <div v-if="sidebarVisible" class="sidebar-overlay" @click="sidebarVisible = false"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import api from "../api/index.js";
import AnswerCard from "../components/AnswerCard.vue";
import ExamQuestion from "../components/ExamQuestion.vue";
import { useExamStore } from "../stores/exam.js";
import { useExamGenerator } from "../composables/useExamGenerator.js";
import { useAnswerSubmit } from "../composables/useAnswerSubmit.js";
import { useDocxExport } from "../composables/useDocxExport.js";
import { useExamNavigation } from "../composables/useExamNavigation.js";

const SCORING = { 单选: 1, 多选: 2, 判断: 1 };
const route = useRoute();
const examMode = route.query.mode || "normal";
const isReviewMode = computed(() => examMode === "review");
const isSmartMode = computed(() => examMode === "smart");
const { state, answeredCount, progressPct } = useExamStore();
const { startExam } = useExamGenerator();
const { selectOption, toggleMulti, submitExam } = useAnswerSubmit();
const { exportDocx } = useDocxExport();
const { prevQuestion, nextQuestion, jumpTo } = useExamNavigation();

const sidebarVisible = ref(false);
const totalQ = ref(0);
const banks = ref([]);
const selectedBanks = ref([]);

function startPaper() {
  startExam(examMode, selectedBanks.value);
}

onMounted(async () => {
  try {
    const [countRes, bankRes] = await Promise.all([
      api.get("/questions/count"),
      api.get("/banks"),
    ]);
    totalQ.value = Object.values(countRes.data).reduce((a, b) => a + b, 0);
    banks.value = (bankRes.data || []).filter(b => b.total > 0);
    selectedBanks.value = banks.value.map(b => b.id);
    if (examMode !== "normal") startPaper();
  } catch { totalQ.value = 0; }
});

const currentQ = computed(() => {
  return state.questions[state.currentIndex] || { question: "", options: {}, type: "" };
});

const currentResult = computed(() => {
  if (state.submitted && state.results) {
    return state.results.details[state.currentIndex] || null;
  }
  return null;
});

// Click sidebar overlay to close on mobile
</script>

<style scoped>
.exam-layout { min-height: calc(100vh - 60px); position: relative; }
.main-content { margin-left: 200px; padding: 24px; max-width: calc(100vw - 200px); }
.header-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; max-width: 720px; margin-left: auto; margin-right: auto; }
.sidebar-toggle { display: none; }
.sidebar-overlay { display: none; }

.review-section h3 { font-size: 16px; margin-bottom: 12px; }
.review-item { padding: 16px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px; }
.review-item .q-text { font-size: 14px; }
.review-option { padding: 8px 12px; font-size: 14px; cursor: default; }

@media (max-width: 768px) {
  .main-content { margin-left: 0; padding: 16px; max-width: 100vw; }
  .sidebar-toggle { display: flex; position: fixed; bottom: 20px; right: 20px; width: 52px; height: 52px; border-radius: 50%; background: var(--primary); color: #fff; border: none; font-size: 18px; font-weight: 700; cursor: pointer; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,.2); align-items: center; justify-content: center; }
  .sidebar-overlay { display: block; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.3); z-index: 999; }
}
</style>
