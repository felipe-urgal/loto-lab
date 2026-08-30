export {
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "./src/shared/formatters.js";

export const API = "/api/v1";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

export function toast(message, type = "info") {
  const root = document.querySelector("#toast-root");
  if (!root) return;
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = String(message ?? "");
  root.append(item);
  window.setTimeout(() => item.remove(), 3600);
}

export function currentMainView() {
  return location.hash.replace("#", "") || "dashboard";
}

export function onViewRendered(callback) {
  const listener = (event) => callback(event.detail || {});
  window.addEventListener("loto-lab:view-rendered", listener);
  return () => window.removeEventListener("loto-lab:view-rendered", listener);
}
