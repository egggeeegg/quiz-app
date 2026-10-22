<template>
  <div class="bank-page">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="margin:0">📚 题库管理</h2>
          <small style="color:var(--text-muted)">JSON / CSV / XLSX 导入，支持去重、覆盖与回滚</small>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" @click="downloadTemplate('csv')">CSV 模板</button>
          <button class="btn btn-outline btn-sm" @click="downloadTemplate('xlsx')">XLSX 模板</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;font-size:15px">选择题库</h3>
      <div v-if="banks.length === 0" style="color:var(--text-muted);font-size:14px">暂无题库</div>
      <div class="bank-grid">
        <button
          v-for="b in banks" :key="b.id"
          class="bank-card" :class="{ selected: b.id === selectedId }"
          @click="selectBank(b.id)"
        >
          <strong>{{ b.name }}</strong>
          <span v-if="b.is_default" class="badge">默认</span>
          <small>共 {{ b.total }} 题 · 单选 {{ b.counts['单选'] || 0 }} / 多选 {{ b.counts['多选'] || 0 }} / 判断 {{ b.counts['判断'] || 0 }}</small>
        </button>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <input v-model="newBankName" placeholder="新题库名称" maxlength="60" class="text-input" />
        <button class="btn btn-primary btn-sm" :disabled="!newBankName.trim() || busy" @click="createBank">新建题库</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;font-size:15px">导入题目</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
        支持 .json / .csv / .xlsx，单文件 ≤ 10 MB、≤ 10000 行。选择题必须填 A-D 四个选项；判断题 answer 填 对/错。
      </p>
      <div class="import-row">
        <input ref="fileInput" type="file" accept=".json,.csv,.xlsx" @change="onFile" />
        <select v-model="mode" class="text-input">
          <option value="append">追加（external_id 冲突报错）</option>
          <option value="upsert">按 external_id 更新</option>
          <option value="replace">整库替换（归档旧题）</option>
        </select>
        <button class="btn btn-outline btn-sm" :disabled="!file || !selectedId || busy" @click="validateFile">
          {{ busy && stage === 'validate' ? '校验中...' : '先校验' }}
        </button>
        <button class="btn btn-primary btn-sm" :disabled="!file || !selectedId || busy" @click="doImport">
          {{ busy && stage === 'import' ? '导入中...' : '正式导入' }}
        </button>
      </div>
      <p v-if="fileName" style="font-size:12px;color:var(--text-muted);margin-top:8px">已选择：{{ fileName }}</p>
    </div>

    <div v-if="report" class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0;font-size:15px">校验结果</h3>
        <button v-if="report.errors.length" class="btn btn-outline btn-sm" @click="downloadReportCsv">下载错误 CSV</button>
      </div>
      <div class="stats">
        <span>总行数 <b>{{ report.total }}</b></span>
        <span class="ok">可导入 <b>{{ report.validCount }}</b></span>
        <span :class="{ bad: report.errorCount }">错误 <b>{{ report.errorCount }}</b></span>
        <span class="warn">警告 <b>{{ report.warningCount }}</b></span>
      </div>
      <div v-if="report.errors.length" class="table-wrap">
        <table>
          <thead><tr><th>行</th><th>字段</th><th>错误码</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in report.errors.slice(0, 100)" :key="i">
              <td>{{ e.row }}</td><td>{{ e.field }}</td><td><code>{{ e.code }}</code></td><td>{{ e.message }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="report.errors.length > 100" class="hint">仅显示前 100 条，完整内容请下载 CSV。</p>
      </div>
      <div v-if="report.warnings && report.warnings.length" style="margin-top:12px">
        <p class="hint">警告（{{ report.warnings.length }}）</p>
        <ul class="warn-list">
          <li v-for="(w, i) in report.warnings.slice(0, 20)" :key="i">第 {{ w.row }} 行：{{ w.message }}</li>
        </ul>
      </div>
      <div v-if="importResult" class="result-box">
        导入完成：新增 {{ importResult.stats.created }}，更新 {{ importResult.stats.updated }}，
        归档 {{ importResult.stats.archived }}，批次 #{{ importResult.batchId }}
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;font-size:15px">导入历史</h3>
      <div v-if="history.length === 0" style="color:var(--text-muted);font-size:14px">暂无导入记录</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr><th>批次</th><th>文件</th><th>模式</th><th>结果</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td>#{{ h.id }}</td>
              <td class="ellipsis" :title="h.filename">{{ h.filename || '-' }}</td>
              <td>{{ modeLabel(h.mode) }}</td>
              <td>
                <span :class="statusClass(h.status)">{{ statusLabel(h.status) }}</span>
                <small style="color:var(--text-muted)"> +{{ h.created_count }} / ~{{ h.updated_count }} / -{{ h.archived_count }}</small>
              </td>
              <td>{{ formatDate(h.created_at) }}</td>
              <td>
                <button
                  v-if="h.status === 'success'"
                  class="btn btn-sm btn-outline" :disabled="busy"
                  @click="rollback(h)"
                >回滚</button>
                <button
                  v-if="h.status === 'failed'"
                  class="btn btn-sm btn-outline" @click="downloadBatchErrors(h.id)"
                >错误 CSV</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import api from "../api/index.js";

const banks = ref([]);
const selectedId = ref(null);
const newBankName = ref("");
const file = ref(null);
const fileName = ref("");
const fileInput = ref(null);
const mode = ref("append");
const report = ref(null);
const importResult = ref(null);
const history = ref([]);
const busy = ref(false);
const stage = ref("");

const modeLabel = (m) => ({ append: "追加", upsert: "更新", replace: "替换" }[m] || m);
const statusLabel = (s) => ({ success: "成功", failed: "校验失败", importing: "进行中", rolled_back: "已回滚" }[s] || s);
const statusClass = (s) => ({ success: "tag ok", failed: "tag bad", rolled_back: "tag", importing: "tag warn" }[s] || "tag");

function formatDate(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 19);
}

