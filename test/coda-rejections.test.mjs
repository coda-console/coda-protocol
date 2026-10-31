// Rejection inputs captured from Coda's parser tests at the revision recorded in the fixture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixtures from './fixtures/coda-rejections.json' with { type: 'json' };
import { workflowProblem } from '../workflow.mjs';
for (const [index, input] of fixtures.cases.entries()) test(`Coda rejection ${index + 1}: ${input.source} (${input.file})`, async () => {
  const problem = await workflowProblem(input.xml, input.file);
  assert.ok(problem, input.xml);
  if (input.pattern.startsWith('/')) {
    const end = input.pattern.lastIndexOf('/');
    assert.match(problem, new RegExp(input.pattern.slice(1, end), input.pattern.slice(end + 1)));
  }
});

for (const [index, input] of fixtures.accepted.entries()) test(`Coda accepted ${index + 1}: ${input.source} (${input.file})`, async () => {
  assert.equal(await workflowProblem(input.xml, input.file), null);
});
