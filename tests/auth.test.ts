import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

test("production auth protects application routes while health remains public", async (t) => {
  const previousUser = process.env.APP_AUTH_USER;
  const previousPassword = process.env.APP_AUTH_PASSWORD;
  process.env.APP_AUTH_USER = "review-user";
  process.env.APP_AUTH_PASSWORD = "a-very-long-review-password";

  t.after(() => {
    if (previousUser === undefined) delete process.env.APP_AUTH_USER;
    else process.env.APP_AUTH_USER = previousUser;
    if (previousPassword === undefined) delete process.env.APP_AUTH_PASSWORD;
    else process.env.APP_AUTH_PASSWORD = previousPassword;
  });

  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const server = createLotoLabServer({ pool });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  const health = await fetch(`${baseUrl}/health/live`);
  assert.equal(health.status, 200);

  const anonymous = await fetch(`${baseUrl}/`);
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("www-authenticate") ?? "", /Basic realm="Loto Lab"/);

  const invalid = await fetch(`${baseUrl}/`, {
    headers: { Authorization: basic("review-user", "wrong-password") },
  });
  assert.equal(invalid.status, 401);

  const authenticated = await fetch(`${baseUrl}/`, {
    headers: { Authorization: basic("review-user", "a-very-long-review-password") },
  });
  assert.equal(authenticated.status, 200);
  assert.match(authenticated.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal(authenticated.headers.get("x-frame-options"), "DENY");
});
