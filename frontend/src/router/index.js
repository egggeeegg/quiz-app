import { createRouter, createWebHashHistory } from "vue-router";
import LoginView from "../views/LoginView.vue";
import RegisterView from "../views/RegisterView.vue";
import ExamView from "../views/ExamView.vue";
import MistakesView from "../views/MistakesView.vue";
import AdminView from "../views/AdminView.vue";
import UserManageView from "../views/UserManageView.vue";
import BankManageView from "../views/BankManageView.vue";

const routes = [
  { path: "/", redirect: "/login" },
  { path: "/login", name: "Login", component: LoginView },
  { path: "/register", name: "Register", component: RegisterView },
  { path: "/exam", name: "Exam", component: ExamView, meta: { requiresAuth: true } },
  { path: "/mistakes", name: "Mistakes", component: MistakesView, meta: { requiresAuth: true } },
  { path: "/admin", name: "Admin", component: AdminView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: "/admin/users", name: "UserManage", component: UserManageView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: "/admin/banks", name: "BankManage", component: BankManageView, meta: { requiresAuth: true, requiresAdmin: true } },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "";
  if (to.meta.requiresAuth && !token) {
    next("/login");
  } else if (to.meta.requiresAdmin && role !== "admin") {
    next("/exam");
  } else {
    next();
  }
});

export default router;
