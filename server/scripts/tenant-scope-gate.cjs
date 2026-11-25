#!/usr/bin/env node
/**
 * scripts/tenant-scope-gate.cjs  (decision WF-1 / roadmap 2.2; mirrors products' rbac-grep-gate.js)
 *
 * AGENTS.md rule: every query on tenant data filters on company_id; look up by _id AND company_id.
 * This gate finds Mongoose calls on tenant models in controllers/ and services/ whose arguments never
 * mention `company_id` (findById(...), findOne({ _id }), updateOne({ _id }), ...).
 *
 * Existing calls are a ratchet: scripts/tenant-scope-baseline.json holds the count per file. The gate fails
 * when a file has MORE unscoped calls than its baseline (a new one was added). Fewer: it asks you to run
 * `node scripts/tenant-scope-gate.cjs --update` so the baseline only goes down.
 *
 * A call that is safe on purpose (the id comes from a document already loaded with company_id, or the
 * model is shared across tenants for that call) is marked on the same line or the line above:
 *   // tenant-scope-ok: <reason>
 *
 * Tenant model = its file in src/models/ defines `company_id`, plus Company itself.
 * Usage: node scripts/tenant-scope-gate.cjs [--update] [--list]
 */
const fs = require('fs');
const path = require('path');

const SERVER = path.resolve(__dirname, '..');
const SRC = path.join(SERVER, 'src');
const BASELINE = path.join(__dirname, 'tenant-scope-baseline.json');
const SCAN_DIRS = ['controllers', 'services'];
const METHODS = [
  'findById', 'findByIdAndUpdate', 'findByIdAndDelete', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
  'find', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments', 'exists', 'replaceOne',
];

function tenantModels(modelsDir = path.join(SRC, 'models')) {
  const names = new Set(['Company']);
  for (const f of fs.readdirSync(modelsDir)) {
    if (!f.endsWith('.model.ts')) continue;
    const text = fs.readFileSync(path.join(modelsDir, f), 'utf8');
    if (!/\bcompany_id\b/.test(text)) continue;
    for (const m of text.matchAll(/export const (\w+)\s*=\s*(?:mongoose\.)?model\b/g)) names.add(m[1]);
  }
  return names;
}

/** Argument text of the call whose "(" is at openIdx (balanced parens, strings skipped). */
function callArgs(text, openIdx) {
  let depth = 0, q = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return text.slice(openIdx + 1, i);
  }
  return text.slice(openIdx + 1);
}

/** Unscoped calls in one source text: [{ line, model, method, snippet }]. */
function findUnscoped(text, models) {
  const hits = [];
  const lines = text.split('\n');
  const re = new RegExp(`\\b(${[...models].join('|')})\\s*\\.\\s*(${METHODS.join('|')})\\s*\\(`, 'g');
  for (const m of text.matchAll(re)) {
    const open = m.index + m[0].length - 1;
    const args = callArgs(text, open);
    if (/\bcompany_id\b/.test(args)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    const here = lines[line - 1] ?? '';
    const above = lines[line - 2] ?? '';
    if (/tenant-scope-ok/.test(here) || /tenant-scope-ok/.test(above)) continue;
    hits.push({ line, model: m[1], method: m[2], snippet: here.trim().slice(0, 140) });
  }
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function scan() {
  const models = tenantModels();
  const result = {};
  for (const d of SCAN_DIRS) {
    for (const file of walk(path.join(SRC, d))) {
      const hits = findUnscoped(fs.readFileSync(file, 'utf8'), models);
      if (hits.length) result[path.relative(SERVER, file).replace(/\\/g, '/')] = hits;
    }
  }
  return result;
}

/** Compare counts with the baseline: { added: [{file, count, allowed, hits}], reduced: [file] }. */
function compare(current, baseline) {
  const added = [], reduced = [];
  for (const [file, hits] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0;
    if (hits.length > allowed) added.push({ file, count: hits.length, allowed, hits });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if ((current[file]?.length ?? 0) < allowed) reduced.push(file);
  }
  return { added, reduced };
}

function main(argv) {
  const current = scan();
  const counts = Object.fromEntries(Object.entries(current).map(([f, h]) => [f, h.length]).sort());
  if (argv.includes('--update')) {
    fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
    console.log(`tenant-scope-gate: baseline written (${Object.values(counts).reduce((a, b) => a + b, 0)} calls in ${Object.keys(counts).length} files)`);
    return 0;
  }
  if (argv.includes('--list')) {
    for (const [f, hits] of Object.entries(current)) for (const h of hits) console.log(`${f}:${h.line}  ${h.model}.${h.method}  ${h.snippet}`);
    return 0;
  }
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const { added, reduced } = compare(current, baseline);
  if (added.length) {
    console.error('tenant-scope-gate: FAIL. New query on a tenant model without company_id (AGENTS.md: look up by _id AND company_id):');
    for (const a of added) {
      console.error(`  ${a.file}: ${a.count} unscoped calls, baseline allows ${a.allowed}`);
      for (const h of a.hits) console.error(`    line ${h.line}: ${h.model}.${h.method}  ${h.snippet}`);
    }
    console.error('Fix: add company_id to the filter. If the call is safe on purpose, mark it with // tenant-scope-ok: <reason>.');
    return 1;
  }
  if (reduced.length) {
    console.log(`tenant-scope-gate: pass. ${reduced.length} file(s) now have fewer unscoped calls; run "node scripts/tenant-scope-gate.cjs --update" to lower the baseline.`);
  } else {
    console.log('tenant-scope-gate: pass');
  }
  return 0;
}

module.exports = { tenantModels, findUnscoped, callArgs, compare };
if (require.main === module) process.exit(main(process.argv.slice(2)));
