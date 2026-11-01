// Public object contracts. Each spec/status can be compiled by a fresh, default Ajv (draft-07).
// Only local references remain; no validator keywords, provider identity or scheduling policy are added here.
import { readFileSync } from 'node:fs';

const base = 'https://coda.pub/schemas/executor/v1/';
const read = name => JSON.parse(readFileSync(new URL(`./schemas/executor/v1/${name}.json`, import.meta.url), 'utf8'));
const common = read('common');
const local = value => JSON.parse(JSON.stringify(value).replaceAll('common.json#/definitions/', '#/definitions/'));
function protocol(kind) {
  const schema = read(kind);
  const part = name => ({
    $schema: schema.$schema,
    $id: `${base}${kind}.${name}.json`,
    ...local(schema.properties[name]),
    definitions: local(common.definitions),
  });
  return { kind, spec: part('spec'), status: part('status') };
}

export const EXECUTOR_PROTOCOL = protocol('executor');
export const EXECUTION_PROTOCOL = { ...protocol('execution'), target: 'executor' };
