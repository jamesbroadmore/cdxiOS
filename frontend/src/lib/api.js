import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: false,
});

// Attach token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 redirect to login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.includes("/login")) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function getErrorMessage(err, fallback = "Something went wrong") {
  return err?.response?.data?.detail || err?.message || fallback;
}

export function formatCurrency(value, currency = "AUD") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value.includes("T") ? value : value + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return value;
  }
}

export function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function isPastDate(value) {
  if (!value) return false;
  try {
    const d = new Date(value.includes("T") ? value : value + "T00:00:00");
    return d < new Date();
  } catch {
    return false;
  }
}

export function formatDuration(secs) {
  if (!secs) return "0m";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
