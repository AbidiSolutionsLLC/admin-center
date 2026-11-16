// Plan 1.5: no hard-coded product list in server code. A literal array or union holding two or more of the built-in
// product keys means a list that will not follow the registry (lib/productRegistry). Allowed: lib/productCatalog.ts
// (the built-in manifests and default plans), seeds and scripts, tests, and the documented keep-list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const KEYS = ['people', 'projects', 'sign', 'desk'];
const SRC = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set(['__tests__', 'scripts']);
const SKIP_FILES = new Set(['lib/productCatalog.ts']);
/** file -> reason */
const KEEP: Record<string, string> = {
  'identity/config.ts': 'default PLATFORM_CLIENT_PRODUCTS allow-list of the products backend client (overridable by env, plan finding F3)',
};

export function hasProductKeyList(line: string, keys: string[] = KEYS): boolean {
  for (const m of line.matchAll(/\[([^\[\]]*)\]/g)) {
    const quoted = [...m[1].matchAll(/(['"`])([A-Za-z_]+)\1/g)].map((q) => q[2]);
    if (new Set(quoted.filter((k) => keys.includes(k))).size >= 2) return true;
  }
  const union = line.match(/(?:'[A-Za-z_]+'\s*\|\s*)+'[A-Za-z_]+'/g) ?? [];
  return union.some((u) => new Set([...u.matchAll(/'([A-Za-z_]+)'/g)].map((q) => q[1]).filter((k) => keys.includes(k))).size >= 2);
}

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.ts')) out.push(path.join(dir, e.name));
  }
}

test('detector flags arrays and unions with two or more registered keys only', () => {
  assert.ok(hasProductKeyList("const k = ['people', 'projects'];"));
  assert.ok(hasProductKeyList("type K = 'people' | 'desk' | 'sign';"));
  assert.ok(!hasProductKeyList("const k = ['people', 'nope'];"));
  assert.ok(!hasProductKeyList("const k = 'people';"));
  assert.ok(hasProductKeyList("['demo', 'people']", ['demo', 'people']));
});

test('no hard-coded product-key list outside the allowed places', () => {
  const files: string[] = [];
  walk(SRC, files);
  const hits: string[] = [];
  for (const f of files) {
    const rel = path.relative(SRC, f).split(path.sep).join('/');
    if (SKIP_FILES.has(rel) || KEEP[rel]) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (hasProductKeyList(line)) hits.push(`${rel}:${i + 1} ${line.trim()}`); });
  }
  assert.deepEqual(hits, [], 'use lib/productRegistry (listProducts) instead of a literal list');
});
