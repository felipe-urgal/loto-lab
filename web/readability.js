const MIN_FONT_PX = 16;
const MIN_CLASS = "readability-min-text";
const CONTROL_SELECTOR = "button,input,select,textarea,option";
const SKIP_SELECTOR = "script,style,svg,path,defs,template";

function hasDirectText(element) {
  return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
}

function shouldAudit(element) {
  if (!(element instanceof Element) || element.matches(SKIP_SELECTOR)) return false;
  return element.matches(CONTROL_SELECTOR) || hasDirectText(element);
}

function enforceElement(element) {
  if (!shouldAudit(element)) return;
  const size = Number.parseFloat(getComputedStyle(element).fontSize || "0");
  if (Number.isFinite(size) && size > 0 && size < MIN_FONT_PX) element.classList.add(MIN_CLASS);
}

function enforceTree(root = document.body) {
  if (!root) return;
  if (root instanceof Element) enforceElement(root);
  root.querySelectorAll?.("*").forEach(enforceElement);
}

function scheduleEnforcement(root) {
  queueMicrotask(() => enforceTree(root instanceof Element ? root : document.body));
}

function installReadabilityFloor() {
  enforceTree(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        scheduleEnforcement(mutation.target.parentElement);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) scheduleEnforcement(node);
        else if (node.parentElement) scheduleEnforcement(node.parentElement);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installReadabilityFloor, { once: true });
else installReadabilityFloor();

export { MIN_FONT_PX, enforceTree };
