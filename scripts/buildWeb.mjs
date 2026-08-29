import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "web");
const outputRoot = join(root, "web-dist");
const assetRoot = join(outputRoot, "assets");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function withReadabilityLayer(html) {
  if (html.includes("/assets/readability.css")) return html;
  return html.replace(/<\/head>/i, '    <link rel="stylesheet" href="/assets/readability.css" />\n  </head>');
}

function withVersion(html, version) {
  let output = withReadabilityLayer(html).replace(/<html([^>]*)>/i, (_, attributes) => {
    const normalizedAttributes = attributes.replace(/\sdata-build=(['"])[^'"]*\1/i, "");
    return `<html${normalizedAttributes} data-build="${version}">`;
  });
  output = output.replace(
    /((?:src|href)=["'])(\/(?:assets\/[^"'?#]+|favicon\.svg))(?:\?[^"'#]*)?(["'])/g,
    (_, prefix, url, quote) => `${prefix}${url}?v=${version}${quote}`,
  );
  return output;
}

const sourceFiles = (await walk(sourceRoot)).sort();
const hash = createHash("sha256");
for (const file of sourceFiles) {
  hash.update(relative(sourceRoot, file));
  hash.update(await readFile(file));
}
const version = hash.digest("hex").slice(0, 12);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(assetRoot, { recursive: true });

for (const sourceFile of sourceFiles) {
  const rel = relative(sourceRoot, sourceFile);
  const extension = extname(sourceFile);
  const body = await readFile(sourceFile);
  let destination;
  let output = body;

  if (extension === ".html") {
    destination = join(outputRoot, rel);
    output = Buffer.from(withVersion(body.toString("utf8"), version));
  } else if (rel === "favicon.svg") {
    destination = join(outputRoot, rel);
  } else {
    destination = join(assetRoot, rel);
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, output);
}

await writeFile(
  join(outputRoot, "build-manifest.json"),
  `${JSON.stringify({ version }, null, 2)}\n`,
);

console.log(`Web build ${version} -> ${relative(root, outputRoot)}`);