async function loadBanks() {
  const res = await api.get("/admin/banks");
  banks.value = res.data;
  if (selectedId.value && !banks.value.some(b => b.id === selectedId.value)) selectedId.value = null;
  if (!selectedId.value && banks.value.length) selectBank(banks.value[0].id);
}

function selectBank(id) {
  selectedId.value = id;
  report.value = null;
  importResult.value = null;
  loadHistory();
}

async function loadHistory() {
  if (!selectedId.value) { history.value = []; return; }
  const res = await api.get("/admin/imports", { params: { bank_id: selectedId.value } });
  history.value = res.data;
}

async function createBank() {
  if (!newBankName.value.trim()) return;
  busy.value = true;
  try {
    const res = await api.post("/admin/banks", { name: newBankName.value.trim() });
    newBankName.value = "";
    await loadBanks();
    selectBank(res.data.id);
  } catch (e) {
    alert(e.response?.data?.error || e.message);
  } finally { busy.value = false; }
}

function onFile(event) {
  const f = event.target.files?.[0];
  file.value = f || null;
  fileName.value = f?.name || "";
  report.value = null;
  importResult.value = null;
}

function buildForm(includeMode) {
  const fd = new FormData();
  fd.append("file", file.value);
  if (includeMode) fd.append("mode", mode.value);
  return fd;
}

async function validateFile() {
  busy.value = true; stage.value = "validate";
  try {
    const res = await api.post(`/admin/banks/${selectedId.value}/validate`, buildForm(false));
    report.value = res.data;
    importResult.value = null;
  } catch (e) {
    alert(e.response?.data?.error || e.message);
  } finally { busy.value = false; stage.value = ""; }
}

