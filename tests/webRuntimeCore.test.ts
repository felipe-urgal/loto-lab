import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { API, ApiError, api } from "../web/src/core/api.js";
import { escapeHtml } from "../web/src/shared/escaping.js";

const runtimeSource = await readFile(resolve(process.cwd(), "web/runtime.js"), "utf8");

test("shared escaping preserves the legacy runtime contract", () => {
  assert.equal(escapeHtml(undefined), "");
  assert.equal(
    escapeHtml(`<span data-value="a&b">O'Reilly</span>`),
    "&lt;span data-value=&quot;a&amp;b&quot;&gt;O&#039;Reilly&lt;/span&gt;",
  );
});

test("typed API client preserves success, JSON headers and 204 responses", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;
  const successFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  globalThis.fetch = successFetch;

  const payload = await api<{ ok: boolean }>("/status", {
    method: "POST",
    body: JSON.stringify({ refresh: true }),
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(requestedUrl, `${API}/status`);
  assert.equal(new Headers(requestedHeaders).get("Content-Type"), "application/json");

  const noContentFetch: typeof fetch = async () => new Response(null, { status: 204 });
  globalThis.fetch = noContentFetch;
  assert.equal(await api("/empty"), null);
});

test("typed API client keeps backend error message/code and exposes status", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const structuredErrorFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "Entrada inválida", code: "INVALID_INPUT" } }),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  globalThis.fetch = structuredErrorFetch;

  await assert.rejects(api("/fail"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "Entrada inválida");
    assert.equal(error.code, "INVALID_INPUT");
    assert.equal(error.status, 422);
    return true;
  });

  const fallbackErrorFetch: typeof fetch = async () =>
    new Response("not-json", { status: 503 });
  globalThis.fetch = fallbackErrorFetch;

  await assert.rejects(api("/unavailable"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "Erro HTTP 503");
    assert.equal(error.code, "HTTP_ERROR");
    assert.equal(error.status, 503);
    return true;
  });
});

test("runtime keeps API and escaping exports while implementation moves to TypeScript", () => {
  assert.match(runtimeSource, /from "\.\/src\/core\/api\.js"/);
  assert.match(runtimeSource, /from "\.\/src\/shared\/escaping\.js"/);
  assert.doesNotMatch(runtimeSource, /export async function api/);
  assert.doesNotMatch(runtimeSource, /export function escapeHtml/);
});
