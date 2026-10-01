import { execFileSync } from "node:child_process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      // Try next browser.
    }
  }
  throw new Error("Chrome/Chromium executable was not found on the runner");
}

function dumpDom(path) {
  return execFileSync(findChrome(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--virtual-time-budget=2200",
    "--dump-dom",
    `${baseUrl}${path}`,
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function expectIncludes(html, values, route) {
  for (const value of values) {
    if (!html.includes(value)) throw new Error(`${route} browser DOM is missing expected marker: ${value}`);
  }
}

const cases = [
  ["/lab", ["Análises", "a2-shell"]],
  ["/strategies", ["Análises", "a2-shell"]],
  ["/ai", ["Análises", "a2-shell"]],
  ["/jobs", ["Painel", "dashboard-shell", "Seus jogos"]],
  ["/agenda", ["Painel", "dashboard-shell", "Resultados recentes"]],
];

for (const [route, markers] of cases) {
  const html = dumpDom(route);
  expectIncludes(html, markers, route);
  if (html.includes("data-nav-more")) throw new Error(`${route} still rendered the removed More navigation`);
  console.log(`browser redirect smoke ok: ${route}`);
}
