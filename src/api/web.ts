import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";

const HTML_ROUTES = new Map([
  ["/", "index.html"],
  ["/lab", "lab.html"],
  ["/lab/", "lab.html"],
  ["/ai", "ai.html"],
  ["/ai/", "ai.html"],
  ["/agenda", "agenda.html"],
  ["/agenda/", "agenda.html"],
]);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function webRoot(): string {
  if (process.env.WEB_ROOT) return resolve(process.env.WEB_ROOT);
  const built = join(process.cwd(), "web-dist");
  return existsSync(built) ? built : join(process.cwd(), "web");
}

function safePath(root: string, relativePath: string): string | undefined {
  const candidate = resolve(root, relativePath);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(prefix) ? candidate : undefined;
}

function assetCandidates(root: string, pathname: string): string[] | undefined {
  const html = HTML_ROUTES.get(pathname);
  if (html) return [safePath(root, html)!];
  if (pathname === "/favicon.svg") return [safePath(root, "favicon.svg")!];
  if (!pathname.startsWith("/assets/")) return undefined;

  const relativePath = pathname.slice("/assets/".length);
  if (!relativePath || relativePath.includes("\\")) return [];
  return [
    safePath(root, join("assets", relativePath)),
    safePath(root, relativePath),
  ].filter((item): item is string => Boolean(item));
}

async function readFirst(paths: string[]): Promise<{ body: Buffer; path: string } | undefined> {
  for (const path of paths) {
    try {
      return { body: await readFile(path), path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

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

function cacheControl(url: URL, extension: string): string {
  if (extension === ".html") return "no-cache";
  if (url.searchParams.has("v")) return "public, max-age=31536000, immutable";
  if (extension === ".svg") return "public, max-age=86400";
  return "public, max-age=300";
}

export async function serveWebAsset(url: URL, response: ServerResponse): Promise<boolean> {
  const root = webRoot();
  const candidates = assetCandidates(root, url.pathname);
  if (!candidates) return false;

  const file = await readFirst(candidates);
  if (!file) {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    setSecurityHeaders(response);
    response.end("Web asset not found");
    return true;
  }

  const extension = extname(file.path).toLowerCase();
  response.statusCode = 200;
  response.setHeader("Content-Type", CONTENT_TYPES[extension] ?? "application/octet-stream");
  response.setHeader("Content-Length", file.body.byteLength);
  response.setHeader("Cache-Control", cacheControl(url, extension));
  setSecurityHeaders(response);
  response.end(file.body);
  return true;
}
