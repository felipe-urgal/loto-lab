import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Redesign V2 quality gate remains wired to current product surfaces", async () => {
  const [packageSource, e2e, template, design, foundation, html] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("scripts/e2eReadability.mjs", "utf8"),
    readFile(".github/PULL_REQUEST_TEMPLATE.md", "utf8"),
    readFile("docs/design/REDESIGN_V2.md", "utf8"),
    readFile("web/ui-foundation.css", "utf8"),
    readFile("web/index.html", "utf8"),
  ]);

  const pkg = JSON.parse(packageSource) as { scripts?: Record<string, string> };
  const redesignE2e = pkg.scripts?.["test:e2e:redesign"] ?? "";
  assert.match(redesignE2e, /e2eBrowser\.mjs/);
  assert.match(redesignE2e, /e2eAnalysisLotteries\.mjs/);
  assert.match(redesignE2e, /e2eGeneratorV2\.mjs/);
  assert.match(redesignE2e, /e2eReadability\.mjs/);
  assert.match(redesignE2e, /e2eCriticalRoutes\.mjs/);
  assert.doesNotMatch(redesignE2e, /e2eMyGamesV2|e2eOperationalFlows/);
  assert.equal(pkg.scripts?.["test:e2e"], "npm run test:e2e:redesign");

  assert.match(e2e, /name: "desktop", width: 1440, height: 900/);
  assert.match(e2e, /name: "tablet", width: 820, height: 1180/);
  assert.match(e2e, /name: "mobile", width: 390, height: 844/);
  assert.match(e2e, /MIN_FONT_PX = 16/);
  assert.match(e2e, /MIN_CONTROL_PX = 44/);
  assert.match(e2e, /MAX_CLS = 0\.25/);
  assert.match(e2e, /MAX_DOM_READY_MS = 5000/);
  assert.match(e2e, /auditDocumentOverflow/);
  assert.match(e2e, /auditControls/);
  assert.match(e2e, /auditKeyboardFocus/);
  assert.match(e2e, /auditReducedMotion/);
  assert.match(e2e, /auditLiveFeedback/);
  assert.match(e2e, /auditPerformance/);
  assert.match(e2e, /Page\.addScriptToEvaluateOnNewDocument/);

  assert.match(foundation, /\.button, \.link-button \{ min-height: var\(--control-min-size\)/);
  assert.match(foundation, /\.button\.compact \{ min-height: var\(--control-min-size\)/);
  assert.match(html, /id="content" aria-live="polite"/);
  assert.match(html, /id="data-status-bar" aria-live="polite"/);
  assert.match(html, /id="toast-root" aria-live="assertive"/);

  assert.match(template, /npm run test:e2e:redesign/);
  assert.match(template, /1440×900, tablet 820×1180 e mobile 390×844/);
  assert.match(template, /alvos mínimos de 44px/);
  assert.match(template, /prefers-reduced-motion/);

  assert.match(design, /## Gate final de qualidade/);
  assert.match(design, /CLS acumulado até 0,25/);
  assert.match(design, /number-draw-secondary/);
  assert.match(design, /sports-prediction/);
  assert.match(design, /instant-product/);
});
