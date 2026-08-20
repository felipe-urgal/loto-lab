import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerResponse } from "node:http";

const ASSETS: Record<string, { file: string; contentType: string; cache: string }> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/lab": { file: "lab.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/lab/": { file: "lab.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/ai": { file: "ai.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/ai/": { file: "ai.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/agenda": { file: "agenda.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/agenda/": { file: "agenda.html", contentType: "text/html; charset=utf-8", cache: "no-cache" },
  "/assets/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/data-status.css": { file: "data-status.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/data-status.js": { file: "data-status.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/refinements.css": { file: "refinements.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/refinements.js": { file: "refinements.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/real-bets.css": { file: "real-bets.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/real-bets.js": { file: "real-bets.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/generation-diversity.css": { file: "generation-diversity.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/generation-diversity.js": { file: "generation-diversity.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/my-games-management.css": { file: "my-games-management.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/my-games-management.js": { file: "my-games-management.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/lab.css": { file: "lab.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/lab.js": { file: "lab.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/lab-refinements.js": { file: "lab-refinements.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/ai.css": { file: "ai.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/ai.js": { file: "ai.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/assets/agenda.css": { file: "agenda.css", contentType: "text/css; charset=utf-8", cache: "public, max-age=300" },
  "/assets/agenda.js": { file: "agenda.js", contentType: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/favicon.svg": { file: "favicon.svg", contentType: "image/svg+xml; charset=utf-8", cache: "public, max-age=86400" },
};

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
}

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
    setSecurityHeaders(response);
    response.end(body);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      setSecurityHeaders(response);
      response.end("Web asset not found");
      return true;
    }
    throw error;
  }
}
