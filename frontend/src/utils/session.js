/* Session-only keys. Device id must survive logout: it is the ban anchor. */
const SESSION_KEYS = ["token", "username", "role", "user_id"];

export function clearSession() {
  for (const key of SESSION_KEYS) localStorage.removeItem(key);
}

export function saveSession(data) {
  clearSession();
  localStorage.setItem("token", data.token);
  localStorage.setItem("username", data.username);
  localStorage.setItem("role", data.role || "user");
  if (data.id != null) localStorage.setItem("user_id", String(data.id));
}

export function getDeviceId() {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    deviceId = newDeviceId();
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

function newDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
