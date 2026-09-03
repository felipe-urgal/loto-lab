import {
  currentMainView,
  onMainViewChanged,
  onViewRendered,
  type ViewRenderedDetail,
} from "../../core/viewLifecycle.js";
import { installGenerationExplainability } from "./explainability.js";
import { installGenerationReadiness } from "./readiness.js";

const root = document.querySelector<HTMLElement>("#content");
let lifecycleToken = 0;
let cleanupCurrent: (() => void) | null = null;

function cleanupEnhancements(): void {
  lifecycleToken += 1;
  cleanupCurrent?.();
  cleanupCurrent = null;
}

function scheduleEnhancements(detail: ViewRenderedDetail): void {
  cleanupCurrent?.();
  cleanupCurrent = null;
  const token = ++lifecycleToken;
  if (!root || detail.view !== "generate" || currentMainView() !== "generate") return;

  let mountedShell: HTMLElement | null = null;
  let cleanupLayers: (() => void) | null = null;

  const mountCurrentShell = (): void => {
    if (token !== lifecycleToken || currentMainView() !== "generate") return;

    const shell = root.querySelector<HTMLElement>(".g2-shell");
    if (!shell || shell === mountedShell) return;

    cleanupLayers?.();
    mountedShell = shell;
    const cleanupReadiness = installGenerationReadiness(shell);
    const cleanupExplainability = installGenerationExplainability(shell);
    cleanupLayers = () => {
      cleanupExplainability();
      cleanupReadiness();
    };
  };

  // The owner can replace an existing workspace after an async plan refresh.
  // Watch only direct root replacements so enhancements follow the new shell
  // without observing the high-volume mutations inside the workspace itself.
  const rootObserver = new MutationObserver(mountCurrentShell);
  rootObserver.observe(root, { childList: true });
  mountCurrentShell();

  cleanupCurrent = () => {
    rootObserver.disconnect();
    cleanupLayers?.();
    cleanupLayers = null;
    mountedShell = null;
  };
}

onViewRendered((detail) => {
  if (detail.view === "generate") scheduleEnhancements(detail);
  else cleanupEnhancements();
});

onMainViewChanged((view) => {
  if (view !== "generate") cleanupEnhancements();
});
