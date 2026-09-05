import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("operational HTTP metrics stay behind application authentication", async () => {
  const server = await source("src/api/server.ts");
  const handlerStart = server.indexOf("return createServer(async");
  const handler = server.slice(handlerStart);
  const authCheck = handler.indexOf("requireAppAuthentication");
  const metricsEndpoint = handler.indexOf('url.pathname === "/api/v1/ops/metrics"');

  assert.ok(handlerStart >= 0);
  assert.ok(authCheck >= 0);
  assert.ok(metricsEndpoint > authCheck);
  assert.match(handler, /classifyHttpRoute\(metricsUrl\.pathname\)/);
  assert.match(handler, /response\.once\("finish"/);
  assert.match(handler, /recordHttpRequest\(routeFamily, response\.statusCode/);
});
