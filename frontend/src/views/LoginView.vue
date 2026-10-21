<template>
  <div class="auth-page">
    <div class="auth-card card">
      <h2>登录</h2>
      <form @submit.prevent="login">
        <input v-model="username" placeholder="用户名" required minlength="2" />
        <input v-model="password" type="password" placeholder="密码" required minlength="4" />
        <p class="error" v-if="error">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="loading">{{ loading ? '登录中...' : '登录' }}</button>
      </form>
      <p style="margin-top:12px;font-size:13px;color:var(--text-muted)">
        没有账号？<router-link to="/register">注册</router-link>
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
const username = ref(""); const password = ref(""); const error = ref(""); const loading = ref(false);
async function login() {
  error.value = ""; loading.value = true;
  try {
    const res = await api.post("/auth/login", { username: username.value, password: password.value });
    /* Replace session keys only; device_id stays for ban enforcement */
    saveSession(res.data);
    router.replace("/exam");
  } catch (e) { error.value = e.response?.data?.error || "登录失败"; }
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
