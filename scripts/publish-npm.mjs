#!/usr/bin/env node
// Default: publish the package's version when npm does not have it yet. --bootstrap: reserve the name at 0.0.0 and configure
// trusted publishing, once, by a maintainer logged in to npm; then dispatch publish.yml within npm's two-day validation window.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGISTRY = 'https://registry.npmjs.org';
const REPO = 'coda-console/coda-protocol';
const WORKFLOW = 'publish.yml';

// Only a registry 404 means absent; authentication, network and server failures must stop the release.
export function published(spec, run = spawnSync) {
  const result = run('npm', ['view', spec, 'version', '--json', `--registry=${REGISTRY}`], { encoding: 'utf8' });
  if (result.status === 0) return true;
  let error;
  try { error = JSON.parse(result.stdout).error; } catch {}
  if (error?.code === 'E404') return false;
  throw new Error(`读取 ${spec} 失败：${result.error?.message ?? result.stderr ?? result.stdout}`);
}

const npm = (args, cwd) => execFileSync('npm', [...args, `--registry=${REGISTRY}`], { cwd, stdio: 'inherit' });

function main() {
  const { values: { bootstrap, 'dry-run': dryRun } } = parseArgs({ options: { bootstrap: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } });
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')), { name, version } = manifest;
  if (dryRun) { console.log(`${name}@${version}`); npm(['pack', '--dry-run', '--ignore-scripts'], ROOT); return; }
  if (!bootstrap) {
    if (published(`${name}@${version}`)) { console.log(`${name}@${version} 已发布，跳过`); return; }
    npm(['publish', '--access=public', '--ignore-scripts'], ROOT);
    return;
  }
  if (!published(name)) {
    const stage = mkdtempSync(join(tmpdir(), 'coda-protocol-bootstrap-'));
    try {
      writeFileSync(join(stage, 'package.json'), `${JSON.stringify({ name, version: '0.0.0', description: 'Reserved for the first Coda protocol release.',
        license: 'MIT', repository: manifest.repository, publishConfig: { access: 'public' } }, null, 2)}\n`);
      writeFileSync(join(stage, 'README.md'), `# ${name}\n\nBootstrap placeholder. The usable release will be published by ${REPO}.\n`);
      writeFileSync(join(stage, 'LICENSE'), readFileSync(join(ROOT, 'LICENSE')));
      npm(['publish', '--access=public', '--tag=bootstrap', '--ignore-scripts'], stage);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  // npm trust list --json prints nothing when empty and one JSON object per existing connection.
  const trust = execFileSync('npm', ['trust', 'list', name, '--json', `--registry=${REGISTRY}`], { encoding: 'utf8' }).trim();
  if (!trust) npm(['trust', 'github', name, '--repo', REPO, '--file', WORKFLOW, '--allow-publish', '--yes'], ROOT);
  else console.log(`${name} 已有可信发布配置，请核对：${trust}`);
  console.log(`首发占位与配置已处理。请核对可信发布配置，再立即运行 gh workflow run ${WORKFLOW} --repo ${REPO} --ref main。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
