<template>
  <div class="mistakes-container">
    <!-- Header with mode toggle -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <h2 style="margin:0">错题集</h2>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-sm" :class="viewMode==='grouped'?'btn-primary':'btn-outline'" @click="switchToGrouped">按试卷</button>
          <router-link to="/exam?mode=review" class="btn btn-sm btn-primary" style="text-decoration:none">📝 开始重练</router-link>
          <button class="btn btn-sm" :class="viewMode==='list'?'btn-primary':'btn-outline'" @click="switchToList">按题目</button>
        </div>
      </div>
    </div>

    <!-- ========== Grouped mode (by exam session) ========== -->
    <template v-if="viewMode === 'grouped'">
      <div v-if="loading" class="card" style="text-align:center;padding:60px"><p>加载中...</p></div>
      <template v-else-if="exams.length === 0">
        <div class="card" style="text-align:center;padding:60px;color:var(--text-muted)">
          <h3 style="margin-bottom:8px;color:var(--text)">暂无错题记录</h3>
          <p>完成考试并提交后，答错的题目会自动记录到这里</p>
          <router-link to="/exam" class="btn btn-primary" style="margin-top:16px;display:inline-flex">去考试</router-link>
        </div>
      </template>
      <div v-else v-for="exam in exams" :key="exam.id" class="card exam-group">
        <div class="exam-header">
          <strong>📄 {{ exam.name || '未命名试卷' }} &middot; {{ formatDate(exam.created_at) }}</strong>
          <span v-if="exam.mistakeCount > 0" class="badge">{{ exam.mistakeCount }} 道错题</span>
        </div>
        <div v-if="exam.mistakes && exam.mistakes.length > 0">
          <div v-for="m in exam.mistakes" :key="m.id" class="mistake-item" style="padding:12px 0;border-bottom:1px solid var(--border)">
            <div class="q-label" style="margin-bottom:6px">
              <span class="type-tag" :class="'type-' + (m.type === '单选' ? 'dan' : m.type === '多选' ? 'duo' : 'pan')">{{ m.type }}</span>
            </div>
            <div class="q-text" style="margin-bottom:10px">{{ m.question }}</div>
            <div v-if="m.type !== '判断'" class="options" style="gap:4px;margin-bottom:8px">
              <div v-for="(txt, letter) in (typeof m.options === 'string' ? JSON.parse(m.options) : m.options)" :key="letter"
                class="option"
                :class="{ 'review-correct': (m.q_answer || '').includes(letter), 'review-wrong': (m.wrong_answer || '').includes(letter) && !(m.q_answer || '').includes(letter) }"
                style="cursor:default;padding:6px 10px;font-size:13px">
                <span class="choice-letter">{{ letter }}</span>
                <span>{{ txt }}</span>
              </div>
            </div>
            <div style="font-size:13px;margin-bottom:8px">
              你的答案: <span style="color:var(--wrong);font-weight:600">{{ m.wrong_answer }}</span>
              &nbsp;|&nbsp;
              正确答案: <span style="color:var(--correct);font-weight:600">{{ m.correct_answer }}</span>
            </div>
            <button class="btn btn-sm btn-outline" @click="reviewMistake(m.question_id)" :disabled="m._reviewing">
              {{ m._reviewing ? '已复习' : '标记为已复习' }}
            </button>
          </div>
        </div>
        <div v-else style="color:var(--text-muted);padding:8px 0;font-size:14px">该试卷无错题</div>
      </div>
    </template>

    <!-- ========== List mode (flat mistakes with filters) ========== -->
    <template v-if="viewMode === 'list'">
      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <label style="font-size:13px;color:var(--text-muted)">
            排序：
            <select v-model="sortMode" @change="loadMistakes" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;margin-left:4px">
              <option value="latest">最新在先</option>
              <option value="urgent">最久未复习</option>
            </select>
          </label>
          <label style="font-size:13px;color:var(--text-muted)">近几天：
            <select v-model="filterDays" @change="loadMistakes" style="margin-left:4px;padding:4px 8px;border:1px solid var(--border);border-radius:4px">
              <option value="">全部</option>
              <option value="7">7天</option>
              <option value="30">30天</option>
              <option value="90">90天</option>
            </select>
          </label>
          <label style="font-size:13px;color:var(--text-muted)">复习次数≥：
            <input v-model.number="filterReview" type="number" min="0" style="width:60px;margin-left:4px;padding:4px 8px;border:1px solid var(--border);border-radius:4px" @change="loadMistakes" />
          </label>
          <button class="btn btn-sm btn-outline" @click="filterDays='';filterReview='';loadMistakes()">重置</button>
          <span style="font-size:13px;color:var(--text-muted);margin-left:auto">共 {{ mistakes.length }} 题</span>
          <button class="btn btn-sm btn-outline" @click="batchReviewAll" :disabled="!mistakes.length || batchReviewing">✔ 全部标记已复习</button>
        </div>
      </div>
      <div v-if="mistakes.length === 0" class="card" style="text-align:center;padding:60px;color:var(--text-muted)">
        <h3 style="margin-bottom:8px;color:var(--text)">暂无错题记录</h3>
        <p>完成考试并提交后，答错的题目会自动记录到这里</p>
        <router-link to="/exam" class="btn btn-primary" style="margin-top:16px;display:inline-flex">去考试</router-link>
      </div>
      <div v-for="m in mistakes" :key="m.id" class="card">
        <div class="q-label">
          <span class="type-tag" :class="'type-' + (m.type === '单选' ? 'dan' : m.type === '多选' ? 'duo' : 'pan')">{{ m.type }}</span>
          错题 #{{ m.id }}
          <span style="font-size:12px;color:var(--text-muted);margin-left:8px">
            复习 {{ m.review_count }} 次 &middot; 上次 {{ formatDate(m.last_reviewed_at) }}
          </span>
        </div>
        <div class="q-text">{{ m.question }}</div>
        <div v-if="m.type !== '判断'" class="options" style="gap:4px;margin-bottom:8px">
          <div v-for="(txt, letter) in (typeof m.options === 'string' ? JSON.parse(m.options) : m.options)" :key="letter"
            class="option"
            :class="{ 'review-correct': (m.q_answer || '').includes(letter), 'review-wrong': (m.wrong_answer || '').includes(letter) && !(m.q_answer || '').includes(letter) }"
            style="cursor:default;padding:8px 12px;font-size:14px">
            <span class="choice-letter">{{ letter }}</span>
            <span>{{ txt }}</span>
          </div>
        </div>
        <div style="font-size:14px;margin-bottom:12px">
          你的答案: <span style="color:var(--wrong);font-weight:600">{{ m.wrong_answer }}</span>
          &nbsp;|&nbsp;
          正确答案: <span style="color:var(--correct);font-weight:600">{{ m.correct_answer }}</span>
        </div>
        <button class="btn btn-sm btn-outline" @click="reviewMistake(m.question_id)" :disabled="m._reviewing">
          {{ m._reviewing ? '已复习' : '标记为已复习' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import api from "../api/index.js";

const viewMode = ref("grouped");
const exams = ref([]);
const mistakes = ref([]);
const loading = ref(false);
const filterDays = ref("");
const filterReview = ref("");
const sortMode = ref("latest");
const batchReviewing = ref(false);

async function loadExamHistory() {
  loading.value = true;
  try {
    const res = await api.get("/exams/history");
    /* Debug: log raw exam data to verify types */
    console.log("[MistakesView] /exams/history raw response:", JSON.stringify(res.data, null, 2));
    /* Defensive: normalize exam.id to Number for type consistency */
    res.data.forEach(exam => {
      exam.id = Number(exam.id);
      if (Array.isArray(exam.mistakes)) {
        exam.mistakeCount = exam.mistakes.length;
        exam.mistakes.forEach(m => {
          m.exam_result_id = m.exam_result_id != null ? Number(m.exam_result_id) : null;
        });
      } else {
        exam.mistakeCount = 0;
        exam.mistakes = [];
      }
    });
    exams.value = res.data;
  } catch (e) {
    console.error("[MistakesView] loadExamHistory error:", e);
    alert("加载试卷历史失败: " + (e.response?.data?.error || e.message));
  } finally {
    loading.value = false;
  }
}

async function loadMistakes() {
  loading.value = true;
  try {
    const params = {};
    if (sortMode.value) params.sort = sortMode.value;
    if (filterDays.value) params.days = filterDays.value;
    if (filterReview.value) params.min_review = filterReview.value;
    const res = await api.get("/mistakes", { params });
    mistakes.value = res.data;
  } catch (e) {
    alert("加载错题失败: " + (e.response?.data?.error || e.message));
  } finally {
    loading.value = false;
  }
}

function switchToList() { viewMode.value = "list"; loadMistakes(); }
function switchToGrouped() { viewMode.value = "grouped"; loadExamHistory(); }


async function batchReviewAll() {
  batchReviewing.value = true;
  try {
    for (const m of mistakes.value) {
      await api.post("/mistakes/review", { question_id: m.question_id });
      m.review_count++; m.last_reviewed_at = new Date().toISOString(); m._reviewing = true;
    }
  } catch (e) { alert("批量更新失败: " + (e.response?.data?.error || e.message)); }
  finally { batchReviewing.value = false; }
}
async function reviewMistake(questionId) {
  try {
    await api.post("/mistakes/review", { question_id: questionId });
    const m = mistakes.value.find(x => x.question_id === questionId);
    if (m) { m.review_count++; m.last_reviewed_at = new Date().toISOString(); m._reviewing = true; }
    for (const exam of exams.value) {
      const em = (exam.mistakes || []).find(x => x.question_id === questionId);
      if (em) { em.review_count++; em._reviewing = true; }
    }
  } catch (e) {
    alert("更新失败: " + (e.response?.data?.error || e.message));
  }
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + pad(dt.getMonth()+1) + '-' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
}

onMounted(loadExamHistory);
</script>

<style scoped>
.mistakes-container { max-width: 800px; margin: 0 auto; padding: 24px; }
.exam-group { margin-bottom: 16px; }
.exam-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font-size: 15px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; background: #fce7f3; color: #be185d; }
.q-label { font-size: 13px; color: var(--text-muted); margin-bottom: 10px; }
.q-text { font-size: 16px; line-height: 1.7; margin-bottom: 16px; word-break: break-word; }
.type-tag { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-right: 6px; }
.type-dan { background: #dbeafe; color: #1d4ed8; }
.type-duo { background: #fce7f3; color: #be185d; }
.type-pan { background: #dcfce7; color: #15803d; }
.options { display: flex; flex-direction: column; gap: 4px; }
.option { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: 10px; font-size: 14px; line-height: 1.5; }
.option .choice-letter { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: var(--text-muted); }
.option.review-correct { border-color: #22c55e; background: #f0fdf4; }
.option.review-correct .choice-letter { background: #22c55e; color: #fff; }
.option.review-wrong { border-color: #ef4444; background: #fef2f2; }
.option.review-wrong .choice-letter { background: #ef4444; color: #fff; }
.mistake-item { margin-bottom: 0; }
.mistake-item:last-child { border-bottom: none !important; }
@media (max-width: 600px) { .mistakes-container { padding: 12px; } }
</style>