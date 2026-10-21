import axios from "axios";
import { clearSession, getDeviceId } from "../utils/session.js";

const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

// Attach JWT token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Device id is persistent: clearing it would defeat device bans
  config.headers["X-Device-Id"] = getDeviceId();
  return config;
});

// Redirect on 401
api.interceptors.response.use(
  (res) => {
    /* Bug fix: normalize exam.id types to prevent string vs number mismatch */
    if (res.config.url === '/exams/history' && Array.isArray(res.data)) {
      res.data.forEach(exam => {
        exam.id = Number(exam.id);
        exam.mistakeCount = Number(exam.mistakeCount || 0);
        if (Array.isArray(exam.mistakes)) {
          exam.mistakes.forEach(m => {
            m.exam_result_id = m.exam_result_id != null ? Number(m.exam_result_id) : null;
          });
        }
      });
    }
    return res;
  },
  (err) => {
    if (err.response && err.response.status === 403 && err.response.data?.code === 'DEVICE_BANNED') {
      alert('该设备已被封禁，请联系管理员');
      return Promise.reject(err);
    }
    if (err.response && err.response.status === 401) {
      /* Clear session keys only — device_id must survive so bans still apply */
      clearSession();
      window.location.href = "/#/login";
    }
    console.error("[API Error]", err.config?.url, err.response?.status, err.response?.data?.error || err.message);
    return Promise.reject(err);
  }
);

export default api;
