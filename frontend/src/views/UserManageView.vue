<template>
  <div class="user-manage-container">
    <div class="card">
      <h2 style="margin:0">👥 用户管理</h2>
    </div>

    <div class="card">
      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>
      <div v-else-if="users.length === 0" style="text-align:center;padding:40px;color:var(--text-muted)">暂无用户</div>
      <table v-else style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px">ID</th>
            <th style="text-align:left;padding:8px">用户名</th>
            <th style="text-align:center;padding:8px">角色</th>
            <th style="text-align:center;padding:8px">考试次数</th>
            <th style="text-align:center;padding:8px">错题数</th>
            <th style="text-align:left;padding:8px">注册时间</th>
            <th style="text-align:center;padding:8px">状态</th>
            <th style="text-align:center;padding:8px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" style="border-bottom:1px solid var(--border)">
            <td style="padding:10px 8px;color:var(--text-muted)">{{ u.id }}</td>
            <td style="padding:10px 8px;font-weight:500">
              {{ u.username }}
              <span v-if="u.id === currentUserId" style="font-size:11px;color:var(--text-muted);margin-left:4px">(当前账户)</span>
            </td>
            <td style="text-align:center;padding:10px 8px">
              <span v-if="u.role === 'admin'" style="display:inline-block;padding:2px 8px;border-radius:4px;background:#fce7f3;color:#be185d;font-size:12px;font-weight:600">admin</span>
              <span v-else style="display:inline-block;padding:2px 8px;border-radius:4px;background:#dbeafe;color:#1d4ed8;font-size:12px">user</span>
            </td>
            <td style="text-align:center;padding:10px 8px">{{ u.exam_count }}</td>
            <td style="text-align:center;padding:10px 8px">{{ u.mistake_count }}</td>
            <td style="padding:10px 8px;color:var(--text-muted)">{{ formatDate(u.created_at) }}</td>
            <td style="text-align:center;padding:10px 8px">
              <span v-if="u.kicked_at" style="display:inline-block;padding:2px 8px;border-radius:4px;background:#fef3c7;color:#d97706;font-size:12px">已踢</span>
              <span v-else style="display:inline-block;padding:2px 8px;border-radius:4px;background:#d1fae5;color:#059669;font-size:12px">在线</span>
            </td>
            <td style="text-align:center;padding:10px 8px">
              <template v-if="u.id !== currentUserId && u.role !== 'admin'">
                <div style="display:flex;gap:4px;justify-content:center">
                  <button v-if="!u.kicked_at" class="btn btn-sm btn-outline" @click="kickUser(u)" :disabled="u._kicking">{{ u._kicking ? '踢出中...' : '踢下线' }}</button>
                  <button v-if="u.kicked_at" class="btn btn-sm btn-success" @click="unkickUser(u)" :disabled="u._unkicking">{{ u._unkicking ? '解封中...' : '解封' }}</button>
                  <button v-if="bannedDeviceIds.has(u.last_device_id)" class="btn btn-sm btn-success" @click="unbanDevice(u)" :disabled="u._unbanning">{{ u._unbanning ? "解封中..." : "解封设备" }}</button><button v-else class="btn btn-sm btn-outline" @click="banDevice(u)" :disabled="!u.last_device_id || u._banning" style="border-color:#d97706;color:#d97706">{{ u.last_device_id ? (u._banning ? "封禁中..." : "封禁设备") : "无设备" }}</button>
                  <button class="btn btn-sm btn-danger" @click="confirmDelete(u)">删除</button>
                </div>
              </template>
              <span v-else style="font-size:12px;color:var(--text-muted)">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Delete confirmation modal -->
    <div v-if="deleteTarget" class="modal-overlay" @click="deleteTarget = null">
      <div class="modal" @click.stop>
        <h3 style="margin-bottom:12px">确认删除用户</h3>
        <p>确定要删除用户 <strong>{{ deleteTarget.username }}</strong> 吗？</p>
        <p style="font-size:13px;color:var(--wrong);margin-top:8px">该用户的所有考试记录和错题数据将被永久删除，不可恢复。</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-outline btn-sm" @click="deleteTarget = null">取消</button>
          <button class="btn btn-danger btn-sm" @click="doDelete" :disabled="deleting">
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import api from "../api/index.js";

