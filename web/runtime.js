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

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
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
