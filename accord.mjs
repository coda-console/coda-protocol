// What an Accord author (`ed25519:<64 lowercase hex>`) looks like to a person: its short form, the nickname its key spells, its
// 78-digit decimal tail, the tail's suffix that tells two of one nickname apart, and the 5×5 identicon. Pure: only standard
// JavaScript (Uint8Array, BigInt), so it runs in a page too. The vectors in vectors/accord.json are what Swift (AccordNickname.swift) and the plugins
// check themselves against; test/accord.test.mjs holds this file to them.
const AUTHOR = /^ed25519:([0-9a-f]{64})$/;
const DIGITS = /^[0-9]+$/;
const NICKNAME_GROUPS = 36;
const TAIL_LENGTH = 78;

export const isAuthor = value => typeof value === 'string' && AUTHOR.test(value);

// The 32 bytes of a valid author, or null.
export function parseAuthor(author) {
  const hex = typeof author === 'string' ? AUTHOR.exec(author)?.[1] : undefined;
  return hex === undefined ? null : Uint8Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

// The first 8 hex digits of a valid author, or ''.
export const shortAuthor = author => isAuthor(author) ? author.slice(8, 16) : '';

// A 32-byte key as given, or as an author spells it; null for an author that is not one. A Uint8Array of another length throws.
function keyOf(input) {
  if (input instanceof Uint8Array) {
    if (input.length !== 32) throw new TypeError('a public key is 32 bytes');
    return input;
  }
  return parseAuthor(input);
}

// Reads the key 7 bits at a time, 36 groups at most (the last 4 bits are not read): 0-77 spell a letter (mod 26), 78-87 a digit,
// 88-127 end the name once it has 2 characters and are skipped before that. '' when fewer than 2 characters are spelled.
export function nicknameOf(input) {
  const key = keyOf(input);
  if (key === null) return '';
  let name = '', bit = 0;
  for (let group = 0; group < NICKNAME_GROUPS; group++) {
    let v = 0;
    for (let i = 0; i < 7; i++, bit++) v = (v << 1) | ((key[bit >> 3] >> (7 - (bit & 7))) & 1);
    if (v < 78) name += String.fromCharCode(97 + (v % 26));
    else if (v < 88) name += String(v - 78);
    else if (name.length >= 2) return name;
  }
  return name.length >= 2 ? name : '';
}

// The key as a big-endian unsigned integer, in decimal, 78 digits wide; '' for an author that is not one.
export function tailOf(input) {
  const key = keyOf(input);
  return key === null ? '' : BigInt(`0x${Array.from(key, byte => byte.toString(16).padStart(2, '0')).join('')}`).toString().padStart(TAIL_LENGTH, '0');
}

export function accordIdentity(author) {
  const key = parseAuthor(author);
  if (key === null) return null;
  const tail = tailOf(key);
  return { author, key, short: shortAuthor(author), name: nicknameOf(key), tail, tag: tail.slice(-4) };
}

// `name #tag` for an author whose key spells a nickname, its short form for one that spells none, `fallback` for a non-author.
export function identityTitle(author, fallback = '') {
  const identity = accordIdentity(author);
  if (identity === null) return fallback;
  return identity.name === '' ? identity.short : `${identity.name} #${identity.tag}`;
}

// For each `{ stem, tail }`, the suffix of its decimal tail to show: `minDigits` at least, and as many more as it takes to differ
// from every other entry of the same non-empty stem. A suffix is one digit longer than the longest one it shares with another.
// Entries with the same whole tail are one person and never lengthen each other. '' for a tail that is not decimal digits.
export function disambiguateTails(entries, { minDigits = 4 } = {}) {
  if (!Number.isInteger(minDigits) || minDigits < 1) throw new RangeError('minDigits is a positive integer');
  const list = [...entries];
  return list.map(({ stem, tail }) => {
    if (typeof tail !== 'string' || !DIGITS.test(tail)) return '';
    let digits = Math.min(minDigits, tail.length);
    if (typeof stem === 'string' && stem !== '') {
      for (const other of list) {
        if (other.stem !== stem || typeof other.tail !== 'string' || !DIGITS.test(other.tail) || other.tail === tail) continue;
        const limit = Math.min(tail.length, other.tail.length);
        let same = 0;
        while (same < limit && tail[tail.length - 1 - same] === other.tail[other.tail.length - 1 - same]) same++;
        digits = Math.max(digits, Math.min(tail.length, same + 1));
      }
    }
    return tail.slice(-digits);
  });
}

// Map of each valid author in `authors` (once) to its title: `name #suffix` with the suffix of disambiguateTails among those of
// the same nickname, or its short form when its key spells no nickname.
export function identityTitles(authors, { minDigits = 4 } = {}) {
  const identities = [...new Set(authors)].map(accordIdentity).filter(identity => identity !== null);
  const named = identities.filter(({ name }) => name !== '');
  const suffixes = disambiguateTails(named.map(({ name, tail }) => ({ stem: name, tail })), { minDigits });
  const titles = new Map(identities.filter(({ name }) => name === '').map(({ author, short }) => [author, short]));
  named.forEach(({ author, name }, i) => titles.set(author, `${name} #${suffixes[i]}`));
  return new Map(identities.map(({ author }) => [author, titles.get(author)]));
}

// A 5×5 grid, mirrored left to right (`grid[r][c] === grid[r][4 - c]`), 8 to 18 cells lit, the same for the same input always:
// from the bytes of a Uint8Array, of a valid author, or else the code points of its text. FNV-1a seeds, mulberry32 draws.
export function identiconPattern(input) {
  let bytes;
  if (input instanceof Uint8Array) bytes = input;
  else {
    const text = String(input ?? '');
    bytes = parseAuthor(text) ?? [...text].map(ch => ch.codePointAt(0));
  }
  let seed = 0x811c9dc5;
  for (const byte of bytes) seed = Math.imul(seed ^ byte, 0x01000193) >>> 0;
  for (;;) {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const draw = (t ^ (t >>> 14)) >>> 0;
    const grid = Array.from({ length: 5 }, (_, r) => {
      const half = [0, 1, 2].map(c => ((draw >>> (r * 3 + c)) & 1) === 1);
      return [half[0], half[1], half[2], half[1], half[0]];
    });
    const active = grid.flat().filter(Boolean).length;
    if (active >= 8 && active <= 18) return grid;
  }
}
