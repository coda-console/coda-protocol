// The definition of `coda/resource@1`, read once for protocol.mjs (which exports it) and validate.mjs (which judges a plugin's
// records by it, and which protocol.mjs imports, so it cannot import protocol.mjs back).
import { readFileSync } from 'node:fs';

export const RESOURCE_PROTOCOL = JSON.parse(readFileSync(new URL('./schemas/protocol/v1/resource.json', import.meta.url), 'utf8'));
