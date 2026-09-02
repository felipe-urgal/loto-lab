export { ApiError, API, api } from "./src/core/api.js";
export {
  VIEW_RENDERED_EVENT,
  currentMainView,
  emitViewRendered,
  mainViewFromHash,
  onViewRendered,
} from "./src/core/viewLifecycle.js";
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
