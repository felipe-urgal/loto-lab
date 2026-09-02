import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AI workspace follows Prototype 1 while preserving interpretation contracts", async () => {
  const [html, workspace, aiBoundary, ai] = await Promise.all([
    readFile("web/ai.html", "utf8"),
    readFile("web/ai-workspace.css", "utf8"),
    readFile("web/ai.js", "utf8"),
    readFile("web/src/features/ai.ts", "utf8"),
  ]);

  assert.doesNotMatch(html, /\/assets\/ai\.css/);
  assert.match(html, /\/assets\/ai-workspace\.css/);
  await assert.rejects(readFile("web/ai.css", "utf8"), /ENOENT/);

  assert.match(workspace, /\.ai-content > \.stack \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /\.ai-principle \{[\s\S]*display: flex[\s\S]*justify-content: space-between/);
  assert.match(workspace, /\.ai-columns \{[\s\S]*display: grid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.ai-evidence \{[\s\S]*display: grid[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.ai-provider-status\.is-ready \{[\s\S]*background: var\(--success-soft\)[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.ai-provider-status\.is-offline \{[\s\S]*background: var\(--warning-soft\)[\s\S]*color: var\(--warning\)/);
  assert.match(workspace, /#ai-run \{[\s\S]*background: var\(--accent\)/);
  assert.match(workspace, /\.ai-history-row:focus-visible \{[\s\S]*outline: 2px solid var\(--accent\)/);
  assert.match(workspace, /@media \(max-width: 640px\)[\s\S]*\.ai-evidence \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(html, /Algoritmo calcula\. IA interpreta\./);
  assert.equal(aiBoundary.trim(), 'import "./src/features/ai.js";');
  assert.match(ai, /import \{ api \} from "\.\.\/core\/api\.js"/);
  assert.match(ai, /import \{ escapeHtml \} from "\.\.\/shared\/escaping\.js"/);
  assert.match(ai, /import \{ formatDateTime, formatPercent \} from "\.\.\/shared\/formatters\.js"/);
  assert.match(ai, /api<AiStatus>\("\/ai\/status"\)/);
  assert.match(ai, /api<AiHistoryResponse>\(`\/ai\/insights\/\$\{requestedLottery\}\?limit=10`\)/);
  assert.match(ai, /api<AiInsightRecord>\("\/ai\/insights", \{/);
  assert.match(ai, /method: "POST"/);
  assert.match(ai, /force: Boolean\(forceInput\?\.checked\)/);
  assert.match(ai, /record\.reused/);
  assert.match(ai, /const token = \+\+historyLoadToken/);
  assert.match(ai, /const token = \+\+insightRequestToken/);
  assert.match(ai, /lotterySelect\.value !== requestedLottery/);
  assert.doesNotMatch(ai, /\.\/runtime\.js/);
});
