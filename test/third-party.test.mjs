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
