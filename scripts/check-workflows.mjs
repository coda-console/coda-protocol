// Read-only compatibility check against every tracked BPMN file of the given repositories.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { workflowProblem } from '../workflow.mjs';

const directories = process.argv.slice(2);
if (!directories.length) throw new Error('用法：node scripts/check-workflows.mjs <仓库目录> ...');
for (const directory of directories) {
  const root = resolve(directory);
  const files = execFileSync('git', ['ls-files', '-z', '*.bpmn'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  let failures = 0;
  for (const file of files) {
    const problem = await workflowProblem(readFileSync(join(root, file), 'utf8'), file.replace(/\.bpmn$/, ''));
    if (problem) { failures++; console.error(`${file}：${problem}`); }
  }
  console.log(`${root}：${files.length} 个流程，${failures} 个问题`);
  if (failures) process.exitCode = 1;
}
