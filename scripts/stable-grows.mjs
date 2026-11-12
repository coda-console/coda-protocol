#!/usr/bin/env node
// Baseline: a git revision, an unpacked package directory, or npm:latest.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const baseline = process.argv[2];
if (!baseline) throw new Error('用法：node scripts/stable-grows.mjs <git revision | package directory | npm:latest>');

// Arrays are sets of promises, including values and toolbar fields. Object keys keep their meaning.
function promises(value, prefix = '') {
  if (Array.isArray(value)) return value.flatMap(item => promises(item, prefix));
  if (value !== null && typeof value === 'object')
    return Object.entries(value).flatMap(([key, item]) => promises(item, `${prefix}/${key}`));
  return [`${prefix}=${JSON.stringify(value)}`];
}
function entries(data) {
  return new Set(data.entries.flatMap(({ path, ...details }) => [path, ...promises(details, path)]));
}

let stage;
try {
  let directory;
  if (baseline === 'npm:latest') {
    stage = mkdtempSync(join(tmpdir(), 'protocol-stable-'));
    const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', '@coda-console/protocol@latest', '--json', '--ignore-scripts', '--registry=https://registry.npmjs.org'], { cwd: stage, encoding: 'utf8' }));
    execFileSync('tar', ['-xzf', filename], { cwd: stage });
    directory = join(stage, 'package');
  } else if (existsSync(baseline)) directory = resolve(baseline);
  else execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], { cwd: root, stdio: 'pipe' });
  for (const file of ['manifest.json', 'view.json']) {
    const path = `stable/${file}`;
    let before;
    if (directory) {
      if (existsSync(join(directory, path))) before = readFileSync(join(directory, path), 'utf8');
    } else {
      if (execFileSync('git', ['ls-tree', '--name-only', baseline, '--', path], { cwd: root, encoding: 'utf8' }).trim())
        before = execFileSync('git', ['show', `${baseline}:${path}`], { cwd: root, encoding: 'utf8' });
    }
    const current = JSON.parse(readFileSync(join(root, path), 'utf8'));
    if (!Number.isInteger(current.revision) || current.revision < 1) throw new Error(`${path}: revision 须为正整数`);
    if (!before) { console.log(`${path}: 基线尚无此文件，通过`); continue; }
    const previous = JSON.parse(before), old = entries(previous), now = entries(current);
    for (const item of old) if (!now.has(item)) { console.error(`${path}: 少了 ${item}`); process.exitCode = 1; }
    const added = [...now].some(item => !old.has(item));
    if (current.revision < previous.revision || (added && current.revision <= previous.revision)) {
      console.error(`${path}: revision 不得倒退，增加条目须增大 revision（基线 ${previous.revision}，当前 ${current.revision}）`);
      process.exitCode = 1;
    }
    console.log(`${path}: ${old.size} → ${now.size} 项承诺`);
  }
} finally {
  if (stage) rmSync(stage, { recursive: true, force: true });
}
