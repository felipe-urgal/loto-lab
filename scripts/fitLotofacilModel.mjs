// Reajusta o modelo da Lotofácil (src/generator/lotofacilModel.ts).
// Uso: node scripts/fitLotofacilModel.mjs [baseUrl]   (padrão http://localhost:5200)
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const LAMBDA = 30;
const RETURN_FROM = "2023-01-01";

const contests = [];
for (let start = 1; ; start += 200) {
  const response = await fetch(`${baseUrl}/api/v1/contests/lotofacil?startContest=${start}&endContest=${start + 199}&order=asc&limit=200`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { items } = await response.json();
  if (items.length === 0) break;
  contests.push(...items);
}
const N = contests.length;

// 1) Popularidade: ridge de log(ganhadores_13/arrecadação), efeito fixo por ano.
const usable = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length === 5 && c.prizeTiers[2].winners > 0);
const byYear = new Map();
for (const c of usable) byYear.set(c.date.slice(0, 4), [...(byYear.get(c.date.slice(0, 4)) ?? []), c]);
const k = 25;
const a = Array.from({ length: k }, () => Array(k + 1).fill(0));
for (const group of byYear.values()) {
  const logs = group.map((c) => Math.log(c.prizeTiers[2].winners / c.amountCollected));
  const mean = logs.reduce((x, y) => x + y) / logs.length;
  group.forEach((c, index) => {
    for (const i of c.numbers) {
      for (const j of c.numbers) a[i - 1][j - 1] += 1;
      a[i - 1][k] += logs[index] - mean;
    }
  });
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
const betaMean = beta.reduce((x, y) => x + y) / k;

// 2) Viés de frequência: encolhimento por validação cruzada em 10 blocos + tilt de Poisson condicional.
const deviations = (set) => {
  const f = Array(k).fill(0);
  for (const c of set) for (const n of c.numbers) f[n - 1] += 1;
  return f.map((v) => v / set.length - 0.6);
};
const blocks = 10;
const size = Math.floor(N / blocks);
let num = 0;
let den = 0;
for (let b = 0; b < blocks; b += 1) {
  const rest = [...contests.slice(0, b * size), ...contests.slice((b + 1) * size)];
  const rd = deviations(rest);
  const td = deviations(contests.slice(b * size, (b + 1) * size));
  rd.forEach((v, i) => { num += v * td[i]; den += v * v; });
}
const shrink = num / den;
const raw = deviations(contests).map((d) => 0.6 + shrink * d);
const sum = raw.reduce((x, y) => x + y);
const target = raw.map((v) => (v * 15) / sum);
const inclusion = (theta) => {
  const x = theta.map(Math.exp);
  const e = (skip) => {
    const d = Array(16).fill(0);
    d[0] = 1;
    x.forEach((v, i) => { if (i !== skip) for (let m = 15; m >= 1; m -= 1) d[m] += d[m - 1] * v; });
    return d;
  };
  const full = e(-1)[15];
  return x.map((v, i) => (v * e(i)[14]) / full);
};
let theta = Array(k).fill(0);
for (let it = 0; it < 300; it += 1) {
  const q = inclusion(theta);
  theta = theta.map((t, i) => t + Math.log(target[i] / q[i]));
}
const thetaMean = theta.reduce((x, y) => x + y) / k;

// 3) Retorno médio por faixa (fração da arrecadação), era recente.
const recent = contests.filter((c) => c.date >= RETURN_FROM && c.amountCollected > 0 && c.prizeTiers?.length === 5);
const revenue = recent.reduce((s, c) => s + c.amountCollected, 0);
const returns = {};
[15, 14, 13, 12, 11].forEach((hits, t) => {
  returns[hits] = Number((recent.reduce((s, c) => s + c.prizeTiers[t].winners * c.prizeTiers[t].prizeValue, 0) / revenue).toFixed(4));
});

console.log(JSON.stringify({
  fitThroughContest: contests.at(-1).number,
  popularityContests: usable.length,
  shrink: Number(shrink.toFixed(2)),
  popularity: beta.map((v) => Number((v - betaMean).toFixed(3))),
  theta: theta.map((v) => Number((v - thetaMean).toFixed(3))),
  returns,
}));
