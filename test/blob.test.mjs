// Blob pointers: the paths one may hold, judged alike by `parseBlobPath` and by the schemas, and where coda/session@1 takes one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import { BLOB_PATHS, parseBlobPath } from '../blob.mjs';
import { SESSION_PROTOCOL, definitionProblem } from '../protocol.mjs';

// As Coda compiles a protocol's schemas (backend/src/components/protocols/types.mjs).
const ajv = new Ajv({ allErrors: true, addUsedSchema: false, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
const { status: statusSchema, operations: { read: { result: resultSchema }, post: { input: postSchema } } } = SESSION_PROTOCOL;
const status = ajv.compile(statusSchema), result = ajv.compile(resultSchema), post = ajv.compile(postSchema);
const BLOB = resultSchema.$defs.blob, blob = ajv.compile(BLOB);

const OWNER = '0947ce49-321d-4d63-bd66-415fb6a0ebce', UPLOAD = '1c79fe8d-d534-4cb8-a53a-64c03a117027';
const HASH = '0123456789abcdef'.repeat(4);
const SERVED = 'plugins/wechat/services/media/';
// Judged alike by the two, and what was accepted is the path a URL parser reads too.
function judged(path, accepted) {
  const parsed = parseBlobPath(path), where = JSON.stringify(path);
  assert.equal(parsed !== null, accepted, `parseBlobPath ${where}`);
  assert.equal(blob({ owner: OWNER, path }), accepted, `schema ${where}`);
  if (accepted) assert.equal(new URL(`http://host/v1/${path}`).pathname, `/v1/${path}`);
  return parsed;
}

test('the definition of coda/session@1 is one, and its schemas compile as Coda compiles them', () => {
  assert.equal(definitionProblem(SESSION_PROTOCOL), null);
  for (const schema of [SESSION_PROTOCOL.spec, ...Object.values(SESSION_PROTOCOL.operations).flatMap(({ input, result }) => [input, result ?? {}]),
    ...Object.values(SESSION_PROTOCOL.streams).map(({ input }) => input)]) ajv.compile(schema);
});

test('the pointer is defined alike in the two schemas, its pattern is the rows of the table, and post takes none', () => {
  assert.deepEqual(statusSchema.$defs.blob, BLOB);
  assert.equal(BLOB.properties.path.pattern, `^(?:${BLOB_PATHS.map(({ pattern }) => pattern.replaceAll(/\(\?<[a-z0-9]+>/g, '(?:')).join('|')})$`);
  assert.equal(postSchema.$defs.blob, undefined);
});

test('a path of an upload, of something in a plugin\'s service, or of content by its hash, is read into its parts as written', () => {
  assert.deepEqual(BLOB_PATHS.map(({ kind }) => kind), ['upload', 'service', 'content']);
  for (const upload of [UPLOAD, '00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
    assert.deepEqual(judged(`uploads/${upload}`, true), { kind: 'upload', upload, preview: false });
    assert.deepEqual(judged(`uploads/${upload}/preview`, true), { kind: 'upload', upload, preview: true });
  }
  for (const id of ['a', 'wechat', 'a-1', 'a-', 'x'.repeat(40)]) {
    assert.deepEqual(judged(`plugins/${id}/services/media/a`, true), { kind: 'service', plugin: id, service: 'media', path: 'a' });
    assert.deepEqual(judged(`plugins/wechat/services/${id}/a`, true), { kind: 'service', plugin: 'wechat', service: id, path: 'a' });
  }
  for (const sha256 of ['0'.repeat(64), 'f'.repeat(64), '0123456789abcdef'.repeat(4), 'a1b2c3d4e5f60718'.repeat(4)])
    assert.deepEqual(judged(`content/${sha256}`, true), { kind: 'content', sha256 });
  for (const path of ['a', 'msg/m7/IMG_0412.jpg', 'msg/m7/IMG_0412.preview.jpg', 'a/b/c/d/e', 'preview', 'services/media/a', 'uploads/a',
    encodeURIComponent('你好 👋?#%.jpg'), encodeURIComponent("a!'()*~-_.b"), '%E4%BD%A0/%e5%a5%bd', "-._~!$&'()*+,;=:@", '%25', '%252f', '%00', '%FF'])
    assert.deepEqual(judged(SERVED + path, true), { kind: 'service', plugin: 'wechat', service: 'media', path });
});

test('a path of any other kind, or written another way, is none', () => {
  const upper = UPLOAD.toUpperCase();
  for (const path of ['', '/', 'a', 'uploads', 'uploads/', 'plugins', 'plugins/', 'plugins/wechat', 'plugins/wechat/', 'plugins/wechat/services',
    // Uploads: the ID a lowercase UUID, nothing after it but `preview`.
    `uploads/${upper}`, `uploads/${upper}/preview`, `uploads/${UPLOAD.slice(0, -1)}`, `uploads/${UPLOAD}0`, `uploads/${UPLOAD.replaceAll('-', '')}`,
    `uploads/{${UPLOAD}}`, `uploads/g${UPLOAD.slice(1)}`, 'uploads/up_1', 'uploads/preview', `uploads/${UPLOAD}/`, `uploads/${UPLOAD}/preview/`,
    `uploads/${UPLOAD}/preview/a`, `uploads/${UPLOAD}/Preview`, `uploads/${UPLOAD}/original`, `uploads/${UPLOAD}//preview`, `uploads//${UPLOAD}`,
    `uploads/${UPLOAD}/../preview`, `uploads/./${UPLOAD}`, `uploads/%31${UPLOAD.slice(1)}`, `uploads/${UPLOAD}/%70review`,
    // Services: the two IDs, then a path.
    'plugins/wechat/services/', 'plugins/wechat/services/media', SERVED, 'plugins/wechat/services//a', 'plugins//services/media/a',
    'plugins/services/media/a', 'plugins/wechat/media/a', 'plugins/wechat/service/media/a', 'plugins/wechat/Services/media/a',
    ...['Wechat', '1wechat', '-wechat', 'we_chat', 'we.chat', 'we%63hat', '.', '..', 'x'.repeat(41)].flatMap(id =>
      [`plugins/${id}/services/media/a`, `plugins/wechat/services/${id}/a`]),
    // Content: 64 lowercase hex digits, nothing around them.
    ...[HASH.toUpperCase(), HASH.slice(0, -1), `${HASH}0`, `g${HASH.slice(1)}`, `${HASH.slice(1)}g`, `${HASH.slice(0, 10)} ${HASH.slice(11)}`, `%61${HASH.slice(1)}`, `${HASH.slice(0, 2)}%61${HASH.slice(3)}`].map(sha256 => `content/${sha256}`),
    'content', 'content/', 'content/a', `content/${HASH}/`, `content/${HASH}/preview`, `content/${HASH}//`, `content//${HASH}`, `content/${HASH}/../${HASH}`, `Content/${HASH}`, `content2/${HASH}`, `%63ontent/${HASH}`, `contents/${HASH}`, HASH,
    // Other prefixes.
    'threads/a', 'files/a', 'blobs/a', 'content/a', `upload/${UPLOAD}`, `Uploads/${UPLOAD}`, `uploads2/${UPLOAD}`, `%75ploads/${UPLOAD}`, 'services/space/a'])
    judged(path, false);
  for (const path of [`uploads/${UPLOAD}`, `uploads/${UPLOAD}/preview`, `${SERVED}a`, `${SERVED}a/b.jpg`, `content/${HASH}`]) {
    judged(path, true);
    for (const other of [`/${path}`, `//${path}`, `v1/${path}`, `/v1/${path}`, `./${path}`, `../${path}`, `a/${path}`, `https://host/v1/${path}`,
      `${path}/`, `${path}//`, `${path}?`, `${path}?a=1`, `${path}#`, `${path}#a`, ` ${path}`, `${path} `, `${path}\n`, `\n${path}`, `${path}%`,
      `${path}/.`, `${path}/..`, path.replace('/', '//'), path.replace('/', '\\'), path.replace('/', '%2f'), path.replace('/', '%2F')])
      judged(other, false);
  }
  for (const value of [undefined, null, 1, {}, [], [`${SERVED}a`]]) judged(value, false);
});

test('a segment is never empty, and never a dot or two however they are written', () => {
  const places = segment => [segment, `${segment}/b`, `a/${segment}`, `a/${segment}/b`, `${segment}/${segment}`];
  for (const path of places('')) judged(SERVED + path, false);
  const dots = ['.', '%2e', '%2E'];
  const of = (tokens, length) => length === 0 ? [''] : of(tokens, length - 1).flatMap(rest => tokens.map(token => rest + token));
  for (const segment of [...of(dots, 1), ...of(dots, 2)]) for (const path of places(segment)) judged(SERVED + path, false);
  // Three dots, or dots beside anything else, are a name like any other.
  for (const segment of [...of(dots, 3), ...[...of(dots, 1), ...of(dots, 2)].flatMap(some => [`a${some}`, `${some}a`, `%20${some}`, `${some}%20`])])
    for (const path of places(segment)) judged(SERVED + path, true);
});

test('a character stands in a segment where RFC 3986 lets it, and a percent before two hex digits that are no slash or backslash', () => {
  const places = written => [written, `a${written}b`, `a${written}`, `${written}b`, `a/b${written}/c`];
  for (let code = 0; code < 256; code++) {
    const character = String.fromCharCode(code);
    // Two that stand by themselves elsewhere: a dot is no whole segment, and a slash parts two.
    if (character === '.') continue;
    const accepted = /[A-Za-z0-9_~!$&'()*+,;=:@-]/.test(character);
    for (const path of character === '/' ? [] : places(character)) judged(SERVED + path, accepted);
    const hex = code.toString(16).padStart(2, '0'), mixed = [...hex].map((digit, at) => at ? digit : digit.toUpperCase()).join('');
    const slash = code === 0x2f || code === 0x5c;
    for (const written of new Set([hex, hex.toUpperCase(), mixed, mixed.toLowerCase().replace(/.$/, digit => digit.toUpperCase())])) {
      const alone = code === 0x2e ? places(`%${written}`).slice(1) : places(`%${written}`);
      for (const path of alone) judged(SERVED + path, !slash);
    }
  }
  for (const cut of ['%', '%2', '%%', '%%20', '%2%20', '%g0', '%0g', '%zz', '% 0', '%-1', '%u4f60', '%２０'])
    for (const path of [cut, `a${cut}`, `a${cut}/b`, `${cut}/b`]) judged(SERVED + path, false);
  for (const character of ['你', '👋', '／', '．', ' ', '\ud800']) for (const path of places(character)) judged(SERVED + path, false);
});

test('a path is at most 2048 characters', () => {
  const segments = length => `${SERVED}${'a/'.repeat(length)}`.slice(0, length - 1) + 'a';
  for (const long of [length => SERVED + 'a'.repeat(length - SERVED.length), segments]) {
    assert.equal(long(2048).length, 2048);
    judged(long(2048), true);
    judged(long(2049), false);
    judged(long(100_000), false);
  }
});

test('a pointer is an owner and a path, and what the writer says of the content', () => {
  const pointer = { owner: OWNER, path: `${SERVED}a.jpg` };
  for (const value of [pointer, { ...pointer, name: '' }, { ...pointer, name: 'x'.repeat(1024) }, { ...pointer, size: 0 }, { ...pointer, size: 2 ** 40 },
    { ...pointer, mime: '' }, { ...pointer, mime: 'x'.repeat(255) }, { ...pointer, sha256: '0123456789abcdef'.repeat(4) },
    { ...pointer, name: 'a.jpg', size: 10, mime: 'image/jpeg', sha256: 'f'.repeat(64) }])
    assert.equal(blob(value), true, JSON.stringify(value));
  for (const value of [null, [], 'uploads/a', {}, { owner: OWNER }, { path: pointer.path }, { ...pointer, url: 'https://x' }, { ...pointer, kind: 'upload' },
    ...['', 'macmini', OWNER.toUpperCase(), OWNER.replaceAll('-', ''), `${OWNER}0`, ` ${OWNER}`, `${OWNER}\n`, 1, null].map(owner => ({ ...pointer, owner })),
    ...['x'.repeat(1025), 1, null].map(name => ({ ...pointer, name })), ...[-1, 1.5, '1', null].map(size => ({ ...pointer, size })),
    ...['x'.repeat(256), 1, null].map(mime => ({ ...pointer, mime })),
    ...['', 'f'.repeat(63), 'f'.repeat(65), 'F'.repeat(64), 'g'.repeat(64), 1, null].map(sha256 => ({ ...pointer, sha256 }))])
    assert.equal(blob(value), false, JSON.stringify(value));
  const { name, size, mime } = resultSchema.$defs.part.oneOf[1].properties;
  for (const [key, limits] of Object.entries({ name, size, mime })) assert.deepEqual(BLOB.properties[key], limits);
});

const pointerTo = path => ({ owner: OWNER, path });
const messages = part => ({ messages: [{ id: 'm1', cursor: 'c1', sender: 'u1', text: 'x', parts: [part] }], cursor: 'c1', more: false });
const reads = part => result(messages(part)), posts = part => post({ text: 'x', parts: [part] });

test('a media part points at its files by pointers or the old way, never by both', () => {
  // What a part writes of these, in this order; everything left out of the list is refused.
  const ways = { blob: [pointerTo(`${SERVED}a.jpg`)], preview: ['a.preview.jpg', pointerTo(`uploads/${UPLOAD}/preview`)], service: ['media'], path: ['a.jpg'] };
  const accepted = new Set(['', 'service', 'service path', 'preview(old) service', 'preview(old) service path', 'blob', 'preview', 'blob preview']);
  const all = Object.entries(ways).reduce((parts, [key, values]) => parts.flatMap(part => [part, ...values.map(value => ({ ...part, [key]: value }))]), [{}]);
  assert.equal(all.length, 24);
  let taken = 0;
  for (const keys of all) {
    const written = Object.keys(keys).map(key => typeof keys[key] === 'string' && key === 'preview' ? 'preview(old)' : key).join(' ');
    const old = !keys.blob && typeof keys.preview !== 'object';
    for (const type of ['image', 'video', 'file', 'audio']) for (const more of [{}, { thumb: '/9j/' }, { size: 1, mime: 'a/b', width: 1, height: 1, duration: 0, thumb: '' }]) {
      const part = { type, name: 'a', ...more, ...keys }, valid = reads(part);
      assert.equal(valid, accepted.has(written), `${type} ${written}`);
      taken += valid;
      // The old way is taken as `post`, which this left alone, takes it; a pointer is no part of what is sent.
      assert.equal(posts(part), old && valid, `post ${type} ${written}`);
    }
  }
  assert.equal(taken, accepted.size * 12);
});

test('a media part\'s pointer is a whole pointer, and a part of text takes none', () => {
  const pointer = pointerTo(`${SERVED}a.jpg`);
  for (const key of ['blob', 'preview']) {
    assert.equal(reads({ type: 'image', name: 'a', [key]: { ...pointer, name: 'a.jpg', size: 10, mime: 'image/jpeg', sha256: 'f'.repeat(64) } }), true);
    for (const sha256 of ['0'.repeat(64), 'f'.repeat(64), HASH]) assert.equal(reads({ type: 'image', name: 'a', [key]: pointerTo(`content/${sha256}`) }), true);
    for (const value of [null, 1, [], {}, '', { owner: OWNER }, { path: pointer.path }, { service: 'media', path: 'a.jpg' }, { ...pointer, service: 'media' },
      { ...pointer, owner: 'macmini' }, { ...pointer, path: 'a.jpg' }, { ...pointer, path: `/v1/${pointer.path}` }, { ...pointer, sha256: 'f' }])
      assert.equal(reads({ type: 'image', name: 'a', [key]: value }), false, `${key} ${JSON.stringify(value)}`);
    for (const type of ['text', 'thinking', 'tool']) assert.equal(reads({ type, text: 'x', [key]: pointer }), false);
    assert.equal(reads({ type: 'image', [key]: pointer }), false);
  }
  assert.equal(reads({ type: 'image', name: 'a', blob: pointer.path }), false);
  assert.equal(reads({ type: 'image', name: 'a', blob: pointer, upload: 'up_1' }), false);
});

test('an avatar is a pointer or written the old way, never both', () => {
  const shown = avatar => status({ participants: [{ id: 'u1', name: '小王', kind: 'person', avatar }] });
  const values = { owner: [OWNER], service: ['media'], path: ['avatar/u1/ab12', `${SERVED}avatar/u1/ab12`, `uploads/${UPLOAD}`, `content/${HASH}`], name: ['a.jpg'], size: [10], mime: ['image/jpeg'], sha256: ['f'.repeat(64)] };
  const all = Object.entries(values).reduce((some, [key, each]) => some.flatMap(avatar => [avatar, ...each.map(value => ({ ...avatar, [key]: value }))]), [{}]);
  assert.equal(all.length, 2 ** 6 * 5);
  for (const avatar of all) {
    const keys = Object.keys(avatar), pointing = 'owner' in avatar;
    const expected = pointing ? !('service' in avatar) && avatar.path !== undefined && avatar.path !== 'avatar/u1/ab12' : keys.join(' ') === 'service path';
    assert.equal(shown(avatar), expected, JSON.stringify(avatar));
  }
  for (const avatar of [null, [], '', 'https://x/a.jpg', { service: 'media', path: '' }, { service: '', path: 'a' }, { ...pointerTo(`uploads/${UPLOAD}`), url: 'https://x' }, { blob: pointerTo(`uploads/${UPLOAD}`) }])
    assert.equal(shown(avatar), false, JSON.stringify(avatar));
});

test('records and read results valid in 6.20.0 stay valid', () => {
  const person = { id: 'u1', name: '小王', kind: 'person' }, participants = [person, { id: 'bot', name: 'Coda', kind: 'bot', self: true }];
  for (const value of [{ participants: [] }, { head: 'c9', participants, state: 'unreachable', reason: '掉线了' },
    { participants, activity: { participant: 'u1', text: '正在搜索代码' }, notify: true, accepts: { audio: { maxDuration: 60 } } },
    { participants: [{ ...person, avatar: { service: 'media', path: 'avatar/u1/ab12' } }] },
    { participants: [{ ...person, avatar: { service: 'x'.repeat(200), path: '任意/ 旧?路径#'.padEnd(2048, 'x') } }] }])
    assert.equal(status(value), true, JSON.stringify(value));
  const photo = { type: 'image', name: 'IMG_0412.jpg', size: 2310144, mime: 'image/jpeg', width: 3024, height: 4032,
    thumb: '/9j/'.repeat(2048), service: 'media', path: 'msg/m7/IMG_0412.jpg' };
  for (const part of [{ type: 'text', text: '你好' }, { type: 'thinking', text: '想一想' }, { type: 'tool', text: 'ls' }, { type: 'file', name: 'a.zip' }, photo,
    { ...photo, preview: 'msg/m7/IMG_0412.preview.jpg' }, { ...photo, preview: '任意/ 旧?路径#'.padEnd(2048, 'x') },
    { type: 'image', name: 'a.png', size: 10, mime: 'image/png', service: 'media' },
    { type: 'video', name: 'a.mov', width: 1, height: 1, duration: 0, thumb: '/9j/', service: 'media', path: 'a.mov' },
    { type: 'video', name: 'b.mp4', duration: 12.5 }, { type: 'video', name: 'c.mp4', service: 'media', preview: 'c.jpg' },
    { type: 'audio', name: 'voice.m4a', size: 8123, mime: 'audio/mp4', duration: 5, service: 'media', path: 'msg/m8/voice.m4a' }])
    assert.equal(reads(part), true, JSON.stringify(part));
  const message = { id: 'm1', cursor: 'c1', sender: 'u1', text: '你好 @Coda' };
  assert.equal(result({ messages: [], cursor: null, more: false }), true);
  assert.equal(result({ messages: [{ ...message, senderName: '小王', replyTo: 'm0', mentions: ['bot'], createdAt: '2026-11-07T08:00:00Z' },
    { ...message, about: { message: 'm1', change: 'recall' } }, { ...message, about: { message: 'm2', change: 'reaction', value: '👍' } }], cursor: 'c4', more: false }), true);
});
