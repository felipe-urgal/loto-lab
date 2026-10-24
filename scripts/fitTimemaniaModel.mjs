// Reajusta o modelo da Timemania (src/generator/timemaniaModel.ts).
// Uso: node scripts/fitTimemaniaModel.mjs [baseUrl]   (padrão http://localhost:5200)
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const LAMBDA = 30;

const contests = [];
for (let start = 1; ; start += 200) {
  const response = await fetch(`${baseUrl}/api/v1/contests/timemania?startContest=${start}&endContest=${start + 199}&order=asc&limit=200`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { items } = await response.json();
  if (items.length === 0) break;
  contests.push(...items);
}

// Popularidade: ridge de log(ganhadores_4_acertos/arrecadação), efeito fixo por ano.
const usable = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length === 6 && c.prizeTiers[3].winners > 0);
const byYear = new Map();
for (const c of usable) byYear.set(c.date.slice(0, 4), [...(byYear.get(c.date.slice(0, 4)) ?? []), c]);
const k = 80;
const a = Array.from({ length: k }, () => Array(k + 1).fill(0));
for (const group of byYear.values()) {
  const logs = group.map((c) => Math.log(c.prizeTiers[3].winners / c.amountCollected));
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

// Retorno médio e ganhadores médios por faixa (histórico com premiação completa).
const priced = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length === 6);
const revenue = priced.reduce((s, c) => s + c.amountCollected, 0);
const returns = {};
const winners = {};
[7, 6, 5, 4, 3, "team"].forEach((tier, t) => {
  returns[tier] = Number((priced.reduce((s, c) => s + c.prizeTiers[t].winners * c.prizeTiers[t].prizeValue, 0) / revenue).toFixed(4));
  winners[tier] = Number((priced.reduce((s, c) => s + c.prizeTiers[t].winners, 0) / priced.length).toFixed(2));
});

console.log(JSON.stringify({
  fitThroughContest: contests.at(-1).number,
  popularityContests: usable.length,
  popularity: beta.map((v) => Number((v - betaMean).toFixed(3))),
  returns,
  winners,
}));
