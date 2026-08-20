import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerResponse } from "node:http";

const ASSETS: Record<string, { file: string; contentType: string; cache: string }> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/lab": { file: "lab.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/lab/": { file: "lab.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/assets/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/data-status.css": { file: "data-status.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/data-status.js": { file: "data-status.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/refinements.css": { file: "refinements.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/refinements.js": { file: "refinements.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/real-bets.css": { file: "real-bets.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/real-bets.js": { file: "real-bets.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/lab.css": { file: "lab.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/lab.js": { file: "lab.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/lab-refinements.js": { file: "lab-refinements.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/favicon.svg": { file: "favicon.svg", contentType: "image/svg+xml; charset=utf-8", cache: "public, max-age=86400" },
};

export async function serveWebAsset(pathname: string, response: ServerResponse): Promise<boolean> {
  const asset = ASSETS[pathname];
  if (!asset) return false;

  const webRoot = process.env.WEB_ROOT ?? join(process.cwd(), "web");
  try {
    const body = await readFile(join(webRoot, asset.file));
    response.statusCode = 200;
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Content-Length", body.byteLength);
    response.setHeader("Cache-Control", asset.cache);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(body);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end("Web asset not found");
      return true;
    }
    throw error;
  }
}
