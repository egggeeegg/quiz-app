<template>
  <nav style="display:flex;align-items:center;gap:16px;padding:12px 24px;background:var(--card);border-bottom:1px solid var(--border);flex-wrap:wrap">
    <strong style="font-size:18px">刷题系统</strong>
    <router-link to="/exam" style="text-decoration:none;color:var(--primary);font-size:14px">考试</router-link>
    <router-link to="/mistakes" style="text-decoration:none;color:var(--primary);font-size:14px">📝 查看错题集</router-link>
    <router-link v-if="role === 'admin'" to="/admin" style="text-decoration:none;color:var(--primary);font-size:14px">⚙️ 邀请码管理</router-link>
    <router-link v-if="role === 'admin'" to="/admin/users" style="text-decoration:none;color:var(--primary);font-size:14px">👥 用户管理</router-link>
    <router-link v-if="role === 'admin'" to="/admin/banks" style="text-decoration:none;color:var(--primary);font-size:14px">📚 题库管理</router-link>
    <span style="margin-left:auto;font-size:13px;color:var(--text-muted)">
      {{ username }}
      <span v-if="role === 'admin'" style="display:inline-block;padding:0 6px;border-radius:4px;background:#fce7f3;color:#be185d;font-size:11px;margin-left:4px">admin</span>
    </span>
    <button class="btn btn-outline btn-sm" @click="logout">退出</button>
  </nav>
</template>

<script setup>
import { ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { clearSession } from "../utils/session.js";

const router = useRouter();
const route = useRoute();

/* Bug fix: Use ref + watch(route) instead of computed.
   computed only re-evaluates when the component re-renders.
   Vue skips re-rendering NavBar when its v-if stays true (token still exists),
   so computed never fires after login/register on the same session. */
const username = ref(localStorage.getItem("username") || "");
const role = ref(localStorage.getItem("role") || "");

watch(() => route.fullPath, () => {
  username.value = localStorage.getItem("username") || "";
  role.value = localStorage.getItem("role") || "";
});

function logout() {
  /* Keep device_id: it is the ban anchor */
  clearSession();
  router.push("/login");
}
</script>