async function doImport() {
  if (mode.value === "replace") {
    const bank = banks.value.find(b => b.id === selectedId.value);
    if (!window.confirm(`将归档「${bank?.name}」的现有题目并导入新题，确定？`)) return;
  }
  busy.value = true; stage.value = "import";
  try {
    const res = await api.post(`/admin/banks/${selectedId.value}/import`, buildForm(true));
    importResult.value = res.data;
    report.value = { total: res.data.stats.created + res.data.stats.updated, validCount: res.data.stats.created + res.data.stats.updated, errorCount: 0, warningCount: res.data.warnings?.length || 0, errors: [], warnings: res.data.warnings || [] };
    await loadBanks();
    await loadHistory();
  } catch (e) {
    const data = e.response?.data;
    if (data?.report) {
      report.value = data.report;
      importResult.value = null;
      await loadHistory();
    } else {
      alert(data?.error || e.message);
    }
  } finally { busy.value = false; stage.value = ""; }
}

async function rollback(batch) {
  if (!window.confirm(`回滚批次 #${batch.id}？新增题目会被删除，更新/替换会恢复原值。`)) return;
  busy.value = true;
  try {
    await api.post(`/admin/imports/${batch.id}/rollback`);
    await loadBanks();
    await loadHistory();
  } catch (e) {
    const data = e.response?.data;
    if (data?.conflicts) {
      alert(data.error + "\n" + data.conflicts.slice(0, 5).map(c => `#${c.id} ${c.message}`).join("\n"));
    } else {
      alert(data?.error || e.message);
    }
  } finally { busy.value = false; }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function downloadTemplate(format) {
  const res = await api.get(`/admin/template.${format}`, { responseType: "blob" });
  saveBlob(res.data, `question-template.${format}`);
}

async function downloadBatchErrors(batchId) {
  const res = await api.get(`/admin/imports/${batchId}/errors.csv`, { responseType: "blob" });
  saveBlob(res.data, `import-${batchId}-errors.csv`);
}

function downloadReportCsv() {
  if (!report.value?.errors?.length) return;
  const esc = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = ["row,external_id,field,code,message"];
  for (const e of report.value.errors) lines.push([e.row, e.external_id, e.field, e.code, e.message].map(esc).join(","));
  saveBlob(new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), "import-errors.csv");
}

onMounted(loadBanks);
</script>

<style scoped>
.bank-page { max-width: 1100px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.bank-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.bank-card { text-align: left; border: 1.5px solid var(--border); background: #fff; border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; }
.bank-card.selected { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.bank-card small { color: var(--text-muted); font-size: 12px; line-height: 1.5; }
.badge { align-self: flex-start; font-size: 11px; background: var(--primary-light); color: var(--primary); border-radius: 4px; padding: 1px 6px; }
.text-input { padding: 7px 10px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 14px; }
.import-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.stats { display: flex; gap: 18px; flex-wrap: wrap; margin: 12px 0; font-size: 13px; color: var(--text-muted); }
.stats b { color: var(--text); }
.stats .ok b { color: #15803d; }
.stats .bad b { color: #dc2626; }
.stats .warn b { color: #b45309; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
th { color: var(--text-muted); font-weight: 600; }
.ellipsis { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint { font-size: 12px; color: var(--text-muted); margin-top: 6px; }
.warn-list { margin: 6px 0 0 18px; font-size: 12px; color: #b45309; line-height: 1.7; }
.result-box { margin-top: 12px; padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; color: #15803d; }
.tag { font-size: 12px; padding: 1px 6px; border-radius: 4px; background: #f1f5f9; color: var(--text-muted); }
.tag.ok { background: #dcfce7; color: #15803d; }
.tag.bad { background: #fee2e2; color: #dc2626; }
.tag.warn { background: #fef3c7; color: #b45309; }
@media (max-width: 640px) {
  .import-row { flex-direction: column; align-items: stretch; }
  .ellipsis { max-width: 120px; }
}
</style>
