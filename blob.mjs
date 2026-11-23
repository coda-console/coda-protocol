// Where a blob pointer (`{ owner, path, … }`, `$defs.blob` of schemas/protocol/v1/session.json) may point: the kinds of path
// there are, a row each. A path is a URL path, percent-encoded by segment, with no leading `/` and no `/v1/`; its parts are
// given as they are written, not decoded. Pure: no Node module, so it runs in a page too. The `pattern` of the schemas says
// the same, and test/blob.test.mjs holds the two together.
const MAX_LENGTH = 2048;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID = '[a-z][a-z0-9-]{0,39}';
const SHA256 = '[0-9a-f]{64}';
// What RFC 3986 lets a segment hold, less what a URL parser or a server would take for another path: `.` and `..`, written
// plainly or encoded, and an encoded slash or backslash.
const SEGMENT = "(?!(?:[.]|%2[eE]){1,2}(?:/|$))(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%(?!2[fF]|5[cC])[0-9A-Fa-f]{2})+";

export const BLOB_PATHS = Object.freeze([
  { kind: 'upload', pattern: `uploads/(?<upload>${UUID})(?<preview>/preview)?`, parts: ({ upload, preview }) => ({ upload, preview: preview !== undefined }) },
  { kind: 'service', pattern: `plugins/(?<plugin>${ID})/services/(?<service>${ID})/(?<path>${SEGMENT}(?:/${SEGMENT})*)`, parts: groups => ({ ...groups }) },
  { kind: 'content', pattern: `content/(?<sha256>${SHA256})`, parts: ({ sha256 }) => ({ sha256 }) },
].map(row => Object.freeze(row)));

const rows = BLOB_PATHS.map(({ kind, pattern, parts }) => ({ kind, parts, regexp: new RegExp(`^(?:${pattern})$`, 'u') }));

// `{ kind: 'upload', upload, preview }`, `{ kind: 'service', plugin, service, path }`, `{ kind: 'content', sha256 }`, or null for what is no such path.
export function parseBlobPath(path) {
  if (typeof path !== 'string' || path.length > MAX_LENGTH) return null;
  for (const { kind, parts, regexp } of rows) {
    const match = regexp.exec(path);
    if (match) return { kind, ...parts(match.groups) };
  }
  return null;
}
