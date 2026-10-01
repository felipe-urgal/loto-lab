import { Pool } from "pg";

const lotteries = [
  { id: "mega-sena", max: 60, drawSize: 6, step: 11 },
  { id: "lotofacil", max: 25, drawSize: 15, step: 2 },
  { id: "dia-de-sorte", max: 31, drawSize: 7, step: 4 },
];

const luckyMonths = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function drawDate(index) {
  const date = new Date(Date.UTC(2025, 0, 1 + index));
  return date.toISOString().slice(0, 10);
}

if (!process.env.DATABASE_URL) {
  throw new Error("E2E seed requires DATABASE_URL");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  for (const lottery of lotteries) {
    for (let index = 0; index < 60; index += 1) {
      const contestNumber = 8001 + index;
      const numbers = Array.from(
        { length: lottery.drawSize },
        (_, offset) => ((index * 3 + offset * lottery.step) % lottery.max) + 1,
      ).sort((a, b) => a - b);

      await pool.query(
        `
          INSERT INTO contests (lottery, contest_number, draw_date, numbers, lucky_month)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (lottery, contest_number) DO UPDATE SET
            draw_date = EXCLUDED.draw_date,
            numbers = EXCLUDED.numbers,
            lucky_month = EXCLUDED.lucky_month,
            updated_at = NOW()
        `,
        [
          lottery.id,
          contestNumber,
          drawDate(index),
          numbers,
          lottery.id === "dia-de-sorte" ? luckyMonths[index % luckyMonths.length] : null,
        ],
      );
    }
  }

  process.stdout.write("E2E history seeded for Mega-Sena, Lotofácil and Dia de Sorte.\n");
} finally {
  await pool.end();
}
