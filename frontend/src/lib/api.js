import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export const TOKEN_KEY = "padhlyebhaiai_token";
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const api = axios.create({ baseURL: API_BASE, timeout: 120000 });

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    "X-Timezone": timezone,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

api.interceptors.request.use((config) => {
  Object.assign(config.headers, authHeaders());
  return config;
});

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// Tell the app to refresh the AI-usage meter after actions that may have used AI.
let usageTimer;
export function signalUsageChanged() {
  clearTimeout(usageTimer);
  usageTimer = setTimeout(() => window.dispatchEvent(new Event("plb:usage")), 300);
}

api.interceptors.response.use(
  (r) => {
    if (r.config?.method === "post" && !r.config.url?.includes("/auth/")) signalUsageChanged();
    return r;
  },
  (error) => {
    if (error?.response?.status === 401 && !error.config?.url?.includes("/auth/login")) {
      onUnauthorized();
    }
    if (error?.response?.status === 402) signalUsageChanged();
    return Promise.reject(error);
  },
);

export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (err?.code === "ECONNABORTED") return "The request took too long. Please try again.";
  if (!err?.response) return err?.message === "Network Error" ? "Can't reach the server. Is the backend running?" : fallback;
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error, /, "");
  return fallback;
}

/** POST multipart form data and stream the plain-text response chunk by chunk. */
export async function streamPost(path, formData, onChunk, signal) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
    signal,
  });
  if (!response.ok) {
    let detail = "The tutor couldn't answer right now.";
    try {
      detail = (await response.json()).detail || detail;
    } catch {
      /* not JSON */
    }
    if (response.status === 401) onUnauthorized();
    if (response.status === 402) signalUsageChanged();
    throw new Error(detail);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    full += text;
    onChunk(full);
  }
  return full;
}

export default api;
