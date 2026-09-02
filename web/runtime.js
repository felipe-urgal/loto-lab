export { ApiError, API, api } from "./src/core/api.js";
export { escapeHtml } from "./src/shared/escaping.js";
export {
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "./src/shared/formatters.js";

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
