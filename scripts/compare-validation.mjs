// Compare every public validation result produced by the baseline's tests, including generated and non-JSON inputs.
// Run each revision with the same tests and dependencies; record results at the test import boundary, not inputs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const baseline = execFileSync('git', ['rev-parse', process.argv[2] ?? 'origin/main'], { cwd: repo, encoding: 'utf8' }).trim();
const temp = mkdtempSync(join(tmpdir(), 'coda-validation-'));
const exports = {
  validate: ['manifestProblem', 'pointProblem', 'valueProblem'],
  agent: ['agentCapabilitiesProblem', 'agentMessageProblem', 'agentResultProblem', 'agentValueProblem'],
  workflow: ['feelProblem', 'fieldProblem', 'fieldsProblem', 'readWorkflow', 'workflowProblem'],
};
try {
  const before = join(temp, 'before'), after = join(temp, 'after');
  mkdirSync(before); mkdirSync(after);
  execFileSync('tar', ['-x', '-C', before], { input: execFileSync('git', ['archive', baseline], { cwd: repo }) });
  for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean)) {
    mkdirSync(dirname(join(after, file)), { recursive: true });
    cpSync(join(repo, file), join(after, file));
  }
  // The baseline owns the corpus: new tests may use helpers the old implementation did not export.
  cpSync(join(before, 'test'), join(after, 'test'), { recursive: true });
  const tests = readdirSync(join(before, 'test')).filter(name => name.endsWith('.test.mjs')).sort();
  const results = [];
  for (const tree of [before, after]) {
    symlinkSync(resolve(repo, 'node_modules'), join(tree, 'node_modules'), 'dir');
    const output = join(tree, 'recorded');
    mkdirSync(output);
    for (const test of tests) {
      const path = join(tree, 'test', test);
      let source = readFileSync(path, 'utf8');
      for (const [module, names] of Object.entries(exports)) {
        if (!source.includes(`'../${module}.mjs'`)) continue;
        const wrapper = `${test}-${module}.mjs`;
        source = source.replaceAll(`'../${module}.mjs'`, `'../recorded/${wrapper}'`);
        writeFileSync(join(output, wrapper), `
import { appendFileSync } from 'node:fs';
import * as original from '../${module}.mjs';
export * from '../${module}.mjs';
let sequence = 0;
const record = (id, name, result) => appendFileSync(${JSON.stringify(join(output, `${test}-${module}.jsonl`))}, JSON.stringify({ id, name, ...result }) + '\\n');
function capture(name, args) {
  const id = sequence++;
  const done = value => { record(id, name, { value: name === 'readWorkflow' ? value.problem ?? null : value }); return value; };
  const failed = error => { record(id, name, { thrown: { name: error.name, message: error.message } }); throw error; };
  try {
    const value = original[name](...args);
    return value instanceof Promise ? value.then(done, failed) : done(value);
  } catch (error) { return failed(error); }
}
${names.map(name => `export const ${name} = (...args) => capture('${name}', args);`).join('\n')}
`);
      }
      writeFileSync(path, source);
    }
    try {
      execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...tests.map(name => `test/${name}`)], { cwd: tree, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      process.stderr.write(error.stdout ?? '');
      throw error;
    }
    results.push(Object.fromEntries(readdirSync(output).filter(name => name.endsWith('.jsonl')).sort().map(name =>
      [name, readFileSync(join(output, name), 'utf8').trim().split('\n').map(line => JSON.parse(line)).sort((a, b) => a.id - b.id)])));
  }
  assert.deepEqual(results[1], results[0], 'Validation results changed');
  console.log(`Baseline: ${baseline}`);
  let total = 0;
  for (const [file, records] of Object.entries(results[0])) {
    const failures = records.filter(record => record.thrown || record.value !== null).length;
    console.log(`${file}: ${records.length} identical results (${failures} problems/exceptions, ${records.length - failures} accepted)`);
    total += records.length;
  }
  const corpus = JSON.parse(readFileSync(join(before, 'test/fixtures/agent-messages.json'), 'utf8'));
  console.log(`Agent fixture: all ${corpus.cases.length} inputs included by agent.test.mjs`);
  console.log(`Total: ${total} identical results; 0 differences`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
