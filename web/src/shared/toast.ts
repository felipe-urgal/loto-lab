export type ToastType = "info" | "error";

export function toast(message: unknown, type: ToastType = "info"): void {
  const root = document.querySelector("#toast-root");
  if (!root) return;

  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = String(message ?? "");
  root.append(item);
  window.setTimeout(() => item.remove(), 3600);
}
