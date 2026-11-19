// Fails if any http:// or https:// URL in dist/ is not covered by scripts/url-allowlist.json.
// Usage: node scripts/check-dist-urls.mjs [distDir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const distDir = process.argv[2] ?? 'dist';
const { allow } = JSON.parse(
  readFileSync(new URL('./url-allowlist.json', import.meta.url), 'utf8'),
);
const allowed = new Set(allow.map((entry) => entry.url));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const URL_RE = /https?:\/\/[^\s"'`<>)\\]*/gi;
const offenders = [];
for (const file of walk(distDir)) {
  const text = readFileSync(file, 'latin1');
  for (const match of text.matchAll(URL_RE)) {
    if (!allowed.has(match[0])) {
      offenders.push(`${relative(distDir, file)}: ${match[0]}`);
    }
  }
}

if (offenders.length) {
  console.error(`Found ${offenders.length} URL(s) in ${distDir}/ outside the allowlist:`);
  for (const line of [...new Set(offenders)]) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`dist URL check passed (${allowed.size} allowlisted URLs).`);
