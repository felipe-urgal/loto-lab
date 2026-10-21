import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web-dist");
const { version } = JSON.parse(await readFile(join(root, "build-manifest.json"), "utf8"));
if (!/^[a-f0-9]{12}$/.test(version)) throw new Error("Invalid web build version");

async function fingerprintImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await fingerprintImports(path);
    } else if (entry.name.endsWith(".js")) {
      const source = await readFile(path, "utf8");
      const output = source.replace(
        /(\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?\2/g,
        (_, prefix, quote, modulePath) => `${prefix}${quote}${modulePath}?v=${version}${quote}`,
      );
      if (output !== source) await writeFile(path, output);
    }
  }
}

await fingerprintImports(join(root, "assets"));
