<template>
  <div class="admin-container">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <h2 style="margin:0">⚙️ 邀请码管理</h2>
        <button class="btn btn-primary btn-sm" @click="showForm = !showForm">
          {{ showForm ? '收起' : '+ 生成邀请码' }}
        </button>
      </div>
    </div>

    <!-- Generate form -->
    <div v-if="showForm" class="card">
      <h3 style="margin-bottom:12px;font-size:15px">生成新邀请码</h3>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
        <label style="font-size:13px;color:var(--text-muted)">
          数量：
          <input v-model.number="genCount" type="number" min="1" max="100" style="width:60px;margin-left:4px;padding:4px 8px;border:1px solid var(--border);border-radius:4px" />
        </label>
        <label style="font-size:13px;color:var(--text-muted)">
          类型：
          <select v-model="genType" style="margin-left:4px;padding:4px 8px;border:1px solid var(--border);border-radius:4px">
            <option value="single">单次使用</option>
            <option value="multi">多次使用</option>
          </select>
        </label>
        <label v-if="genType === 'multi'" style="font-size:13px;color:var(--text-muted)">
          最大使用次数：
          <input v-model.number="genMaxUses" type="number" min="2" max="999" style="width:60px;margin-left:4px;padding:4px 8px;border:1px solid var(--border);border-radius:4px" />
        </label>
        <button class="btn btn-primary btn-sm" @click="generate" :disabled="genLoading">
          {{ genLoading ? '生成中...' : '生成' }}
        </button>
      </div>
      <div v-if="genResult" class="gen-result">
        <p style="font-size:13px;color:var(--correct);margin-top:8px">已生成 {{ genResult.length }} 个邀请码：</p>
        <code style="display:block;padding:8px;background:#f1f5f9;border-radius:4px;font-size:14px;margin-top:4px;word-break:break-all">{{ genResult.join(' / ') }}</code>
      </div>
    </div>

    <!-- Codes table -->
    <div class="card">
      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>
      <div v-else-if="codes.length === 0" style="text-align:center;padding:40px;color:var(--text-muted)">暂无邀请码</div>
      <table v-else style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px">邀请码</th>
            <th style="text-align:left;padding:8px">类型</th>
            <th style="text-align:center;padding:8px">使用量</th>
            <th style="text-align:center;padding:8px">状态</th>
            <th style="text-align:left;padding:8px">创建者</th>
            <th style="text-align:left;padding:8px">创建时间</th>
            <th style="text-align:center;padding:8px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in codes" :key="c.id" style="border-bottom:1px solid var(--border)">
            <td data-label="邀请码" style="padding:10px 8px"><code>{{ c.code }}</code></td>
            <td data-label="类型" style="padding:10px 8px">{{ c.type === 'single' ? '单次' : '多次' }}</td>
            <td data-label="使用量" style="text-align:center;padding:10px 8px">{{ c.used_count }}/{{ c.max_uses }}</td>
            <td data-label="状态" style="text-align:center;padding:10px 8px">
              <span :style="c.is_active ? 'color:var(--correct);font-weight:600' : 'color:var(--text-muted)'">
                {{ c.is_active ? '有效' : '已作废' }}
              </span>
            </td>
            <td data-label="创建者" style="padding:10px 8px">{{ c.creator_name || '-' }}</td>
            <td data-label="创建时间" style="padding:10px 8px">{{ formatDate(c.created_at) }}</td>
            <td data-label="操作" style="text-align:center;padding:10px 8px">
              <button class="btn btn-sm" :class="c.is_active ? 'btn-outline' : 'btn-primary'" @click="toggleCode(c.id)">
                {{ c.is_active ? '作废' : '激活' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import api from "../api/index.js";

const codes = ref([]);
const loading = ref(false);
const showForm = ref(false);
const genCount = ref(5);
const genType = ref("single");
const genMaxUses = ref(10);
const genLoading = ref(false);
const genResult = ref(null);

async function loadCodes() {
  loading.value = true;
  try {
    const res = await api.get("/invites");
    codes.value = res.data;
  } catch (e) {
    alert("加载邀请码失败: " + (e.response?.data?.error || e.message));
  } finally {
    loading.value = false;
  }
}

async function generate() {
  genLoading.value = true;
  genResult.value = null;
  try {
    const res = await api.post("/invites/generate", {
      count: genCount.value,
      type: genType.value,
      max_uses: genType.value === "multi" ? genMaxUses.value : 1,
    });
    genResult.value = res.data.codes;
    await loadCodes();
  } catch (e) {
    alert("生成失败: " + (e.response?.data?.error || e.message));
  } finally {
    genLoading.value = false;
  }
}

async function toggleCode(id) {
  try {
    await api.put(`/invites/${id}/toggle`);
    await loadCodes();
  } catch (e) {
    alert("操作失败: " + (e.response?.data?.error || e.message));
  }
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + pad(dt.getMonth()+1) + "-" + pad(dt.getDate()) + " " + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
}

onMounted(loadCodes);
</script>

<style scoped>
.admin-container { max-width: 900px; margin: 0 auto; padding: 24px; }
.gen-result code { user-select: all; }
@media (max-width: 600px) {
  .admin-container { padding: 12px; }
  table, thead, tbody, tr, th, td { display: block; }
  thead tr { position: absolute; top: -9999px; left: -9999px; }
  td { padding: 6px 8px !important; border-bottom: none; }
  td:before { content: attr(data-label); font-weight: 600; display: inline-block; width: 80px; color: var(--text-muted); }
}
</style>
