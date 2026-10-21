<template>
  <NavBar v-if="isLoggedIn" />
  <router-view />
</template>

<script setup>
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import NavBar from "./components/NavBar.vue";

/* localStorage is not reactive: refresh on every navigation (login/logout). */
const route = useRoute();
const isLoggedIn = ref(!!localStorage.getItem("token"));
watch(() => route.fullPath, () => {
  isLoggedIn.value = !!localStorage.getItem("token");
});

/* Drop the inline background left by older versions; the body uses --bg. */
document.body.style.backgroundImage = "none";
</script>

<style>
:root {
  --primary: #4f6ef7;
  --primary-light: #eef1ff;
  --correct: #22c55e;
  --wrong: #ef4444;
  --border: #e2e8f0;
  --bg: #f1f5f9;
  --card: #fff;
  --text: #1e293b;
  --text-muted: #64748b;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
  padding: 24px;
  margin-bottom: 16px;
}

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 500; cursor: pointer;
  transition: all .15s;
}
.btn-primary { background: #fff; color: var(--primary); border: 1px solid var(--primary); }
.btn-primary:hover { background: var(--primary-light); }
.btn-outline { background: #fff; color: var(--primary); border: 1px solid var(--primary); }
.btn-outline:hover { background: var(--primary-light); }
.btn-danger { background: #fff; color: var(--wrong); border: 1px solid var(--wrong); }
.btn-sm { padding: 5px 12px; font-size: 13px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
