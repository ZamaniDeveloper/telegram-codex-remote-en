// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const directories = new Set(['src', 'test', 'deploy', 'scripts', 'docs', '.github', 'assets', 'web']);
const textFile = name => /\.(?:mjs|cjs|ps1|py|txt|json|md|ya?ml|cff|html|css)$/.test(name) || ['LICENSE', '.env.example', '.connector.env.example'].includes(name);
let checked = 0;
async function scan(directory, top = false) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && (!top || directories.has(entry.name))) await scan(target);
    else if (entry.isFile() && textFile(entry.name)) {
      const content = await readFile(target, 'utf8');
      if (/[\u0600-\u06ff]/u.test(content)) throw Error(`Non-English edition content: ${path.relative(root, target)}`);
      checked++;
    }
  }
}
await scan(root, true);
console.log(`English edition check passed (${checked} source, script and documentation files).`);

