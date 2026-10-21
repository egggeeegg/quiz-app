<template>
  <div class="auth-page">
    <div class="auth-card card">
      <h2>注册</h2>
      <form @submit.prevent="register">
        <input v-model="username" placeholder="用户名" required minlength="2" />
        <input v-model="password" type="password" placeholder="密码" required minlength="4" />
        <input v-model="confirm" type="password" placeholder="确认密码" required />
        <input v-model="inviteCode" placeholder="邀请码" required style="text-transform:uppercase" />
        <p class="error" v-if="error">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="loading">{{ loading ? '注册中...' : '注册' }}</button>
      </form>
      <p style="margin-top:12px;font-size:13px;color:var(--text-muted)">
        已有账号？<router-link to="/login">登录</router-link>
      </p>
    </div>
  </div>
</template>
<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import api from "../api/index.js";
import { saveSession } from "../utils/session.js";
const router = useRouter();
const username = ref(""); const password = ref(""); const confirm = ref(""); const inviteCode = ref(""); const error = ref(""); const loading = ref(false);
async function register() {
  error.value = "";
  if (password.value !== confirm.value) { error.value = "两次密码不一致"; return; }
  if (!inviteCode.value.trim()) { error.value = "请输入邀请码"; return; }
  loading.value = true;
  try {
    const res = await api.post("/auth/register", { username: username.value, password: password.value, invite_code: inviteCode.value.trim() });
    saveSession(res.data);
    router.replace("/exam");
  } catch (e) { error.value = e.response?.data?.error || "注册失败"; }
  finally { loading.value = false; }
}
</script>
<style scoped>
.auth-page { display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px; }
.auth-card { width:100%;max-width:380px; }
.auth-card h2 { margin-bottom:20px; }
.auth-card input { width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;margin-bottom:12px; }
.auth-card input:focus { outline:none;border-color:var(--primary); }
.auth-card .btn { width:100%;justify-content:center; }
.error { color:var(--wrong);font-size:13px;margin-bottom:8px; }
</style>
