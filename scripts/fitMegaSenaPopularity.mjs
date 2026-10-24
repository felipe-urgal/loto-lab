// Reajusta o modelo de popularidade da Mega-Sena (src/generator/megaSenaPopularity.ts).
// Uso: node scripts/fitMegaSenaPopularity.mjs [baseUrl]   (padrão http://localhost:5200)
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const LAMBDA = 30;

const contests = [];
for (let start = 1; ; start += 200) {
  const response = await fetch(`${baseUrl}/api/v1/contests/mega-sena?startContest=${start}&endContest=${start + 199}&order=asc&limit=200`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { items } = await response.json();
  if (items.length === 0) break;
  contests.push(...items);
}

const usable = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.[2]?.winners > 0);
const byYear = new Map();
for (const c of usable) {
  const year = c.date.slice(0, 4);
  byYear.set(year, [...(byYear.get(year) ?? []), c]);
}
const rows = [];
for (const group of byYear.values()) {
  const logs = group.map((c) => Math.log(c.prizeTiers[2].winners / c.amountCollected));
  const mean = logs.reduce((a, b) => a + b) / logs.length;
  group.forEach((c, i) => rows.push({ numbers: c.numbers, y: logs[i] - mean }));
}

const k = 60;
const a = Array.from({ length: k }, () => Array(k + 1).fill(0));
for (const row of rows) {
  for (const i of row.numbers) {
    for (const j of row.numbers) a[i - 1][j - 1] += 1;
    a[i - 1][k] += row.y;
  }
}
for (let i = 0; i < k; i += 1) a[i][i] += LAMBDA;
for (let i = 0; i < k; i += 1) {
  let pivot = i;
  for (let r = i + 1; r < k; r += 1) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
  [a[i], a[pivot]] = [a[pivot], a[i]];
  for (let r = 0; r < k; r += 1) {
    if (r === i) continue;
    const q = a[r][i] / a[i][i];
    for (let c = i; c <= k; c += 1) a[r][c] -= q * a[i][c];
  }
}
const beta = a.map((row, i) => row[k] / row[i]);
const mean = beta.reduce((x, y) => x + y) / k;
console.log(JSON.stringify({
  fitThroughContest: contests.at(-1).number,
  contestsUsed: rows.length,
  weights: beta.map((v) => Number((v - mean).toFixed(3))),
}));
