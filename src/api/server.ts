import { createServer, type Server } from "node:http";
import { createApiRequestHandler, type ApiServerOptions } from "./app.js";
import { serveWebAsset } from "./web.js";

export function createLotoLabServer(options: ApiServerOptions): Server {
  const apiHandler = createApiRequestHandler(options);

  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      if (method === "GET" && await serveWebAsset(url.pathname, response)) return;
      apiHandler(request, response);
    } catch (error) {
      console.error("Loto Lab web request failed", error);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
      response.end("Unexpected server error");
    }
  });
}
