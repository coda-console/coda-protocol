import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SCHEMAS, manifestProblem, contributionProblem } from '../validate.mjs';

const fixtures = new URL('./fixtures/stable/', import.meta.url);
for (const directory of readdirSync(fixtures, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
  test(`stable third-party manifest: ${directory.name}`, () => {
    const manifest = JSON.parse(readFileSync(new URL(`${directory.name}/package.json`, fixtures), 'utf8'));
    assert.equal(manifestProblem(manifest), null);
    for (const key of Object.keys(manifest.contributes)) {
      const schema = SCHEMAS[`${key}.json`];
      assert.ok(schema, `没有 ${key} 的业务 schema`);
      assert.equal(contributionProblem(schema, manifest, key), null, key);
    }
  });
}

test('stable Pi manifests keep passing as written, and the level-21 rule asks them for the three tiers', () => {
  for (const name of ['sealiu1997-coda_plugins_pi_agent@c968f99', 'sealiu1997-coda_plugins_pi_agent@dd31aa2']) {
    const manifest = JSON.parse(readFileSync(new URL(`${name}/package.json`, fixtures), 'utf8'));
    assert.equal(contributionProblem(SCHEMAS['agents.json'], manifest, 'agents'), null, name);
    const next = structuredClone({ ...manifest, engines: { ...manifest.engines, coda: 21 } });
    assert.match(contributionProblem(SCHEMAS['agents.json'], next, 'agents'), manifest.contributes.agents[0].modes ? /^contributes\.agents\[0\]\.modes 缺 manual：/ : /^contributes\.agents\[0\] 缺 modes：/, name);
    next.contributes.agents[0].modes = { ...next.contributes.agents[0].modes, manual: null, auto: null, full: null };
    assert.equal(manifestProblem(next), null, name);
    assert.equal(contributionProblem(SCHEMAS['agents.json'], next, 'agents'), null, name);
  }
});
