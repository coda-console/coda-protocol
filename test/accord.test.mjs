// @coda-console/protocol/accord: the exports, held to vectors/accord.json (which Swift and the plugins check themselves against),
// and to being pure: no Node module and no Buffer, so a page can load it as it is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as accord from '../accord.mjs';
import { accordIdentity, disambiguateTails, identiconPattern, identityTitle, identityTitles, isAuthor, nicknameOf, parseAuthor, shortAuthor, tailOf } from '../accord.mjs';
import pkg from '../package.json' with { type: 'json' };

const vectors = JSON.parse(readFileSync(new URL('../vectors/accord.json', import.meta.url), 'utf8'));
const bytes = hex => Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
const author = hex => `ed25519:${hex}`;

test('the module is pure: no node: import, no Buffer, and the package exports it with its vectors', () => {
  const source = readFileSync(new URL('../accord.mjs', import.meta.url), 'utf8');
  assert.equal(/\bnode:/.test(source), false);
  assert.equal(/\bBuffer\b/.test(source), false);
  assert.equal(/^\s*import\b|\brequire\(|\bimport\(/m.test(source), false);
  assert.deepEqual(Object.keys(accord).sort(), ['accordIdentity', 'disambiguateTails', 'identiconPattern', 'identityTitle', 'identityTitles', 'isAuthor', 'nicknameOf', 'parseAuthor', 'shortAuthor', 'tailOf']);
  assert.deepEqual(pkg.exports['./accord'], { types: './accord.d.mts', default: './accord.mjs' });
  assert.equal(pkg.exports['./vectors/accord.json'], './vectors/accord.json');
  for (const file of ['accord.mjs', 'accord.d.mts', 'vectors']) assert.ok(pkg.files.includes(file), file);
});

test('the identity vectors: every key spells its short, nickname, 78-digit tail, tag and title', () => {
  assert.equal(vectors.identities.length, 13);
  for (const { hex, author: written, short, name, tail, tag, title } of vectors.identities) {
    assert.equal(written, author(hex));
    assert.equal(tail.length, 78);
    assert.equal(tag.length, 4);
    assert.equal(tag, tail.slice(-4));
    for (const input of [written, bytes(hex)]) {
      assert.equal(nicknameOf(input), name, hex);
      assert.equal(tailOf(input), tail, hex);
    }
    assert.equal(shortAuthor(written), short);
    assert.equal(identityTitle(written), title);
    assert.equal(identityTitle(written, 'x'), title);
    const identity = accordIdentity(written);
    assert.deepEqual({ ...identity, key: [...identity.key] }, { author: written, key: [...bytes(hex)], short, name, tail, tag });
    assert.ok(identity.key instanceof Uint8Array);
    assert.equal(identityTitles([written]).get(written), name === '' ? short : `${name} #${tag}`);
  }
  const named = Object.fromEntries(vectors.identities.map(({ hex, name, tag }) => [hex.slice(0, 8), `${name}/${tag}`]));
  assert.equal(named['24005142'], 'sakura/8283');
  assert.equal(named.ffffffff, '/9935');
  assert.equal(named['00000000'], 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0000');
});

test('isAuthor, parseAuthor, shortAuthor: only ed25519: and 64 lowercase hex', () => {
  const hex = vectors.identities[0].hex;
  assert.equal(isAuthor(author(hex)), true);
  assert.deepEqual([...parseAuthor(author(hex))], [...bytes(hex)]);
  assert.equal(shortAuthor(author(hex)), hex.slice(0, 8));
  for (const bad of vectors.invalidAuthors) {
    assert.equal(isAuthor(bad), false, bad);
    assert.equal(parseAuthor(bad), null, bad);
    assert.equal(shortAuthor(bad), '', bad);
    assert.equal(nicknameOf(bad), '', bad);
    assert.equal(tailOf(bad), '', bad);
    assert.equal(accordIdentity(bad), null, bad);
    assert.equal(identityTitle(bad), '', bad);
    assert.equal(identityTitle(bad, 'unknown'), 'unknown', bad);
  }
  for (const bad of [undefined, null, 5, {}, [], bytes(hex)]) {
    assert.equal(isAuthor(bad), false);
    assert.equal(parseAuthor(bad), null);
    assert.equal(shortAuthor(bad), '');
    assert.equal(accordIdentity(bad), null);
    assert.equal(identityTitle(bad, 'unknown'), 'unknown');
  }
});

test('nicknameOf and tailOf: a Uint8Array not 32 bytes throws, and a non-author gives nothing', () => {
  for (const length of [0, 1, 31, 33, 64]) {
    assert.throws(() => nicknameOf(new Uint8Array(length)), TypeError);
    assert.throws(() => tailOf(new Uint8Array(length)), TypeError);
  }
  for (const other of [undefined, null, 5, {}, [], Array(32).fill(0), new Uint16Array(32), 'aaaa']) {
    assert.equal(nicknameOf(other), '');
    assert.equal(tailOf(other), '');
  }
  assert.equal(nicknameOf(new Uint8Array(32)), 'a'.repeat(36));
  assert.equal(tailOf(new Uint8Array(32)), '0'.repeat(78));
});

test('the nickname: 7-bit groups spell a letter below 78, a digit below 88, and end it from 88 up once it has 2 characters', () => {
  const keyOf = groups => {
    // The groups not given are 127: they end the name once it has two characters.
    const key = new Uint8Array(32);
    Array.from({ length: 36 }, (_, group) => groups[group] ?? 127).forEach((value, group) => { for (let i = 0; i < 7; i++) { const bit = group * 7 + i; if ((value >> (6 - i)) & 1) key[bit >> 3] |= 0x80 >> (bit & 7); } });
    return key;
  };
  assert.equal(nicknameOf(keyOf([127, 127, 1, 2, 127, 5])), 'bc');
  assert.equal(nicknameOf(keyOf([127, 88, 1, 78, 87, 77, 100, 3])), 'b09z');
  assert.equal(nicknameOf(keyOf([75, 26, 83])), 'xa5');
  assert.equal(nicknameOf(keyOf([0])), '');
  assert.equal(nicknameOf(keyOf([0, 127, 1])), 'ab');
  assert.equal(nicknameOf(keyOf(Array(36).fill(78))), '0'.repeat(36));
  assert.equal(nicknameOf(new Uint8Array(32).fill(0xff)), '');
});

test('disambiguateTails: the vectors', () => {
  assert.ok(vectors.disambiguate.length >= 10);
  for (const { name, minDigits, entries, suffixes } of vectors.disambiguate) {
    assert.deepEqual(disambiguateTails(entries, { minDigits }), suffixes, name);
    assert.deepEqual(disambiguateTails(new Set(entries), { minDigits }), suffixes, name);
  }
  assert.deepEqual(disambiguateTails([{ stem: 'a', tail: '12345678' }]), ['5678']);
  assert.deepEqual(disambiguateTails([]), []);
});

test('disambiguateTails: the shortest suffix of at least minDigits that no other tail of the stem shares', () => {
  let seed = 12345;
  const next = n => (seed = Math.imul(seed, 1103515245) + 12345 >>> 0) % n;
  for (let round = 0; round < 200; round++) {
    const entries = Array.from({ length: 1 + next(8) }, () => ({ stem: ['a', 'b', ''][next(3)], tail: Array.from({ length: 1 + next(9) }, () => next(3)).join('') }));
    const minDigits = 1 + next(5);
    const expected = entries.map(({ stem, tail }) => {
      for (let digits = Math.min(minDigits, tail.length); ; digits++) {
        const suffix = tail.slice(-digits);
        if (digits >= tail.length || stem === '' || !entries.some(other => other.stem === stem && other.tail !== tail && other.tail.endsWith(suffix))) return suffix;
      }
    });
    assert.deepEqual(disambiguateTails(entries, { minDigits }), expected, JSON.stringify({ entries, minDigits }));
  }
});

test('disambiguateTails: bad minDigits throw a RangeError', () => {
  for (const minDigits of [0, -1, 1.5, NaN, Infinity, '4', null]) assert.throws(() => disambiguateTails([{ stem: 'a', tail: '1234' }], { minDigits }), RangeError, String(minDigits));
  assert.throws(() => identityTitles([], { minDigits: 0 }), RangeError);
});

test('identityTitles: the vectors, with real keys of one nickname meeting on their last digits', () => {
  assert.ok(vectors.identityTitles.length >= 2);
  for (const { name, minDigits, authors, titles } of vectors.identityTitles) {
    const result = identityTitles(new Set(authors), { minDigits });
    assert.ok(result instanceof Map);
    assert.deepEqual([...result], Object.entries(titles), name);
    assert.deepEqual([...identityTitles(authors, { minDigits })], [...result], name);
  }
  const { authors, titles } = vectors.identityTitles[0];
  // Among the keys of one nickname, 5, 6 and 7 digits; the one of another nickname keeps four; the unnamed key is its short form.
  assert.deepEqual(Object.values(titles).map(title => title.split('#')[1]?.length), [7, 5, 6, 7, 4, undefined]);
  assert.equal(new Set(Object.values(titles)).size, Object.keys(titles).length);
  assert.equal(Object.keys(titles).length, 6, 'a duplicate and what is no author are not in it');
  assert.equal(identityTitles([]).size, 0);
});

test('identiconPattern: the vectors, symmetry, 8 to 18 cells, and a key and its author alike', () => {
  assert.ok(vectors.identicons.length >= 9);
  const inputs = [...vectors.identicons];
  for (const { kind, input, rows } of inputs) {
    const grid = identiconPattern(input);
    assert.deepEqual(grid.map(row => row.map(cell => (cell ? '1' : '0')).join('')), rows, input);
    assert.equal(grid.length, 5);
    for (const row of grid) {
      assert.equal(row.length, 5);
      for (let c = 0; c < 5; c++) assert.equal(row[c], row[4 - c]);
    }
    const active = grid.flat().filter(Boolean).length;
    assert.ok(active >= 8 && active <= 18, `${input}: ${active}`);
    if (kind === 'author') assert.deepEqual(identiconPattern(parseAuthor(input)), grid, input);
  }
  assert.deepEqual(identiconPattern(undefined), identiconPattern(''));
  assert.deepEqual(identiconPattern(null), identiconPattern(''));
  assert.notDeepEqual(identiconPattern('ed25519:' + 'A'.repeat(64)), identiconPattern(author('a'.repeat(64))));
  assert.deepEqual(identiconPattern(new Uint8Array([99, 111, 100, 97])), identiconPattern('coda'));
});
