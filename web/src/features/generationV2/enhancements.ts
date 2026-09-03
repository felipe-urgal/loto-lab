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

  let frame = 0;
  const waitForWorkspace = (): void => {
    if (token !== lifecycleToken || currentMainView() !== "generate") return;

    const shell = root.querySelector<HTMLElement>(".g2-shell");
    if (shell) {
      const cleanupReadiness = installGenerationReadiness(shell);
      const cleanupExplainability = installGenerationExplainability(shell);
      cleanupCurrent = () => {
        cleanupExplainability();
        cleanupReadiness();
      };
      return;
    }

    frame += 1;
    if (frame < 120) requestAnimationFrame(waitForWorkspace);
  };

  requestAnimationFrame(waitForWorkspace);
}

onViewRendered((detail) => {
  if (detail.view === "generate") scheduleEnhancements(detail);
  else cleanupEnhancements();
});

onMainViewChanged((view) => {
  if (view !== "generate") cleanupEnhancements();
});