const users = ref([]);
const bannedDeviceIds = ref(new Set());
const loading = ref(false);
const deleting = ref(false);
const deleteTarget = ref(null);
const currentUserId = ref(parseInt(localStorage.getItem("user_id") || "0", 10));

async function loadBannedDevices() {
  try {
    const res = await api.get("/device-bans");
    bannedDeviceIds.value = new Set(res.data.map(b => b.device_id));
  } catch (e) { console.error("加载封禁列表失败:", e.message); }
}

async function loadUsers() {
  loading.value = true;
  try {
    const res = await api.get("/users");
    users.value = res.data;
  } catch (e) {
    alert("加载用户列表失败: " + (e.response?.data?.error || e.message));
  } finally {
    loading.value = false;
  }
}

function confirmDelete(u) {
  deleteTarget.value = u;
}

async function kickUser(u) {
  if (!confirm('确定要将用户 ' + u.username + ' 踢下线吗？')) return;
  u._kicking = true;
  try {
    await api.post('/users/' + u.id + '/kick');
    u.kicked_at = Math.floor(Date.now() / 1000);
    alert('用户已被踢下线');
  } catch (e) {
    alert('踢用户失败: ' + (e.response?.data?.error || e.message));
  } finally {
    u._kicking = false;
  }
}

async function unkickUser(u) {
  if (!confirm('确定要解封用户 ' + u.username + ' 吗？')) return;
  u._unkicking = true;
  try {
    await api.post('/users/' + u.id + '/unkick');
    u.kicked_at = null;
  } catch (e) {
    alert('解封失败: ' + (e.response?.data?.error || e.message));
  } finally {
    u._unkicking = false;
  }
}

async function unbanDevice(u) {
  u._unbanning = true;
  try {
    const bans = await api.get('/device-bans');
    const ban = bans.data.find(b => b.device_id === u.last_device_id);
    if (ban) {
      await api.delete('/device-bans/' + ban.id);
      bannedDeviceIds.value.delete(u.last_device_id);
      alert('设备已解封');
    }
  } catch (e) {
    alert('解封失败: ' + (e.response?.data?.error || e.message));
  } finally {
    u._unbanning = false;
  }
}

async function banDevice(u) {
  if (!confirm('确定要封禁用户 ' + u.username + ' 的设备吗？该用户将无法登录。')) return;
  u._banning = true;
  try {
    await api.post('/device-bans', { device_id: u.last_device_id, reason: '管理员封禁 - ' + u.username });
    alert('设备已封禁');
  } catch (e) {
    alert('封禁失败: ' + (e.response?.data?.error || e.message));
  } finally {
    u._banning = false;
  }
}
async function doDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await api.delete(`/users/${deleteTarget.value.id}`);
    users.value = users.value.filter(x => x.id !== deleteTarget.value.id);
    deleteTarget.value = null;
  } catch (e) {
    alert("删除失败: " + (e.response?.data?.error || e.message));
  } finally {
    deleting.value = false;
  }
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + pad(dt.getMonth()+1) + "-" + pad(dt.getDate()) + " " + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
}

onMounted(() => { loadUsers(); loadBannedDevices(); });
</script>

<style scoped>
.user-manage-container { max-width: 900px; margin: 0 auto; padding: 24px; }
.btn-success { background: #059669; color: #fff; }
.btn-success:hover { background: #047857; }
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.3); display: flex; align-items: center;
  justify-content: center; z-index: 1000;
}
.modal {
  background: #fff; border-radius: 12px; padding: 24px;
  max-width: 420px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,.15);
}
@media (max-width: 600px) {
  .user-manage-container { padding: 12px; }
  table, thead, tbody, tr, th, td { display: block; }
  thead tr { position: absolute; top: -9999px; left: -9999px; }
  td { padding: 6px 8px !important; border-bottom: none; }
}
</style>
