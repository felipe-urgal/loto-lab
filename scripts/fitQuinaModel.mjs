// Reajusta o modelo da Quina (src/generator/quinaModel.ts).
// Uso: node scripts/fitQuinaModel.mjs [baseUrl]   (padrão http://localhost:5200)
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const LAMBDA = 30;
const RECENT_FROM = "2023-01-01";

const contests = [];
for (let start = 1; ; start += 200) {
  const response = await fetch(`${baseUrl}/api/v1/contests/quina?startContest=${start}&endContest=${start + 199}&order=asc&limit=200`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { items } = await response.json();
  if (items.length === 0) break;
  contests.push(...items);
}

// Popularidade: ridge de log(ganhadores_terno/arrecadação), efeito fixo por ano.
const usable = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length === 4 && c.prizeTiers[2].winners > 0);
const byYear = new Map();
for (const c of usable) byYear.set(c.date.slice(0, 4), [...(byYear.get(c.date.slice(0, 4)) ?? []), c]);
const k = 80;
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

// Retorno médio e ganhadores médios por faixa (era recente).
const recent = contests.filter((c) => c.date >= RECENT_FROM && c.amountCollected > 0 && c.prizeTiers?.length === 4);
const revenue = recent.reduce((s, c) => s + c.amountCollected, 0);
const returns = {};
const winners = {};
[5, 4, 3, 2].forEach((hits, t) => {
  returns[hits] = Number((recent.reduce((s, c) => s + c.prizeTiers[t].winners * c.prizeTiers[t].prizeValue, 0) / revenue).toFixed(4));
  winners[hits] = Number((recent.reduce((s, c) => s + c.prizeTiers[t].winners, 0) / recent.length).toFixed(1));
});

console.log(JSON.stringify({
  fitThroughContest: contests.at(-1).number,
  popularityContests: usable.length,
  popularity: beta.map((v) => Number((v - betaMean).toFixed(3))),
  returns,
  winners,
}));
